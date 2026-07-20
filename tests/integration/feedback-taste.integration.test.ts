import {
  errorEnvelopeSchema,
  feedbackEventSchema,
  feedbackPersistedEventSchema,
  musicSearchResponseSchema,
  profileSchema,
  sessionBootstrapResponseSchema,
  tasteResponseSchema,
  type CreateFeedbackCommand,
  type SessionBootstrapResponse,
} from "@koradio/contracts";
import "@fastify/websocket";
import { Buffer } from "node:buffer";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import {
  createFeedbackRepository,
  createFeedbackService,
} from "../../apps/server/src/modules/feedback/index.js";
import { createTasteRepository } from "../../apps/server/src/modules/taste/index.js";

const origin = "http://127.0.0.1:49373";
const programId = "44444444-4444-4444-8444-444444444444";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

interface TestAppContext {
  app: Awaited<ReturnType<typeof createApp>>;
  dataRoot: string;
}

async function createTestApp(): Promise<TestAppContext> {
  const parent = await mkdtemp(join(tmpdir(), "koradio-feedback-taste-"));
  const dataRoot = join(parent, "data");
  const config: RuntimeConfig = {
    environment: "test",
    host: "127.0.0.1",
    port: 49373,
    webPort: 5173,
    providerMode: "mock",
    strictPort: true,
    dataRoot,
    initialDataRoot: dataRoot,
    dataRootBootstrapPath: join(parent, "bootstrap.json"),
    webRoot: "unused-in-test",
  };
  const app = await createApp({
    config,
    selectedPort: config.port,
    programFeedbackTargets: {
      programExists(_profileId, candidateProgramId) {
        return candidateProgramId === programId;
      },
    },
  });
  openApps.push(app);
  return { app, dataRoot };
}

async function bootstrapSession(
  app: Awaited<ReturnType<typeof createApp>>,
): Promise<SessionBootstrapResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/session/bootstrap",
    headers: { origin },
  });
  return sessionBootstrapResponseSchema.parse(response.json<unknown>());
}

function authorizedHeaders(session: SessionBootstrapResponse): Record<string, string> {
  return {
    authorization: `Bearer ${session.accessToken}`,
    origin,
  };
}

function decodeSocketMessage(message: Buffer | ArrayBuffer | Buffer[]): unknown {
  const serialized = Array.isArray(message)
    ? Buffer.concat(message).toString("utf8")
    : message instanceof ArrayBuffer
      ? Buffer.from(message).toString("utf8")
      : message.toString("utf8");
  return JSON.parse(serialized) as unknown;
}

function nextSocketMessage(
  connection: Awaited<ReturnType<TestAppContext["app"]["injectWS"]>>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    connection.once("message", (message) => {
      try {
        resolve(decodeSocketMessage(message));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to decode event"));
      }
    });
  });
}

async function createProfile(
  app: Awaited<ReturnType<typeof createApp>>,
  headers: Record<string, string>,
  key: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/profiles",
    headers: { ...headers, "idempotency-key": key },
    payload: { radioName: `Taste ${key.slice(-3)}`, nickname: "Klein" },
  });
  expect(response.statusCode).toBe(201);
  return profileSchema.parse(response.json<unknown>());
}

async function searchTrack(
  app: Awaited<ReturnType<typeof createApp>>,
  headers: Record<string, string>,
  profileId: string,
  keyword: string,
) {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/profiles/${profileId}/music-searches`,
    headers,
    payload: { keyword },
  });
  expect(response.statusCode).toBe(200);
  const track = musicSearchResponseSchema.parse(response.json<unknown>()).items[0];
  if (track === undefined) {
    throw new Error("Mock search did not return a track");
  }
  return track;
}

async function persistFeedback(
  app: Awaited<ReturnType<typeof createApp>>,
  headers: Record<string, string>,
  profileId: string,
  key: string,
  command: CreateFeedbackCommand,
) {
  return app.inject({
    method: "POST",
    url: `/api/v1/profiles/${profileId}/feedback-events`,
    headers: { ...headers, "idempotency-key": key },
    payload: command,
  });
}

describe("S3-03 Feedback and Taste memory backend", () => {
  it("appends, replays, deduplicates and rebuilds isolated taste memory", async () => {
    const context = await createTestApp();
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);
    const firstProfile = await createProfile(context.app, headers, "feedback-profile-001");
    const secondProfile = await createProfile(context.app, headers, "feedback-profile-002");
    const firstTrack = await searchTrack(context.app, headers, firstProfile.id, "Space");
    const secondTrack = await searchTrack(context.app, headers, firstProfile.id, "M83");
    const commands: CreateFeedbackCommand[] = [
      { type: "track_liked", targetId: firstTrack.id },
      { type: "track_like_removed", targetId: firstTrack.id },
      { type: "track_liked", targetId: firstTrack.id },
      { type: "track_disliked", targetId: secondTrack.id },
      { type: "track_dislike_removed", targetId: secondTrack.id },
      { type: "track_disliked", targetId: secondTrack.id },
      { type: "program_favorited", targetId: programId },
      { type: "program_favorite_removed", targetId: programId },
      { type: "program_favorited", targetId: programId },
      { type: "track_skipped", targetId: firstTrack.id },
    ];
    const persisted = [];
    const connection = await context.app.injectWS("/api/v1/events", { headers: { origin } });
    const healthEventPromise = nextSocketMessage(connection);
    connection.send(
      JSON.stringify({
        type: "session.authenticate",
        accessToken: session.accessToken,
      }),
    );
    await healthEventPromise;
    const feedbackPersistedPromise = nextSocketMessage(connection);

    for (const [index, command] of commands.entries()) {
      const response = await persistFeedback(
        context.app,
        headers,
        firstProfile.id,
        `feedback-event-${String(index + 1).padStart(3, "0")}`,
        command,
      );
      expect(response.statusCode).toBe(201);
      persisted.push(feedbackEventSchema.parse(response.json<unknown>()));
    }
    const persistedEvent = feedbackPersistedEventSchema.parse(await feedbackPersistedPromise);
    expect(persistedEvent).toMatchObject({
      eventType: "feedback.persisted",
      profileId: firstProfile.id,
      correlationId: firstProfile.id,
      sequence: 1,
      payload: persisted[0],
    });
    connection.close();

    const repeated = await persistFeedback(
      context.app,
      headers,
      firstProfile.id,
      "feedback-event-001",
      { type: "track_disliked", targetId: secondTrack.id },
    );
    expect(feedbackEventSchema.parse(repeated.json<unknown>())).toEqual(persisted[0]);

    const concurrent = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        persistFeedback(
          context.app,
          headers,
          firstProfile.id,
          `feedback-concurrent-${String(index)}`,
          {
            type: "track_skipped",
            targetId: firstTrack.id,
          },
        ),
      ),
    );
    expect(concurrent.every((response) => response.statusCode === 201)).toBe(true);

    const initialTasteResponse = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${firstProfile.id}/taste`,
      headers,
    });
    const initialTaste = tasteResponseSchema.parse(initialTasteResponse.json<unknown>());
    expect(initialTaste.projection).toMatchObject({
      profileId: firstProfile.id,
      tags: [],
      affinities: [`program:${programId}`, `track:${firstTrack.id}`],
      avoidSignals: [`track:${secondTrack.id}`],
      sourceVersion: 16,
    });
    expect(initialTaste.effective).toMatchObject({
      projectionVersion: 16,
      overrideVersion: 0,
    });

    const updateTasteResponse = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/${firstProfile.id}/taste`,
      headers,
      payload: {
        tags: ["ambient"],
        avoidRules: [`track:${firstTrack.id}`],
        sceneRules: ["夜晚写作"],
      },
    });
    expect(updateTasteResponse.statusCode).toBe(200);
    const updatedTaste = tasteResponseSchema.parse(updateTasteResponse.json<unknown>());
    expect(updatedTaste.projection).toEqual(initialTaste.projection);
    expect(updatedTaste.effective).toEqual({
      profileId: firstProfile.id,
      projectionVersion: 16,
      overrideVersion: 1,
      resolvedTaste: {
        tags: ["ambient"],
        affinities: [`program:${programId}`],
        avoidRules: [`track:${firstTrack.id}`, `track:${secondTrack.id}`],
        sceneRules: ["夜晚写作"],
      },
    });

    const isolatedTasteResponse = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${secondProfile.id}/taste`,
      headers,
    });
    expect(tasteResponseSchema.parse(isolatedTasteResponse.json<unknown>())).toMatchObject({
      projection: {
        profileId: secondProfile.id,
        sourceVersion: 0,
        affinities: [],
        avoidSignals: [],
      },
      effective: {
        profileId: secondProfile.id,
        projectionVersion: 0,
        overrideVersion: 0,
      },
    });

    const unknownTarget = await persistFeedback(
      context.app,
      headers,
      firstProfile.id,
      "feedback-target-missing",
      { type: "track_liked", targetId: "99999999-9999-4999-8999-999999999999" },
    );
    expect(unknownTarget.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(unknownTarget.json<unknown>())).toMatchObject({
      code: "FEEDBACK_TARGET_NOT_FOUND",
    });

    const database = new DatabaseSync(join(context.dataRoot, "koradio.sqlite"));
    try {
      database.exec(`
        CREATE TRIGGER fail_taste_overrides
        BEFORE UPDATE ON taste_overrides
        BEGIN
          SELECT RAISE(ABORT, 'taste override write failed');
        END;
      `);
      const failedTasteWrite = await context.app.inject({
        method: "PATCH",
        url: `/api/v1/profiles/${firstProfile.id}/taste`,
        headers,
        payload: {
          tags: ["should-not-persist"],
          avoidRules: [],
          sceneRules: [],
        },
      });
      expect(failedTasteWrite.statusCode).toBe(500);
      expect(errorEnvelopeSchema.parse(failedTasteWrite.json<unknown>())).toMatchObject({
        code: "TASTE_WRITE_FAILED",
        retryable: true,
      });
      database.exec("DROP TRIGGER fail_taste_overrides");

      const rolledBackTasteResponse = await context.app.inject({
        method: "GET",
        url: `/api/v1/profiles/${firstProfile.id}/taste`,
        headers,
      });
      const rolledBackTaste = tasteResponseSchema.parse(rolledBackTasteResponse.json<unknown>());
      expect(rolledBackTaste.overrides).toEqual(updatedTaste.overrides);
      expect(rolledBackTaste.effective).toEqual(updatedTaste.effective);

      database.exec(`
        CREATE TRIGGER fail_feedback_projection
        BEFORE UPDATE ON taste_projection
        BEGIN
          SELECT RAISE(ABORT, 'projection write failed');
        END;
      `);
      const failedWrite = await persistFeedback(
        context.app,
        headers,
        firstProfile.id,
        "feedback-transaction-failure",
        { type: "track_skipped", targetId: firstTrack.id },
      );
      expect(failedWrite.statusCode).toBe(500);
      expect(errorEnvelopeSchema.parse(failedWrite.json<unknown>())).toMatchObject({
        code: "FEEDBACK_WRITE_FAILED",
        retryable: true,
      });
      database.exec("DROP TRIGGER fail_feedback_projection");

      expect(
        database
          .prepare(
            "SELECT COUNT(*) AS count, MAX(replay_order) AS max_replay_order FROM feedback_event WHERE profile_id = ?",
          )
          .get(firstProfile.id),
      ).toEqual({
        count: 16,
        max_replay_order: 16,
      });
      expect(
        database
          .prepare("SELECT source_version FROM taste_projection WHERE profile_id = ?")
          .get(firstProfile.id),
      ).toEqual({ source_version: 16 });
      expect(
        database
          .prepare("SELECT version FROM taste_overrides WHERE profile_id = ?")
          .get(firstProfile.id),
      ).toEqual({ version: 1 });

      database
        .prepare(
          `
            UPDATE taste_projection
            SET affinities_json = '["corrupt"]', avoid_signals_json = '[]', source_version = 999
            WHERE profile_id = ?
          `,
        )
        .run(firstProfile.id);
      const feedbackService = createFeedbackService({
        client: database,
        repository: createFeedbackRepository(database),
        targets: {
          programExists: () => true,
          trackExists: () => true,
        },
        tasteRepository: createTasteRepository(database),
      });
      expect(feedbackService.rebuildProjection(firstProfile.id)).toEqual(initialTaste.projection);
    } finally {
      database.close();
    }

    const rebuiltTasteResponse = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${firstProfile.id}/taste`,
      headers,
    });
    const rebuiltTaste = tasteResponseSchema.parse(rebuiltTasteResponse.json<unknown>());
    expect(rebuiltTaste.projection).toEqual(initialTaste.projection);
    expect(rebuiltTaste.overrides).toEqual(updatedTaste.overrides);
    expect(rebuiltTaste.effective).toEqual(updatedTaste.effective);
  });
});
