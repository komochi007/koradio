import {
  audioResolutionSchema,
  errorEnvelopeSchema,
  jobAcceptedResponseSchema,
  libraryItemSchema,
  libraryListResponseSchema,
  musicSearchResponseSchema,
  playlistImportSnapshotSchema,
  profileSchema,
  sessionBootstrapResponseSchema,
  trackLyricsSchema,
  type PlaylistImportSnapshot,
  type SessionBootstrapResponse,
} from "@koradio/contracts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import {
  createMockMusicProvider,
  type MusicProvider,
} from "../../apps/server/src/modules/library/index.js";

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

interface TestAppContext {
  app: Awaited<ReturnType<typeof createApp>>;
  dataRoot: string;
}

async function createTestApp(musicProvider?: MusicProvider): Promise<TestAppContext> {
  const parent = await mkdtemp(join(tmpdir(), "koradio-library-domain-"));
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
    ...(musicProvider === undefined ? {} : { musicProvider }),
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

async function createProfile(
  app: Awaited<ReturnType<typeof createApp>>,
  headers: Record<string, string>,
  key: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/profiles",
    headers: { ...headers, "idempotency-key": key },
    payload: { radioName: `Library ${key.slice(-12)}`, nickname: "Klein" },
  });
  expect(response.statusCode).toBe(201);
  return profileSchema.parse(response.json<unknown>());
}

async function search(
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
  return musicSearchResponseSchema.parse(response.json<unknown>());
}

async function waitForImport(
  app: Awaited<ReturnType<typeof createApp>>,
  headers: Record<string, string>,
  profileId: string,
  jobId: string,
): Promise<PlaylistImportSnapshot> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profileId}/playlist-imports/${jobId}`,
      headers,
    });
    const snapshot = playlistImportSnapshotSchema.parse(response.json<unknown>());
    if (snapshot.status === "succeeded" || snapshot.status === "failed") {
      return snapshot;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Playlist import did not finish");
}

describe("S3-02 Library backend", () => {
  it("searches normalized tracks, adds idempotently and keeps profile libraries isolated", async () => {
    const context = await createTestApp();
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);
    const firstProfile = await createProfile(context.app, headers, "library-profile-001");
    const secondProfile = await createProfile(context.app, headers, "library-profile-002");

    const space = await search(context.app, headers, firstProfile.id, "Space");
    const midnight = await search(context.app, headers, firstProfile.id, "M83");
    expect(space.items).toHaveLength(1);
    expect(midnight.items).toHaveLength(1);
    expect(space.items[0]).not.toHaveProperty("playUrl");

    const firstAdd = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${firstProfile.id}/library-items`,
      headers: { ...headers, "idempotency-key": "library-add-001" },
      payload: { trackId: space.items[0]?.id },
    });
    const repeatedAdd = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${firstProfile.id}/library-items`,
      headers: { ...headers, "idempotency-key": "library-add-001" },
      payload: { trackId: midnight.items[0]?.id },
    });
    expect(firstAdd.statusCode).toBe(201);
    expect(repeatedAdd.statusCode).toBe(201);
    expect(libraryItemSchema.parse(repeatedAdd.json<unknown>())).toEqual(
      libraryItemSchema.parse(firstAdd.json<unknown>()),
    );

    const secondAdd = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${firstProfile.id}/library-items`,
      headers: { ...headers, "idempotency-key": "library-add-002" },
      payload: { trackId: midnight.items[0]?.id },
    });
    expect(secondAdd.statusCode).toBe(201);

    const firstPage = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${firstProfile.id}/library?limit=1`,
      headers,
    });
    const page = libraryListResponseSchema.parse(firstPage.json<unknown>());
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeDefined();

    const nextPage = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${firstProfile.id}/library?limit=1&cursor=${page.nextCursor ?? ""}`,
      headers,
    });
    expect(libraryListResponseSchema.parse(nextPage.json<unknown>()).items).toHaveLength(1);

    const isolated = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${secondProfile.id}/library`,
      headers,
    });
    expect(libraryListResponseSchema.parse(isolated.json<unknown>()).items).toEqual([]);

    const badCursor = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${firstProfile.id}/library?cursor=YWJj`,
      headers,
    });
    expect(badCursor.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(badCursor.json<unknown>()).code).toBe(
      "LIBRARY_CURSOR_INVALID",
    );
  });

  it("imports playlists asynchronously, reports partial availability and persists no play URL", async () => {
    const context = await createTestApp();
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);
    const profile = await createProfile(context.app, headers, "library-import-profile");

    const accepted = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/playlist-imports`,
      headers: { ...headers, "idempotency-key": "playlist-import-001" },
      payload: { playlistRef: "mock-playlist-001" },
    });
    const repeated = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/playlist-imports`,
      headers: { ...headers, "idempotency-key": "playlist-import-001" },
      payload: { playlistRef: "ignored-repeat" },
    });
    expect(accepted.statusCode).toBe(202);
    expect(repeated.statusCode).toBe(202);
    const job = jobAcceptedResponseSchema.parse(accepted.json<unknown>());
    expect(jobAcceptedResponseSchema.parse(repeated.json<unknown>())).toEqual(job);

    const snapshot = await waitForImport(context.app, headers, profile.id, job.jobId);
    expect(snapshot).toMatchObject({
      status: "succeeded",
      playlistRef: "mock-playlist-001",
      progress: { total: 3, processed: 3, imported: 2, unavailable: 1 },
    });
    expect(snapshot.playlistSource).toMatchObject({
      source: "netease",
      sourcePlaylistId: "mock-playlist-001",
      availableTrackCount: 2,
      unavailableTrackCount: 1,
    });

    const library = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/library`,
      headers,
    });
    expect(libraryListResponseSchema.parse(library.json<unknown>()).items).toHaveLength(2);

    const database = new DatabaseSync(join(context.dataRoot, "koradio.sqlite"));
    try {
      expect(database.prepare("SELECT COUNT(*) AS count FROM music_track").get()).toEqual({
        count: 2,
      });
      const schema = database
        .prepare(
          "SELECT group_concat(sql, ' ') AS sql FROM sqlite_master WHERE type IN ('table', 'index')",
        )
        .get() as { sql: string };
      expect(schema.sql).not.toContain("resolved_audio");
      expect(schema.sql).not.toContain("play_url");
    } finally {
      database.close();
    }
  });

  it("caches lyrics and short-lived audio references while rejecting malicious provider data", async () => {
    const mock = createMockMusicProvider();
    let lyricCalls = 0;
    let audioCalls = 0;
    const provider: MusicProvider = {
      source: "netease",
      search(keyword) {
        if (keyword === "malicious") {
          return Promise.resolve({ items: [{ cookie: "secret" }] });
        }
        if (keyword === "unavailable") {
          return Promise.reject(new Error("provider offline"));
        }
        return mock.search(keyword);
      },
      importPlaylist(playlistRef) {
        if (playlistRef === "malicious-playlist") {
          return Promise.resolve({ source: "netease", tracks: [], cookie: "secret" });
        }
        return mock.importPlaylist(playlistRef);
      },
      getLyrics(sourceTrackId) {
        lyricCalls += 1;
        return mock.getLyrics(sourceTrackId);
      },
      resolveAudio(sourceTrackId) {
        audioCalls += 1;
        if (sourceTrackId === "mock-midnight-city") {
          return Promise.resolve({
            resolvedAudioRef: "https://127.0.0.1/private.m4a",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
        }
        return mock.resolveAudio(sourceTrackId);
      },
    };
    const context = await createTestApp(provider);
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);
    const profile = await createProfile(context.app, headers, "library-provider-profile");
    const found = await search(context.app, headers, profile.id, "Space");
    const trackId = found.items[0]?.id ?? "";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const lyrics = await context.app.inject({
        method: "GET",
        url: `/api/v1/profiles/${profile.id}/tracks/${trackId}/lyrics`,
        headers,
      });
      expect(trackLyricsSchema.parse(lyrics.json<unknown>()).status).toBe("available");

      const audio = await context.app.inject({
        method: "POST",
        url: `/api/v1/profiles/${profile.id}/tracks/${trackId}/audio-resolutions`,
        headers,
      });
      expect(audio.headers["cache-control"]).toBe("no-store");
      expect(audioResolutionSchema.parse(audio.json<unknown>()).resolvedAudioRef).toMatch(
        /^https:\/\//,
      );
    }
    expect(lyricCalls).toBe(1);
    expect(audioCalls).toBe(1);

    const maliciousSearch = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/music-searches`,
      headers,
      payload: { keyword: "malicious" },
    });
    expect(maliciousSearch.statusCode).toBe(502);
    expect(errorEnvelopeSchema.parse(maliciousSearch.json<unknown>())).toMatchObject({
      code: "MUSIC_PROVIDER_RESPONSE_INVALID",
      retryable: true,
    });

    const unavailableSearch = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/music-searches`,
      headers,
      payload: { keyword: "unavailable" },
    });
    expect(unavailableSearch.statusCode).toBe(503);
    expect(errorEnvelopeSchema.parse(unavailableSearch.json<unknown>()).code).toBe(
      "MUSIC_PROVIDER_UNAVAILABLE",
    );

    const invalidImport = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/playlist-imports`,
      headers: { ...headers, "idempotency-key": "malicious-playlist-import" },
      payload: { playlistRef: "malicious-playlist" },
    });
    const invalidJob = jobAcceptedResponseSchema.parse(invalidImport.json<unknown>());
    expect(await waitForImport(context.app, headers, profile.id, invalidJob.jobId)).toMatchObject({
      status: "failed",
      errorCode: "MUSIC_PROVIDER_RESPONSE_INVALID",
    });

    const midnight = await search(context.app, headers, profile.id, "M83");
    const unsafeAudio = await context.app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/tracks/${midnight.items[0]?.id ?? ""}/audio-resolutions`,
      headers,
    });
    expect(unsafeAudio.statusCode).toBe(502);
    expect(errorEnvelopeSchema.parse(unsafeAudio.json<unknown>()).code).toBe(
      "MUSIC_PROVIDER_RESPONSE_INVALID",
    );
  });
});
