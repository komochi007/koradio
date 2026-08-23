import { Buffer } from "node:buffer";
import { z } from "zod";

import {
  providerCallOptionsSchema,
  ttsSynthesisCommandSchema,
  ttsSynthesisResultSchema,
  type TtsProvider,
  type TtsSynthesisResult,
} from "../modules/programs/index.js";
import type { LocalFileStore } from "../platform/files/index.js";
import type { SafeLogger } from "../platform/logging/index.js";
import {
  createTtsHelperClient,
  TtsHelperClientError,
  type TtsHelperClient,
} from "./tts-helper-client.js";
import type { TtsModelService } from "./tts-model.js";

const maximumTtsAudioBytes = 25 * 1_048_576;
const maximumTtsOutputBytes = 35 * 1_048_576;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const helperSynthesisSchema = z
  .strictObject({
    audioBase64: z.string().min(1).max(maximumTtsOutputBytes),
    extension: z.enum(["aiff", "caf", "m4a", "wav"]),
    mimeType: z.enum([
      "audio/aiff",
      "audio/x-aiff",
      "audio/x-caf",
      "audio/mp4",
      "audio/x-m4a",
      "audio/wav",
      "audio/x-wav",
    ]),
    durationMs: z
      .number()
      .int()
      .positive()
      .max(10 * 60_000),
    markers: z
      .array(
        z.strictObject({
          startMs: z.number().int().nonnegative(),
          endMs: z.number().int().positive(),
          text: z.string().trim().min(1).max(500),
        }),
      )
      .max(500),
  })
  .superRefine((value, context) => {
    let previousEnd = 0;
    for (const [index, marker] of value.markers.entries()) {
      if (
        marker.startMs >= marker.endMs ||
        marker.endMs > value.durationMs ||
        marker.startMs < previousEnd
      ) {
        context.addIssue({
          code: "custom",
          message: "TTS markers must be ordered within the audio duration",
          path: ["markers", index],
        });
      }
      previousEnd = marker.endMs;
    }
  });

export type TtsAdapterErrorCode =
  | "cancelled"
  | "configuration_invalid"
  | "helper_unavailable"
  | "output_invalid"
  | "storage_unavailable"
  | "timeout"
  | "voice_unavailable";

export class TtsAdapterError extends Error {
  readonly code: TtsAdapterErrorCode;

  constructor(code: TtsAdapterErrorCode) {
    super(
      {
        cancelled: "TTS synthesis was cancelled",
        configuration_invalid: "TTS helper configuration is invalid",
        helper_unavailable: "TTS helper is unavailable",
        output_invalid: "TTS helper returned invalid output",
        storage_unavailable: "TTS audio could not be stored",
        timeout: "TTS synthesis timed out",
        voice_unavailable: "The requested system voice is unavailable",
      }[code],
    );
    this.name = "TtsAdapterError";
    this.code = code;
  }
}

export interface CreateTtsAdapterOptions {
  client?: TtsHelperClient;
  fileStore: Pick<LocalFileStore, "put">;
  helperPath: string;
  logger?: Pick<SafeLogger, "warn">;
  maximumOutputBytes?: number;
  modelService: TtsModelService;
  pythonPath: string;
  runtimeDirectory: string;
  timeoutMs?: number;
}

function decodeAudio(value: string): Buffer {
  if (!base64Pattern.test(value)) {
    throw new TtsAdapterError("output_invalid");
  }
  const content = Buffer.from(value, "base64");
  if (
    content.byteLength === 0 ||
    content.byteLength > maximumTtsAudioBytes ||
    content.toString("base64") !== value
  ) {
    throw new TtsAdapterError("output_invalid");
  }
  return content;
}

function hasValidAudioSignature(content: Buffer, extension: string): boolean {
  if (extension === "wav") {
    return (
      content.subarray(0, 4).toString("ascii") === "RIFF" &&
      content.subarray(8, 12).toString("ascii") === "WAVE"
    );
  }
  if (extension === "aiff") {
    const format = content.subarray(8, 12).toString("ascii");
    return (
      content.subarray(0, 4).toString("ascii") === "FORM" &&
      (format === "AIFF" || format === "AIFC")
    );
  }
  if (extension === "caf") {
    return content.subarray(0, 4).toString("ascii") === "caff";
  }
  return content.subarray(4, 8).toString("ascii") === "ftyp";
}

function mapHelperError(error: TtsHelperClientError): TtsAdapterError {
  if (error.code === "cancelled") {
    return new TtsAdapterError("cancelled");
  }
  if (error.code === "timeout") {
    return new TtsAdapterError("timeout");
  }
  return new TtsAdapterError(
    error.code === "output_invalid" ? "output_invalid" : "helper_unavailable",
  );
}

function canRetryHelperSynthesis(
  error: unknown,
  signal: AbortSignal | undefined,
): error is TtsHelperClientError {
  return (
    signal?.aborted !== true &&
    error instanceof TtsHelperClientError &&
    (error.code === "timeout" || error.code === "helper_unavailable")
  );
}

export type ClosableTtsProvider = TtsProvider & { close(): Promise<void> };

export function createTtsAdapter(options: CreateTtsAdapterOptions): ClosableTtsProvider {
  const client =
    options.client ??
    createTtsHelperClient({
      helperPath: options.helperPath,
      maximumOutputBytes: options.maximumOutputBytes ?? maximumTtsOutputBytes,
      modelDirectory: options.modelService.modelDirectory,
      pythonPath: options.pythonPath,
      runtimeDirectory: options.runtimeDirectory,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });

  return {
    async synthesize(command, callOptions) {
      const parsedCommand = ttsSynthesisCommandSchema.safeParse(command);
      const parsedOptions = providerCallOptionsSchema.safeParse(callOptions);
      if (!parsedCommand.success || !parsedOptions.success) {
        throw new TtsAdapterError("configuration_invalid");
      }

      try {
        if (options.modelService.getStatus().state !== "ready") {
          throw new TtsAdapterError("helper_unavailable");
        }
        const helperCommand = {
          language: parsedCommand.data.language,
          text: parsedCommand.data.text,
          voiceStyle: parsedCommand.data.voiceStyle,
        } as const;
        let synthesisResult: Awaited<ReturnType<TtsHelperClient["synthesize"]>>;
        try {
          synthesisResult = await client.synthesize(helperCommand, {
            ...(callOptions.signal === undefined ? {} : { signal: callOptions.signal }),
          });
        } catch (error) {
          if (!canRetryHelperSynthesis(error, callOptions.signal)) throw error;
          options.logger?.warn("provider.tts.retrying", {
            code: error.code,
            correlationId: parsedOptions.data.correlationId,
          });
          synthesisResult = await client.synthesize(helperCommand, {
            ...(callOptions.signal === undefined ? {} : { signal: callOptions.signal }),
          });
        }
        const synthesis = helperSynthesisSchema.safeParse(synthesisResult);
        if (!synthesis.success) {
          throw new TtsAdapterError("output_invalid");
        }
        const content = decodeAudio(synthesis.data.audioBase64);
        if (!hasValidAudioSignature(content, synthesis.data.extension)) {
          throw new TtsAdapterError("output_invalid");
        }

        let stored: Awaited<ReturnType<LocalFileStore["put"]>>;
        try {
          stored = await options.fileStore.put({
            content,
            extension: synthesis.data.extension,
            mimeType: synthesis.data.mimeType,
            namespace: "tts",
          });
        } catch {
          throw new TtsAdapterError("storage_unavailable");
        }
        const result: TtsSynthesisResult = ttsSynthesisResultSchema.parse({
          audioRef: stored.reference,
          durationMs: synthesis.data.durationMs,
          markers: synthesis.data.markers,
          estimatedTiming: synthesis.data.markers.length === 0,
        });
        return result;
      } catch (error) {
        const mapped =
          error instanceof TtsHelperClientError
            ? mapHelperError(error)
            : error instanceof TtsAdapterError
              ? error
              : new TtsAdapterError("helper_unavailable");
        options.logger?.warn("provider.tts.failed", {
          code: mapped.code,
          correlationId: parsedOptions.data.correlationId,
        });
        throw mapped;
      }
    },
    close() {
      return client.close();
    },
  };
}
