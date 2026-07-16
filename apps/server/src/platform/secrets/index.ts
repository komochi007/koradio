import { spawn } from "node:child_process";

const defaultKeychainService = "app.koradio.secrets";
const secretIdentifierPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const maximumSecretLength = 8_192;
const maximumCommandOutputBytes = 1_048_576;

export type SecretStoreErrorCode =
  | "invalid_secret_identifier"
  | "invalid_secret_value"
  | "not_found"
  | "unavailable"
  | "access_denied"
  | "operation_failed";

const secretStoreErrorMessages: Record<SecretStoreErrorCode, string> = {
  invalid_secret_identifier: "Secret identifier is invalid",
  invalid_secret_value: "Secret value is invalid",
  not_found: "Secret was not found",
  unavailable: "OS Credential Store is unavailable",
  access_denied: "OS Credential Store access was denied",
  operation_failed: "OS Credential Store operation failed",
};

export class SecretStoreError extends Error {
  readonly code: SecretStoreErrorCode;

  constructor(code: SecretStoreErrorCode) {
    super(secretStoreErrorMessages[code]);
    this.name = "SecretStoreError";
    this.code = code;
  }
}

export interface SecretReference {
  key: string;
  store: "os-credential-store";
}

export interface SecretStore {
  delete(identifier: string): Promise<void>;
  get(identifier: string): Promise<string | undefined>;
  has(identifier: string): Promise<boolean>;
  set(identifier: string, secret: string): Promise<SecretReference>;
}

export interface SecurityCommandInvocation {
  args: readonly string[];
  executable: string;
  input?: string;
  timeoutMs: number;
}

export interface SecurityCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export type SecurityCommandRunner = (
  invocation: SecurityCommandInvocation,
) => Promise<SecurityCommandResult>;

export interface CreateMacOsKeychainSecretStoreOptions {
  platform?: NodeJS.Platform;
  runner?: SecurityCommandRunner;
  securityExecutable?: string;
  service?: string;
  timeoutMs?: number;
}

function validateSecretIdentifier(identifier: string): string {
  if (
    identifier.length === 0 ||
    identifier.length > 128 ||
    !secretIdentifierPattern.test(identifier)
  ) {
    throw new SecretStoreError("invalid_secret_identifier");
  }

  return identifier;
}

function validateSecretValue(secret: string): string {
  if (
    secret.length === 0 ||
    secret.length > maximumSecretLength ||
    secret.includes("\0") ||
    secret.includes("\n") ||
    secret.includes("\r")
  ) {
    throw new SecretStoreError("invalid_secret_value");
  }

  return secret;
}

function appendBoundedOutput(current: string, chunk: Buffer): string {
  const remainingBytes = maximumCommandOutputBytes - Buffer.byteLength(current);
  if (remainingBytes <= 0) {
    return current;
  }

  return current + chunk.subarray(0, remainingBytes).toString("utf8");
}

export const runSecurityCommand: SecurityCommandRunner = async (
  invocation,
): Promise<SecurityCommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, [...invocation.args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, invocation.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendBoundedOutput(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBoundedOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new SecretStoreError("unavailable"));
        return;
      }

      resolve({
        exitCode: exitCode ?? 1,
        stderr,
        stdout,
      });
    });

    child.stdin.end(invocation.input === undefined ? undefined : `${invocation.input}\n`);
  });

function isNotFound(result: SecurityCommandResult): boolean {
  return result.exitCode === 44 || result.stderr.toLowerCase().includes("could not be found");
}

function mapCommandFailure(result: SecurityCommandResult): SecretStoreError {
  const diagnostic = result.stderr.toLowerCase();

  if (isNotFound(result)) {
    return new SecretStoreError("not_found");
  }

  if (
    diagnostic.includes("interaction is not allowed") ||
    diagnostic.includes("no keychain") ||
    diagnostic.includes("not available")
  ) {
    return new SecretStoreError("unavailable");
  }

  if (
    diagnostic.includes("user canceled") ||
    diagnostic.includes("user cancelled") ||
    diagnostic.includes("denied")
  ) {
    return new SecretStoreError("access_denied");
  }

  return new SecretStoreError("operation_failed");
}

export function createMacOsKeychainSecretStore(
  options: CreateMacOsKeychainSecretStoreOptions = {},
): SecretStore {
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? runSecurityCommand;
  const executable = options.securityExecutable ?? "/usr/bin/security";
  const service = validateSecretIdentifier(options.service ?? defaultKeychainService);
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function execute(args: readonly string[], input?: string): Promise<SecurityCommandResult> {
    if (platform !== "darwin") {
      throw new SecretStoreError("unavailable");
    }

    try {
      return await runner({
        args,
        executable,
        ...(input === undefined ? {} : { input }),
        timeoutMs,
      });
    } catch (error) {
      if (error instanceof SecretStoreError) {
        throw error;
      }

      throw new SecretStoreError("unavailable");
    }
  }

  return {
    async delete(identifier) {
      const account = validateSecretIdentifier(identifier);
      const result = await execute(["delete-generic-password", "-a", account, "-s", service]);

      if (result.exitCode !== 0 && !isNotFound(result)) {
        throw mapCommandFailure(result);
      }
    },
    async get(identifier) {
      const account = validateSecretIdentifier(identifier);
      const result = await execute(["find-generic-password", "-a", account, "-s", service, "-w"]);

      if (isNotFound(result)) {
        return undefined;
      }
      if (result.exitCode !== 0) {
        throw mapCommandFailure(result);
      }

      return result.stdout.replace(/\r?\n$/, "");
    },
    async has(identifier) {
      const account = validateSecretIdentifier(identifier);
      const result = await execute(["find-generic-password", "-a", account, "-s", service]);

      if (isNotFound(result)) {
        return false;
      }
      if (result.exitCode !== 0) {
        throw mapCommandFailure(result);
      }

      return true;
    },
    async set(identifier, secret) {
      const account = validateSecretIdentifier(identifier);
      const value = validateSecretValue(secret);
      const encodedValue = Buffer.from(value, "utf8").toString("hex");
      const result = await execute(
        ["-i"],
        `add-generic-password -U -a ${account} -s ${service} -X ${encodedValue}`,
      );

      if (result.exitCode !== 0) {
        throw mapCommandFailure(result);
      }

      return {
        key: account,
        store: "os-credential-store",
      };
    },
  };
}
