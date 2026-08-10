import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

import {
  radioSpeechGenerationSchema,
  type ProfilePreferences,
  type RadioSpeechGeneration,
} from "@koradio/contracts";
import { z } from "zod";

import type { TtsProvider } from "../programs/index.js";
import { ttsSynthesisResultSchema } from "../programs/index.js";
import { parseSqliteRow } from "../../platform/db/rows.js";

const rowSchema = z.object({
  id: z.string(),
  profile_id: z.string(),
  message_id: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  audio_ref: z.string().nullable(),
  duration_ms: z.number().nullable(),
  error_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
const messageRowSchema = z.object({ content: z.string(), role: z.literal("assistant") });

function mapRow(row: z.infer<typeof rowSchema>): RadioSpeechGeneration {
  return radioSpeechGenerationSchema.parse({
    jobId: row.id,
    profileId: row.profile_id,
    messageId: row.message_id,
    status: row.status,
    audioRef: row.audio_ref,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class RadioSpeechGenerationNotFoundError extends Error {}
export class RadioSpeechMessageNotFoundError extends Error {}

interface RadioSpeechRepository {
  create(
    id: string,
    profileId: string,
    messageId: string,
    idempotencyKey: string,
    at: string,
  ): { created: boolean; snapshot: RadioSpeechGeneration };
  fail(id: string, code: string, at: string): void;
  findMessage(profileId: string, messageId: string): string | null;
  get(profileId: string, id: string): RadioSpeechGeneration | null;
  recover(at: string): void;
  running(id: string, at: string): void;
  succeed(id: string, audioRef: string, durationMs: number, at: string): void;
}

export function createRadioSpeechRepository(client: DatabaseSync): RadioSpeechRepository {
  const byId = client.prepare(
    "SELECT * FROM radio_speech_generation WHERE profile_id = ? AND id = ?",
  );
  const byKey = client.prepare(
    "SELECT * FROM radio_speech_generation WHERE profile_id = ? AND idempotency_key = ?",
  );
  const message = client.prepare(
    "SELECT content, role FROM radio_message WHERE profile_id = ? AND id = ? AND role = 'assistant'",
  );
  const insert = client.prepare(`
    INSERT INTO radio_speech_generation (
      id, profile_id, message_id, idempotency_key, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'queued', ?, ?)
  `);
  return {
    create(id, profileId, messageId, idempotencyKey, at) {
      const existing = byKey.get(profileId, idempotencyKey);
      if (existing !== undefined) {
        return { created: false, snapshot: mapRow(parseSqliteRow(rowSchema, existing)) };
      }
      insert.run(id, profileId, messageId, idempotencyKey, at, at);
      return {
        created: true,
        snapshot: mapRow(parseSqliteRow(rowSchema, byId.get(profileId, id))),
      };
    },
    fail(id, code, at) {
      client
        .prepare(
          "UPDATE radio_speech_generation SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ?",
        )
        .run(code, at, id);
    },
    findMessage(profileId, messageId) {
      const value = message.get(profileId, messageId);
      return value === undefined ? null : parseSqliteRow(messageRowSchema, value).content;
    },
    get(profileId, id) {
      const value = byId.get(profileId, id);
      return value === undefined ? null : mapRow(parseSqliteRow(rowSchema, value));
    },
    recover(at) {
      client
        .prepare(
          "UPDATE radio_speech_generation SET status = 'failed', error_code = 'RADIO_SPEECH_INTERRUPTED', updated_at = ? WHERE status IN ('queued', 'running')",
        )
        .run(at);
    },
    running(id, at) {
      client
        .prepare(
          "UPDATE radio_speech_generation SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'",
        )
        .run(at, id);
    },
    succeed(id, audioRef, durationMs, at) {
      client
        .prepare(
          "UPDATE radio_speech_generation SET status = 'succeeded', audio_ref = ?, duration_ms = ?, error_code = NULL, updated_at = ? WHERE id = ?",
        )
        .run(audioRef, durationMs, at, id);
    },
  };
}

export function createRadioSpeechService(options: {
  now?: () => Date;
  preferences: { get(profileId: string): ProfilePreferences };
  randomId?: () => string;
  repository: RadioSpeechRepository;
  tts: TtsProvider;
}) {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;
  const active = new Map<string, AbortController>();
  options.repository.recover(now().toISOString());

  return {
    close(): Promise<void> {
      for (const controller of active.values()) controller.abort();
      active.clear();
      return Promise.resolve();
    },
    get(profileId: string, jobId: string): RadioSpeechGeneration {
      const snapshot = options.repository.get(profileId, jobId);
      if (snapshot === null) throw new RadioSpeechGenerationNotFoundError();
      return snapshot;
    },
    start(profileId: string, messageId: string, idempotencyKey: string): RadioSpeechGeneration {
      const content = options.repository.findMessage(profileId, messageId);
      if (content === null) throw new RadioSpeechMessageNotFoundError();
      const id = randomId();
      const created = options.repository.create(
        id,
        profileId,
        messageId,
        idempotencyKey,
        now().toISOString(),
      );
      if (!created.created) return created.snapshot;
      const controller = new AbortController();
      active.set(id, controller);
      void Promise.resolve()
        .then(async () => {
          options.repository.running(id, now().toISOString());
          const preferences = options.preferences.get(profileId);
          const result = ttsSynthesisResultSchema.parse(
            await options.tts.synthesize(
              {
                text: content,
                language: preferences.djLanguage,
                voiceStyle: preferences.djVoiceStyle,
              },
              { correlationId: id, signal: controller.signal },
            ),
          );
          if (!controller.signal.aborted) {
            options.repository.succeed(id, result.audioRef, result.durationMs, now().toISOString());
          }
        })
        .catch(() => {
          options.repository.fail(id, "RADIO_SPEECH_UNAVAILABLE", now().toISOString());
        })
        .finally(() => {
          active.delete(id);
        });
      return created.snapshot;
    },
  };
}
