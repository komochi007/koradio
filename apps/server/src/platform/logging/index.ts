import { Buffer } from "node:buffer";

const redacted = "[REDACTED]";
const circular = "[CIRCULAR]";
const maximumDepth = 8;
const eventPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const sensitiveKeys = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "body",
  "content",
  "cookie",
  "credential",
  "djtext",
  "key",
  "lyrics",
  "password",
  "prompt",
  "raw",
  "rawoutput",
  "scenario",
  "secret",
  "token",
  "transcript",
]);

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface SafeLogEntry {
  data?: unknown;
  event: string;
  level: LogLevel;
  occurredAt: string;
}

export interface SafeLogSink {
  write(entry: SafeLogEntry): void;
}

export interface SafeLogger {
  debug(event: string, data?: Readonly<Record<string, unknown>>): void;
  error(event: string, data?: Readonly<Record<string, unknown>>): void;
  info(event: string, data?: Readonly<Record<string, unknown>>): void;
  warn(event: string, data?: Readonly<Record<string, unknown>>): void;
}

export interface CreateSafeLoggerOptions {
  now?: () => Date;
  secretValues?: readonly string[];
  sink: SafeLogSink;
}

export interface JsonLineOutput {
  write(chunk: string): unknown;
}

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  return (
    sensitiveKeys.has(normalized) ||
    /(?:accesstoken|apikey|cookie|credential|password|privatekey|secret|token)$/.test(normalized)
  );
}

function redactString(value: string, secretValues: readonly string[]): string {
  let sanitized = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${redacted}`)
    .replace(
      /([?&](?:access_token|token|api_key|key|cookie|password|secret)=)[^&#\s]+/gi,
      `$1${redacted}`,
    )
    .replace(
      /("(?:access_token|token|api_key|key|cookie|password|secret)"\s*:\s*")[^"]*(")/gi,
      `$1${redacted}$2`,
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi, `$1${redacted}@`)
    .replace(/(\/Users\/)[^/\s]+/g, `$1${redacted}`)
    .replace(/(\/home\/)[^/\s]+/g, `$1${redacted}`)
    .replace(/([A-Za-z]:\\Users\\)[^\\\s]+/g, `$1${redacted}`);

  for (const secret of secretValues) {
    if (secret.length > 0) {
      sanitized = sanitized.split(secret).join(redacted);
    }
  }

  return sanitized;
}

function redactValue(
  value: unknown,
  secretValues: readonly string[],
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    return redactString(value, secretValues);
  }
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return String(value);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `[REDACTED_BINARY:${String(value.byteLength)} bytes]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URL) {
    return redactString(value.toString(), secretValues);
  }
  if (value instanceof Error) {
    const errorData: Record<string, unknown> = {
      message: redactString(value.message, secretValues),
      name: value.name,
    };
    if ("code" in value && typeof value.code === "string") {
      errorData.code = value.code;
    }
    return errorData;
  }
  if (depth >= maximumDepth) {
    return "[MAX_DEPTH]";
  }
  if (seen.has(value)) {
    return circular;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secretValues, seen, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key)
      ? redacted
      : redactValue(item, secretValues, seen, depth + 1);
  }
  return sanitized;
}

export function redactLogData(value: unknown, secretValues: readonly string[] = []): unknown {
  return redactValue(
    value,
    [...secretValues].sort((left, right) => right.length - left.length),
    new WeakSet(),
    0,
  );
}

export function createJsonLineLogSink(output: JsonLineOutput = process.stdout): SafeLogSink {
  return {
    write(entry) {
      output.write(`${JSON.stringify(entry)}\n`);
    },
  };
}

export function createSafeLogger(options: CreateSafeLoggerOptions): SafeLogger {
  const now = options.now ?? (() => new Date());
  const secretValues = options.secretValues ?? [];

  function write(level: LogLevel, event: string, data?: Readonly<Record<string, unknown>>): void {
    const entry: SafeLogEntry = {
      event: eventPattern.test(event) ? event : "logging.invalid_event",
      level,
      occurredAt: now().toISOString(),
      ...(data === undefined ? {} : { data: redactLogData(data, secretValues) }),
    };
    options.sink.write(entry);
  }

  return {
    debug(event, data) {
      write("debug", event, data);
    },
    error(event, data) {
      write("error", event, data);
    },
    info(event, data) {
      write("info", event, data);
    },
    warn(event, data) {
      write("warn", event, data);
    },
  };
}
