import { Buffer } from "node:buffer";

import type { FastifyPluginAsync } from "fastify";

import type { RuntimeConfig } from "../config.js";
import { FileStoreError, type LocalFileStore } from "../../platform/files/index.js";
import { sendApiError } from "./api-error.js";

const ttsFileNamePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:aiff|caf|m4a|wav)$/u;
const avatarFileNamePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/u;
const mockMediaFileNames = new Set(
  Array.from(
    { length: 24 },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}.wav`,
  ),
);

function createMockWave(): Buffer {
  const sampleRate = 8_000;
  const sampleCount = sampleRate;
  const dataSize = sampleCount * 2;
  const content = Buffer.alloc(44 + dataSize);
  content.write("RIFF", 0);
  content.writeUInt32LE(36 + dataSize, 4);
  content.write("WAVEfmt ", 8);
  content.writeUInt32LE(16, 16);
  content.writeUInt16LE(1, 20);
  content.writeUInt16LE(1, 22);
  content.writeUInt32LE(sampleRate, 24);
  content.writeUInt32LE(sampleRate * 2, 28);
  content.writeUInt16LE(2, 32);
  content.writeUInt16LE(16, 34);
  content.write("data", 36);
  content.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(1, index / 400, (sampleCount - index) / 400);
    const sample = Math.sin((2 * Math.PI * 220 * index) / sampleRate) * envelope * 2_400;
    content.writeInt16LE(Math.round(sample), 44 + index * 2);
  }
  return content;
}

function ttsMimeType(fileName: string): string {
  if (fileName.endsWith(".aiff")) return "audio/aiff";
  if (fileName.endsWith(".caf")) return "audio/x-caf";
  if (fileName.endsWith(".m4a")) return "audio/mp4";
  return "audio/wav";
}

function avatarMimeType(fileName: string): string {
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function createMediaRoutes(options: {
  fileStore: LocalFileStore;
  providerMode: RuntimeConfig["providerMode"];
}): FastifyPluginAsync {
  return async (app) => {
    app.get("/avatars/:fileName", async (request, reply) => {
      const params = request.params as { fileName?: unknown };
      if (
        request.headers["sec-fetch-site"] !== "same-origin" ||
        typeof params.fileName !== "string" ||
        !avatarFileNamePattern.test(params.fileName)
      ) {
        return sendApiError(
          reply,
          403,
          "AVATAR_ACCESS_DENIED",
          "Avatar access is not allowed",
          false,
        );
      }
      try {
        const content = await options.fileStore.read(`avatars/${params.fileName}`);
        reply.header("Cache-Control", "no-store");
        reply.header("Cross-Origin-Resource-Policy", "same-origin");
        reply.header("X-Content-Type-Options", "nosniff");
        return await reply.type(avatarMimeType(params.fileName)).send(content);
      } catch (error) {
        if (error instanceof FileStoreError) {
          return sendApiError(reply, 404, "AVATAR_NOT_FOUND", "Avatar was not found", false);
        }
        throw error;
      }
    });

    app.get("/tts/:fileName", async (request, reply) => {
      const params = request.params as { fileName?: unknown };
      if (
        request.headers["sec-fetch-site"] !== "same-origin" ||
        typeof params.fileName !== "string" ||
        !ttsFileNamePattern.test(params.fileName)
      ) {
        return sendApiError(
          reply,
          403,
          "MEDIA_ACCESS_DENIED",
          "Media access is not allowed",
          false,
        );
      }
      if (
        options.providerMode === "mock" &&
        params.fileName === "00000000-0000-4000-8000-000000000001.wav"
      ) {
        reply.header("Cache-Control", "no-store");
        reply.header("Cross-Origin-Resource-Policy", "same-origin");
        reply.header("X-Content-Type-Options", "nosniff");
        return await reply.type("audio/wav").send(createMockWave());
      }
      try {
        const content = await options.fileStore.read(`tts/${params.fileName}`);
        reply.header("Cache-Control", "no-store");
        reply.header("Cross-Origin-Resource-Policy", "same-origin");
        reply.header("X-Content-Type-Options", "nosniff");
        return await reply.type(ttsMimeType(params.fileName)).send(content);
      } catch (error) {
        if (error instanceof FileStoreError) {
          return sendApiError(reply, 404, "MEDIA_NOT_FOUND", "Media was not found", false);
        }
        throw error;
      }
    });

    app.get("/media/:fileName", async (request, reply) => {
      const params = request.params as { fileName?: unknown };
      if (
        request.headers["sec-fetch-site"] !== "same-origin" ||
        options.providerMode !== "mock" ||
        typeof params.fileName !== "string" ||
        !mockMediaFileNames.has(params.fileName)
      ) {
        return sendApiError(
          reply,
          403,
          "MEDIA_ACCESS_DENIED",
          "Media access is not allowed",
          false,
        );
      }
      reply.header("Cache-Control", "no-store");
      reply.header("Cross-Origin-Resource-Policy", "same-origin");
      reply.header("X-Content-Type-Options", "nosniff");
      return await reply.type("audio/wav").send(createMockWave());
    });
    await app.after();
  };
}
