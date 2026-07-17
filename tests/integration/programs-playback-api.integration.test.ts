import {
  errorEnvelopeSchema,
  feedbackEventSchema,
  musicSearchResponseSchema,
  playbackCheckpointSchema,
  profileSchema,
  programDetailSchema,
  programListResponseSchema,
  sessionBootstrapResponseSchema,
  tasteResponseSchema,
  type SessionBootstrapResponse,
} from "@koradio/contracts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import {
  createLibraryRepository,
  createLibraryService,
  createMockMusicProvider,
} from "../../apps/server/src/modules/library/index.js";
import {
  createPlaybackRepository,
  createPlaybackTimelineService,
} from "../../apps/server/src/modules/playback/index.js";
import {
  createProgramRepository,
  createProgramService,
} from "../../apps/server/src/modules/programs/index.js";
import { bootstrapDatabase } from "../../apps/server/src/platform/db/database.js";
import { ids } from "../contract/v1-contract-fixtures.js";

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

function createConfig(parent: string): RuntimeConfig {
  const dataRoot = join(parent, "data");
  return {
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

describe("S3-04 Programs and Playback REST", () => {
  it("serves history, checkpoints and real Program feedback ownership", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-programs-api-"));
    const config = createConfig(parent);
    const setupApp = await createApp({ config, selectedPort: config.port });
    const setupSession = await bootstrapSession(setupApp);
    const setupHeaders = authorizedHeaders(setupSession);
    const profileResponse = await setupApp.inject({
      method: "POST",
      url: "/api/v1/profiles",
      headers: { ...setupHeaders, "idempotency-key": "program-api-profile-001" },
      payload: { radioName: "Night Signals", nickname: "Klein" },
    });
    const profile = profileSchema.parse(profileResponse.json<unknown>());
    const searchResponse = await setupApp.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/music-searches`,
      headers: setupHeaders,
      payload: { keyword: "Space" },
    });
    const track = musicSearchResponseSchema.parse(searchResponse.json<unknown>()).items[0];
    if (track === undefined) {
      throw new Error("Mock search did not return a track");
    }
    await setupApp.close();

    const database = await bootstrapDatabase({ dataRoot: config.dataRoot });
    const library = createLibraryService({
      provider: createMockMusicProvider(),
      repository: createLibraryRepository(database.client),
    });
    const playbackRepository = createPlaybackRepository(database.client);
    const programs = createProgramService({
      client: database.client,
      repository: createProgramRepository(database.client),
      timeline: createPlaybackTimelineService(playbackRepository),
      tracks: library,
    });
    const createdAt = "2026-07-17T04:00:00.000Z";
    const detail = programDetailSchema.parse({
      program: {
        id: ids.program,
        profileId: profile.id,
        scenarioText: "夜晚写作",
        title: "Monday Night Exhale",
        status: "ready",
        trackIds: [track.id],
        createdAt,
      },
      djScripts: [
        {
          id: ids.segment,
          programId: ids.program,
          type: "intro",
          language: "zh-CN",
          text: "今晚适合慢一点。",
          displayText: "今晚适合慢一点。",
          estimatedTiming: true,
          ttsAudioRef: null,
        },
      ],
      tracks: [track],
      timeline: [
        {
          id: ids.timelineTrack,
          kind: "track",
          position: 0,
          trackId: track.id,
          resolvedAudioRef: "media/program/space-song.m4a",
          durationMs: track.durationMs,
        },
      ],
    });
    programs.commit(detail);
    await library.close();
    database.close();

    const app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);
    const session = await bootstrapSession(app);
    const headers = authorizedHeaders(session);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/programs?limit=20`,
      headers,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(programListResponseSchema.parse(listResponse.json<unknown>())).toEqual({
      items: [detail.program],
    });
    const invalidCursor = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/programs?cursor=***`,
      headers,
    });
    expect(invalidCursor.statusCode).toBe(400);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/programs/${ids.program}`,
      headers,
    });
    expect(programDetailSchema.parse(detailResponse.json<unknown>())).toEqual(detail);

    const noCheckpoint = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/playback`,
      headers,
    });
    expect(noCheckpoint.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(noCheckpoint.json<unknown>()).code).toBe(
      "PLAYBACK_SNAPSHOT_NOT_FOUND",
    );

    const checkpointResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/profiles/${profile.id}/playback/checkpoints`,
      headers,
      payload: {
        profileId: profile.id,
        programId: ids.program,
        timelineItemId: ids.timelineTrack,
        positionMs: 1000,
        volume: 0.8,
        status: "paused",
        leaseEpoch: 7,
      },
    });
    expect(checkpointResponse.statusCode).toBe(200);
    const checkpoint = playbackCheckpointSchema.parse(checkpointResponse.json<unknown>());
    expect(checkpoint).toMatchObject({ positionMs: 1000, status: "paused" });

    const restoredCheckpoint = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/playback`,
      headers,
    });
    expect(playbackCheckpointSchema.parse(restoredCheckpoint.json<unknown>())).toEqual(checkpoint);

    const staleCheckpoint = await app.inject({
      method: "PUT",
      url: `/api/v1/profiles/${profile.id}/playback/checkpoints`,
      headers,
      payload: {
        profileId: profile.id,
        programId: ids.program,
        timelineItemId: ids.timelineTrack,
        positionMs: 2000,
        volume: 0.8,
        status: "playing",
        leaseEpoch: 6,
      },
    });
    expect(staleCheckpoint.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(staleCheckpoint.json<unknown>()).code).toBe(
      "PLAYBACK_LEASE_STALE",
    );

    const completedCheckpoint = await app.inject({
      method: "PUT",
      url: `/api/v1/profiles/${profile.id}/playback/checkpoints`,
      headers,
      payload: {
        profileId: profile.id,
        programId: ids.program,
        timelineItemId: ids.timelineTrack,
        positionMs: track.durationMs,
        volume: 0.8,
        status: "completed",
        leaseEpoch: 8,
      },
    });
    expect(playbackCheckpointSchema.parse(completedCheckpoint.json<unknown>()).status).toBe(
      "completed",
    );
    const completedProgramResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/programs/${ids.program}`,
      headers,
    });
    expect(programDetailSchema.parse(completedProgramResponse.json<unknown>()).program.status).toBe(
      "completed",
    );

    const favoriteResponse = await app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/feedback-events`,
      headers: { ...headers, "idempotency-key": "program-favorite-real-owner" },
      payload: { type: "program_favorited", targetId: ids.program },
    });
    expect(favoriteResponse.statusCode).toBe(201);
    expect(feedbackEventSchema.parse(favoriteResponse.json<unknown>())).toMatchObject({
      type: "program_favorited",
      targetId: ids.program,
    });
    const tasteResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/taste`,
      headers,
    });
    expect(tasteResponseSchema.parse(tasteResponse.json<unknown>()).projection.affinities).toEqual([
      `program:${ids.program}`,
    ]);
  });
});
