import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  jobAcceptedResponseSchema,
  profileSchema,
  programDetailSchema,
  programGenerationSnapshotSchema,
  type ProgramGenerationSnapshot,
  type SessionBootstrapResponse,
  type V1Event,
} from "@koradio/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import type { MusicProvider } from "../../apps/server/src/modules/library/index.js";
import {
  createLibraryRepository,
  createLibraryService,
} from "../../apps/server/src/modules/library/index.js";
import {
  createPlaybackRepository,
  createPlaybackTimelineService,
} from "../../apps/server/src/modules/playback/index.js";
import { createProfilePreferencesService } from "../../apps/server/src/modules/profile-preferences/index.js";
import {
  createProgramGenerationRepository,
  createProgramGenerationService,
  createProgramRepository,
  createProgramService,
  type CodexProvider,
  type TtsProvider,
} from "../../apps/server/src/modules/programs/index.js";
import {
  createProfileRepository,
  createProfileService,
} from "../../apps/server/src/modules/profiles/index.js";
import {
  createTasteDefaultsService,
  createTasteRepository,
  createTasteService,
} from "../../apps/server/src/modules/taste/index.js";
import { bootstrapDatabase } from "../../apps/server/src/platform/db/database.js";
import {
  s3GenerationPlanFixture,
  s3GenerationScenario,
  s3InvalidGenerationPlanFixture,
  s3LyricsFixture,
  s3LyricsUnavailableFixture,
  s3PrimaryTrackFixture,
  s3SecondaryTrackFixture,
  s3TtsFixture,
} from "../fixtures/program-generation.js";

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

interface MusicFixtureOptions {
  audioUnavailable?: string[];
  lyricsUnavailable?: string[];
  searchEmpty?: boolean;
  searchInvocations?: string[];
  tracks?: Array<typeof s3PrimaryTrackFixture | typeof s3SecondaryTrackFixture>;
}

function createFixtureMusicProvider(options: MusicFixtureOptions = {}): MusicProvider {
  const tracks = options.tracks ?? [s3PrimaryTrackFixture];
  const audioUnavailable = new Set(options.audioUnavailable ?? []);
  const lyricsUnavailable = new Set(options.lyricsUnavailable ?? []);

  return {
    source: "netease",
    search(keyword) {
      options.searchInvocations?.push(keyword);
      return Promise.resolve({
        items: options.searchEmpty === true || keyword !== "S3 playable" ? [] : tracks,
      });
    },
    importPlaylist(playlistRef) {
      return Promise.resolve({
        source: "netease",
        sourcePlaylistId: playlistRef,
        title: "S3 Fixture Playlist",
        tracks,
      });
    },
    getLyrics(sourceTrackId) {
      return Promise.resolve(
        lyricsUnavailable.has(sourceTrackId) ? s3LyricsUnavailableFixture : s3LyricsFixture,
      );
    },
    resolveAudio(sourceTrackId) {
      if (audioUnavailable.has(sourceTrackId)) {
        return Promise.reject(new Error("fixture audio unavailable"));
      }
      return Promise.resolve({
        resolvedAudioRef: `https://media.example.invalid/s3/${sourceTrackId}.m4a`,
        expiresAt: "2099-01-01T00:00:00.000Z",
      });
    },
  };
}

function createFixtureCodexProvider(plan: unknown = s3GenerationPlanFixture): CodexProvider {
  return {
    plan() {
      return Promise.resolve(plan);
    },
  };
}

function createFixtureTtsProvider(): TtsProvider {
  return {
    synthesize() {
      return Promise.resolve(s3TtsFixture);
    },
  };
}

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
  return response.json<SessionBootstrapResponse>();
}

async function waitForTerminalSnapshot(
  app: Awaited<ReturnType<typeof createApp>>,
  profileId: string,
  jobId: string,
  authorization: string,
): Promise<ProgramGenerationSnapshot> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profileId}/program-generations/${jobId}`,
      headers: { authorization, origin },
    });
    const snapshot = programGenerationSnapshotSchema.parse(response.json<unknown>());
    if (snapshot.status !== "queued" && snapshot.status !== "running") {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("S3 fixture generation did not finish");
}

function tableCount(client: DatabaseSync, table: string): number {
  const row = client.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
    { count: number } | undefined;
  return row?.count ?? -1;
}

function readProgramSnapshot(client: DatabaseSync) {
  return {
    programs: tableCount(client, "program"),
    tracks: tableCount(client, "program_track"),
    scripts: tableCount(client, "dj_script_segment"),
    timeline: tableCount(client, "playback_timeline_item"),
  };
}

interface HarnessOptions {
  codex?: CodexProvider;
  music?: MusicProvider;
  tts?: TtsProvider | null;
}

async function createHarness(options: HarnessOptions = {}) {
  const dataRoot = await mkdtemp(join(tmpdir(), "koradio-s3-07-"));
  const database = await bootstrapDatabase({ dataRoot });
  const preferences = createProfilePreferencesService({ client: database.client });
  const profiles = createProfileService({
    avatarReferences: { validate: () => Promise.resolve() },
    client: database.client,
    preferences,
    repository: createProfileRepository(database.client),
    tasteDefaults: createTasteDefaultsService(database.client),
  });
  const profile = await profiles.create(
    { radioName: "S3 Fixture Radio", nickname: "Fixture" },
    "s3-07-profile",
  );
  const taste = createTasteService({ repository: createTasteRepository(database.client) });
  const library = createLibraryService({
    provider: options.music ?? createFixtureMusicProvider(),
    repository: createLibraryRepository(database.client),
  });
  const playbackRepository = createPlaybackRepository(database.client);
  const programs = createProgramService({
    client: database.client,
    repository: createProgramRepository(database.client),
    timeline: createPlaybackTimelineService(playbackRepository),
    tracks: library,
  });
  const repository = createProgramGenerationRepository(database.client);
  const events: V1Event[] = [];
  const generation = createProgramGenerationService({
    codex: options.codex ?? createFixtureCodexProvider(),
    events: { publish: (event) => events.push(event) },
    library,
    now: () => new Date("2026-07-17T12:00:00.000Z"),
    preferences,
    programs,
    randomId: (() => {
      let sequence = 1;
      return () => `30000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
    })(),
    repository,
    taste,
    ...(options.tts === null ? {} : { tts: options.tts ?? createFixtureTtsProvider() }),
  });

  return { database, events, generation, library, profile, programs };
}

async function closeHarness(harness: Awaited<ReturnType<typeof createHarness>>) {
  await harness.generation.close();
  await harness.library.close();
  harness.database.close();
}

describe("S3-07 deterministic Mock Provider backend loop", () => {
  it("accepts a scenario through REST and atomically persists a playable Program snapshot", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-s3-07-api-"));
    const config = createConfig(parent);
    const searchInvocations: string[] = [];
    const app = await createApp({
      codexProvider: createFixtureCodexProvider(),
      config,
      musicProvider: createFixtureMusicProvider({ searchInvocations }),
      selectedPort: config.port,
      ttsProvider: createFixtureTtsProvider(),
    });
    openApps.push(app);
    const session = await bootstrapSession(app);
    const authorization = `Bearer ${session.accessToken}`;
    const profileResponse = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      headers: { authorization, origin, "idempotency-key": "s3-07-api-profile" },
      payload: { radioName: "S3 Fixture Radio", nickname: "Fixture" },
    });
    const profile = profileSchema.parse(profileResponse.json<unknown>());
    const acceptedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/program-generations`,
      headers: { authorization, origin, "idempotency-key": "s3-07-api-generation" },
      payload: { scenarioText: s3GenerationScenario },
    });
    expect(acceptedResponse.statusCode).toBe(202);
    const accepted = jobAcceptedResponseSchema.parse(acceptedResponse.json<unknown>());
    const terminal = await waitForTerminalSnapshot(app, profile.id, accepted.jobId, authorization);
    expect(terminal).toMatchObject({ status: "succeeded", stage: "completed", sequence: 4 });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/programs/${terminal.programId ?? ""}`,
      headers: { authorization, origin },
    });
    const detail = programDetailSchema.parse(detailResponse.json<unknown>());
    expect(detail.program).toMatchObject({
      profileId: profile.id,
      scenarioText: s3GenerationScenario,
      title: s3GenerationPlanFixture.programTitle,
      status: "ready",
    });
    expect(detail.djScripts).toEqual([
      expect.objectContaining({ type: "intro", text: s3GenerationPlanFixture.djScripts[0].text }),
    ]);
    expect(detail.timeline.map((item) => item.kind)).toEqual(["dj", "track"]);
    expect(searchInvocations).toEqual(["S3 first empty", "S3 second empty", "S3 playable"]);

    openApps.splice(openApps.indexOf(app), 1);
    await app.close();
    const client = new DatabaseSync(join(config.dataRoot, "koradio.sqlite"), { readOnly: true });
    expect(readProgramSnapshot(client)).toEqual({
      programs: 1,
      tracks: 1,
      scripts: 1,
      timeline: 2,
    });
    expect(
      client
        .prepare(
          "SELECT status, stage, program_id AS programId, error_code AS errorCode, sequence FROM program_generation_job",
        )
        .get(),
    ).toEqual({
      status: "succeeded",
      stage: "completed",
      programId: terminal.programId,
      errorCode: null,
      sequence: 4,
    });
    expect(
      client
        .prepare("SELECT kind, position FROM playback_timeline_item ORDER BY position ASC")
        .all(),
    ).toEqual([
      { kind: "dj", position: 0 },
      { kind: "track", position: 1 },
    ]);
    client.close();
  });

  it("blocks provider errors and invalid plans without replacing the last committed Program", async () => {
    let mode: "success" | "provider-error" | "invalid" = "success";
    const codex: CodexProvider = {
      plan() {
        if (mode === "provider-error") {
          return Promise.reject(new Error("fixture Codex unavailable"));
        }
        return Promise.resolve(
          mode === "invalid" ? s3InvalidGenerationPlanFixture : s3GenerationPlanFixture,
        );
      },
    };
    const harness = await createHarness({ codex });
    const succeeded = harness.generation.start(
      harness.profile.id,
      { scenarioText: s3GenerationScenario },
      "s3-07-existing-program",
    );
    await harness.generation.waitForIdle();
    const committed = harness.generation.get(harness.profile.id, succeeded.jobId);
    expect(committed.status).toBe("succeeded");

    mode = "provider-error";
    const providerFailed = harness.generation.start(
      harness.profile.id,
      { scenarioText: "Provider error must keep the old Program" },
      "s3-07-provider-error",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, providerFailed.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_FAILED",
    });

    mode = "invalid";
    const invalid = harness.generation.start(
      harness.profile.id,
      { scenarioText: "Invalid output must keep the old Program" },
      "s3-07-invalid-plan",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, invalid.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_PLAN_INVALID",
    });
    expect(harness.programs.list(harness.profile.id).items).toEqual([
      expect.objectContaining({ id: committed.programId, scenarioText: s3GenerationScenario }),
    ]);
    expect(readProgramSnapshot(harness.database.client)).toEqual({
      programs: 1,
      tracks: 1,
      scripts: 1,
      timeline: 2,
    });
    await closeHarness(harness);
  });

  it("exhausts three deterministic search attempts and refuses an empty Program", async () => {
    const searchInvocations: string[] = [];
    const harness = await createHarness({
      music: createFixtureMusicProvider({ searchEmpty: true, searchInvocations }),
    });
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: s3GenerationScenario },
      "s3-07-search-empty",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, started.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_NO_PLAYABLE_TRACKS",
    });
    expect(searchInvocations).toEqual(["S3 first empty", "S3 second empty", "S3 playable"]);
    expect(readProgramSnapshot(harness.database.client)).toEqual({
      programs: 0,
      tracks: 0,
      scripts: 0,
      timeline: 0,
    });
    await closeHarness(harness);
  });

  it("blocks when every resolved track is unavailable", async () => {
    const harness = await createHarness({
      music: createFixtureMusicProvider({
        audioUnavailable: [s3PrimaryTrackFixture.sourceTrackId],
      }),
    });
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: s3GenerationScenario },
      "s3-07-all-tracks-unavailable",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, started.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_NO_PLAYABLE_TRACKS",
    });
    expect(harness.events.map((event) => event.eventType)).toEqual([
      "generation.planned",
      "generation.degraded",
    ]);
    expect(readProgramSnapshot(harness.database.client)).toEqual({
      programs: 0,
      tracks: 0,
      scripts: 0,
      timeline: 0,
    });
    await closeHarness(harness);
  });

  it("degrades failed tracks, missing lyrics and unavailable TTS to a text-only playable Program", async () => {
    const harness = await createHarness({
      music: createFixtureMusicProvider({
        audioUnavailable: [s3SecondaryTrackFixture.sourceTrackId],
        lyricsUnavailable: [s3PrimaryTrackFixture.sourceTrackId],
        tracks: [s3PrimaryTrackFixture, s3SecondaryTrackFixture],
      }),
      tts: null,
    });
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: s3GenerationScenario },
      "s3-07-degraded",
    );
    await harness.generation.waitForIdle();
    const terminal = harness.generation.get(harness.profile.id, started.jobId);
    expect(terminal).toMatchObject({ status: "succeeded", stage: "completed", sequence: 7 });
    const degraded = harness.events.filter((event) => event.eventType === "generation.degraded");
    expect(degraded.map((event) => event.payload)).toEqual([
      {
        jobId: started.jobId,
        capability: "track",
        code: "PROGRAM_TRACK_UNAVAILABLE",
      },
      {
        jobId: started.jobId,
        capability: "lyrics",
        code: "PROGRAM_LYRICS_UNAVAILABLE",
      },
      {
        jobId: started.jobId,
        capability: "tts",
        code: "PROGRAM_TTS_UNAVAILABLE",
      },
    ]);
    expect(harness.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const detail = harness.programs.get(harness.profile.id, terminal.programId ?? "");
    expect(detail.program.trackIds).toHaveLength(1);
    expect(detail.djScripts).toEqual([
      expect.objectContaining({ type: "intro", ttsAudioRef: null }),
    ]);
    expect(detail.timeline.map((item) => item.kind)).toEqual(["track"]);
    expect(readProgramSnapshot(harness.database.client)).toEqual({
      programs: 1,
      tracks: 1,
      scripts: 1,
      timeline: 1,
    });
    await closeHarness(harness);
  });

  it("rolls back Program, segments, timeline and job success when the commit transaction fails", async () => {
    const harness = await createHarness();
    harness.database.client.exec(`
      CREATE TRIGGER s3_07_fail_timeline
      BEFORE INSERT ON playback_timeline_item
      BEGIN
        SELECT RAISE(ABORT, 's3-07 timeline failure');
      END;
    `);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: s3GenerationScenario },
      "s3-07-transaction-failure",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, started.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_COMMIT_FAILED",
    });
    expect(readProgramSnapshot(harness.database.client)).toEqual({
      programs: 0,
      tracks: 0,
      scripts: 0,
      timeline: 0,
    });
    expect(
      harness.database.client
        .prepare(
          "SELECT status, program_id AS programId, error_code AS errorCode FROM program_generation_job WHERE id = ?",
        )
        .get(started.jobId),
    ).toEqual({
      status: "failed",
      programId: null,
      errorCode: "PROGRAM_GENERATION_COMMIT_FAILED",
    });
    await closeHarness(harness);
  });
});
