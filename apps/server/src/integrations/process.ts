import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

const commandNamePattern = /^[A-Za-z0-9._+-]+$/;

export type ProviderProcessErrorCode =
  "cancelled" | "executable_not_found" | "output_limit_exceeded" | "process_failed" | "timeout";

export class ProviderProcessError extends Error {
  readonly code: ProviderProcessErrorCode;

  constructor(code: ProviderProcessErrorCode) {
    super(
      {
        cancelled: "Provider process was cancelled",
        executable_not_found: "Provider executable is unavailable",
        output_limit_exceeded: "Provider process output exceeded its limit",
        process_failed: "Provider process failed",
        timeout: "Provider process timed out",
      }[code],
    );
    this.name = "ProviderProcessError";
    this.code = code;
  }
}

export interface ProviderProcessInvocation {
  args: readonly string[];
  cwd: string;
  environment?: NodeJS.ProcessEnv;
  executable: string;
  input: string;
  maximumOutputBytes: number;
  signal?: AbortSignal;
  timeoutMs: number;
}

export interface ProviderProcessResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export type ProviderProcessRunner = (
  invocation: ProviderProcessInvocation,
) => Promise<ProviderProcessResult>;

export type ExecutableResolver = (command: string) => Promise<string>;

const providerEnvironmentKeys = [
  "ALL_PROXY",
  "CODEX_HOME",
  "HOME",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LANG",
  "LC_ALL",
  "NO_PROXY",
  "PATH",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TMPDIR",
  "all_proxy",
  "https_proxy",
  "http_proxy",
  "no_proxy",
] as const;

export function createProviderEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of providerEnvironmentKeys) {
    const value = source[key];
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  return environment;
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const metadata = await stat(path);
    await access(path, constants.X_OK);
    return metadata.isFile();
  } catch {
    return false;
  }
}

export async function resolveProviderExecutable(command: string): Promise<string> {
  if (
    command.length === 0 ||
    command.length > 300 ||
    command.includes("\0") ||
    command.includes("\n") ||
    command.includes("\r")
  ) {
    throw new ProviderProcessError("executable_not_found");
  }

  if (command.includes("/")) {
    if (!isAbsolute(command) || !(await isExecutableFile(command))) {
      throw new ProviderProcessError("executable_not_found");
    }
    return command;
  }

  if (!commandNamePattern.test(command)) {
    throw new ProviderProcessError("executable_not_found");
  }

  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    const candidate = join(directory, command);
    if (await isExecutableFile(candidate)) {
      return candidate;
    }
  }

  throw new ProviderProcessError("executable_not_found");
}

function killProcessGroup(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      child.kill(signal);
      return;
    }
  }
  child.kill(signal);
}

function appendOutput(current: string, chunk: Buffer, maximumBytes: number): string {
  const remaining = maximumBytes - Buffer.byteLength(current);
  if (chunk.byteLength > remaining) {
    throw new ProviderProcessError("output_limit_exceeded");
  }
  return current + chunk.toString("utf8");
}

export const runProviderProcess: ProviderProcessRunner = async (
  invocation,
): Promise<ProviderProcessResult> =>
  new Promise((resolve, reject) => {
    if (invocation.signal?.aborted === true) {
      reject(new ProviderProcessError("cancelled"));
      return;
    }

    const child = spawn(invocation.executable, [...invocation.args], {
      cwd: invocation.cwd,
      detached: process.platform !== "win32",
      env: invocation.environment ?? createProviderEnvironment(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    let settled = false;
    let forceKill: ReturnType<typeof setTimeout> | undefined;

    const finishWithError = (error: ProviderProcessError, terminate = false): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      invocation.signal?.removeEventListener("abort", cancel);
      if (terminate) {
        killProcessGroup(child, "SIGTERM");
        forceKill = setTimeout(() => {
          killProcessGroup(child, "SIGKILL");
        }, 1_000);
        forceKill.unref();
      }
      reject(error);
    };
    const cancel = (): void => {
      finishWithError(new ProviderProcessError("cancelled"), true);
    };
    const timeout = setTimeout(() => {
      finishWithError(new ProviderProcessError("timeout"), true);
    }, invocation.timeoutMs);

    invocation.signal?.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdout = appendOutput(stdout, chunk, invocation.maximumOutputBytes);
      } catch {
        finishWithError(new ProviderProcessError("output_limit_exceeded"), true);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      try {
        stderr = appendOutput(stderr, chunk, invocation.maximumOutputBytes);
      } catch {
        finishWithError(new ProviderProcessError("output_limit_exceeded"), true);
      }
    });
    child.on("error", () => {
      finishWithError(new ProviderProcessError("process_failed"));
    });
    child.on("close", (exitCode) => {
      clearTimeout(forceKill);
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      invocation.signal?.removeEventListener("abort", cancel);
      resolve({ exitCode: exitCode ?? 1, stderr, stdout });
    });

    child.stdin.on("error", () => undefined);
    child.stdin.end(invocation.input);
  });
