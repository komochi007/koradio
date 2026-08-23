import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";

import { z } from "zod";

import { createProviderEnvironment, resolveProviderExecutable } from "./process.js";

const helperReadySchema = z.strictObject({
  ready: z.literal(true),
  voices: z.strictObject({
    "zh-CN": z.literal("Serena"),
    "en-GB": z.literal("Ryan"),
  }),
});
const helperResponseSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    id: z.uuid(),
    ok: z.literal(true),
    audioBase64: z.string().min(1),
    extension: z.literal("wav"),
    mimeType: z.literal("audio/wav"),
    durationMs: z.number().int().positive(),
    markers: z.array(z.never()).max(0),
  }),
  z.strictObject({
    id: z.uuid().nullable(),
    ok: z.literal(false),
    code: z.enum(["request_invalid", "generation_failed", "audio_invalid", "helper_failed"]),
  }),
]);

export type TtsHelperFailureCode =
  "cancelled" | "helper_unavailable" | "output_invalid" | "timeout";

export class TtsHelperClientError extends Error {
  readonly code: TtsHelperFailureCode;

  constructor(code: TtsHelperFailureCode) {
    super(code);
    this.name = "TtsHelperClientError";
    this.code = code;
  }
}

export interface TtsHelperSynthesisCommand {
  language: "zh-CN" | "en-GB";
  text: string;
  voiceStyle: "natural-radio";
}

export interface TtsHelperSynthesisResult {
  audioBase64: string;
  durationMs: number;
  extension: "wav";
  markers: [];
  mimeType: "audio/wav";
}

export interface TtsHelperClient {
  synthesize(
    command: TtsHelperSynthesisCommand,
    options?: { signal?: AbortSignal },
  ): Promise<TtsHelperSynthesisResult>;
  close(): Promise<void>;
}

export interface CreateTtsHelperClientOptions {
  helperPath: string;
  maximumOutputBytes?: number;
  modelDirectory: string;
  pythonPath: string;
  runtimeDirectory: string;
  startupTimeoutMs?: number;
  timeoutMs?: number;
}

interface PendingLine {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
}

export function createTtsHelperClient(options: CreateTtsHelperClientOptions): TtsHelperClient {
  const maximumOutputBytes = options.maximumOutputBytes ?? 35 * 1_048_576;
  const startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
  const timeoutMs = options.timeoutMs ?? 75_000;
  let child: ChildProcessWithoutNullStreams | undefined;
  let startup: Promise<void> | undefined;
  let output = Buffer.alloc(0);
  let pendingLine: PendingLine | undefined;
  let queue = Promise.resolve();

  function stop(): void {
    pendingLine?.reject(new TtsHelperClientError("helper_unavailable"));
    pendingLine = undefined;
    startup = undefined;
    output = Buffer.alloc(0);
    if (child !== undefined) {
      child.kill("SIGTERM");
      child = undefined;
    }
  }

  function nextLine(timeout: number): Promise<unknown> {
    return new Promise((resolveLine, rejectLine) => {
      const timer = setTimeout(() => {
        pendingLine = undefined;
        rejectLine(new TtsHelperClientError("timeout"));
        stop();
      }, timeout);
      pendingLine = {
        reject(error) {
          clearTimeout(timer);
          rejectLine(error);
        },
        resolve(value) {
          clearTimeout(timer);
          resolveLine(value);
        },
      };
    });
  }

  function consumeOutput(chunk: Buffer): void {
    output = Buffer.concat([output, chunk]);
    if (output.byteLength > maximumOutputBytes) {
      pendingLine?.reject(new TtsHelperClientError("output_invalid"));
      stop();
      return;
    }
    const newline = output.indexOf(0x0a);
    if (newline === -1 || pendingLine === undefined) {
      return;
    }
    const line = output.subarray(0, newline).toString("utf8");
    output = output.subarray(newline + 1);
    const pending = pendingLine;
    pendingLine = undefined;
    try {
      pending.resolve(JSON.parse(line));
    } catch {
      pending.reject(new TtsHelperClientError("output_invalid"));
      stop();
    }
  }

  async function ensureStarted(): Promise<void> {
    if (child !== undefined && startup === undefined) {
      return;
    }
    if (startup !== undefined) {
      return startup;
    }
    startup = (async () => {
      const executable = await resolveProviderExecutable(options.pythonPath);
      const process = spawn(
        executable,
        [
          resolve(options.helperPath),
          "serve",
          "--model-directory",
          resolve(options.modelDirectory),
        ],
        {
          cwd: resolve(options.runtimeDirectory),
          env: createProviderEnvironment(),
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      child = process;
      process.stdout.on("data", (chunk: Buffer) => {
        consumeOutput(chunk);
      });
      process.stderr.resume();
      process.once("error", () => {
        pendingLine?.reject(new TtsHelperClientError("helper_unavailable"));
        stop();
      });
      process.once("exit", () => {
        pendingLine?.reject(new TtsHelperClientError("helper_unavailable"));
        child = undefined;
        startup = undefined;
      });
      const ready = helperReadySchema.safeParse(await nextLine(startupTimeoutMs));
      if (!ready.success) {
        stop();
        throw new TtsHelperClientError("output_invalid");
      }
      startup = undefined;
    })();
    return startup;
  }

  async function synthesizeNow(
    command: TtsHelperSynthesisCommand,
    signal?: AbortSignal,
  ): Promise<TtsHelperSynthesisResult> {
    if (signal?.aborted === true) {
      throw new TtsHelperClientError("cancelled");
    }
    await ensureStarted();
    if (child === undefined) {
      throw new TtsHelperClientError("helper_unavailable");
    }
    const id = randomUUID();
    const onAbort = () => {
      pendingLine?.reject(new TtsHelperClientError("cancelled"));
      stop();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      child.stdin.write(`${JSON.stringify({ id, command: "synthesize", ...command })}\n`);
      const response = helperResponseSchema.safeParse(await nextLine(timeoutMs));
      if (!response.success || response.data.id !== id) {
        stop();
        throw new TtsHelperClientError("output_invalid");
      }
      if (!response.data.ok) {
        throw new TtsHelperClientError("helper_unavailable");
      }
      return {
        audioBase64: response.data.audioBase64,
        durationMs: response.data.durationMs,
        extension: response.data.extension,
        markers: [],
        mimeType: response.data.mimeType,
      };
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    synthesize(command, callOptions) {
      const operation = queue.then(() => synthesizeNow(command, callOptions?.signal));
      queue = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    async close() {
      await queue;
      stop();
    },
  };
}
