import {
  jobAcceptedResponseSchema,
  profileSchema,
  programGenerationSnapshotSchema,
  type ProgramGenerationSnapshot,
  type SessionBootstrapResponse,
  type V1Event,
} from "@koradio/contracts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import {
  createMockCodexProvider,
  createMockTtsProvider,
} from "../../apps/server/src/integrations/index.js";
import {
  createLibraryRepository,
  createLibraryService,
  createMockMusicProvider,
  type MusicProvider,
  type ProviderTrack,
} from "../../apps/server/src/modules/library/index.js";
import {
  createPlaybackRepository,
  createPlaybackTimelineService,
} from "../../apps/server/src/modules/playback/index.js";
import { createProfilePreferencesService } from "../../apps/server/src/modules/profile-preferences/index.js";
import {
  ProgramGenerationConflictError,
  createProgramGenerationRepository,
  createProgramGenerationService,
  createProgramRepository,
  createProgramService,
  codexPlanningContextSchema,
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

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

function deferred<Value>() {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function createHarness(
  codex: CodexProvider = createMockCodexProvider(),
  timeoutMs = 5_000,
  tts: TtsProvider = createMockTtsProvider(),
  music: MusicProvider = createMockMusicProvider(),
  maximumTracks: number | null = 5,
) {
  const dataRoot = await mkdtemp(join(tmpdir(), "koradio-generation-"));
  const database = await bootstrapDatabase({ dataRoot });
  const preferences = createProfilePreferencesService({ client: database.client });
  const tasteDefaults = createTasteDefaultsService(database.client);
  const profiles = createProfileService({
    avatarReferences: { validate: () => Promise.resolve() },
    client: database.client,
    preferences,
    repository: createProfileRepository(database.client),
    tasteDefaults,
  });
  const profile = await profiles.create(
    { radioName: "Night Signals", nickname: "Klein" },
    "generation-profile-001",
  );
  const taste = createTasteService({ repository: createTasteRepository(database.client) });
  const library = createLibraryService({
    provider: music,
    repository: createLibraryRepository(database.client),
  });
  const playbackRepository = createPlaybackRepository(database.client);
  const programs = createProgramService({
    client: database.client,
    repository: createProgramRepository(database.client),
    timeline: createPlaybackTimelineService(playbackRepository),
    tracks: library,
  });
  const events: V1Event[] = [];
  const repository = createProgramGenerationRepository(database.client);
  const generation = createProgramGenerationService({
    codex,
    events: { publish: (event) => events.push(event) },
    library,
    ...(maximumTracks === null ? {} : { maximumTracks }),
    preferences,
    programs,
    repository,
    taste,
    timeoutMs,
    tts,
  });

  return {
    database,
    events,
    generation,
    library,
    preferences,
    profile,
    programs,
    repository,
    taste,
  };
}

async function closeHarness(harness: Awaited<ReturnType<typeof createHarness>>) {
  await harness.generation.close();
  await harness.library.close();
  harness.database.close();
}

describe("S3-06 Program generation orchestration", () => {
  it("deduplicates requests, fences profile concurrency and publishes ordered completion", async () => {
    let capturedContext: ReturnType<typeof codexPlanningContextSchema.parse> | undefined;
    const codex: CodexProvider = {
      plan(context, options) {
        capturedContext = codexPlanningContextSchema.parse(context);
        return createMockCodexProvider().plan(context, options);
      },
    };
    const harness = await createHarness(codex);
    const command = { scenarioText: "今晚写作，保持安静但不要沉闷" };
    const started = harness.generation.start(harness.profile.id, command, "generation-001");
    const repeated = harness.generation.start(harness.profile.id, command, "generation-001");
    expect(repeated.jobId).toBe(started.jobId);
    expect(() => harness.generation.start(harness.profile.id, command, "generation-002")).toThrow(
      ProgramGenerationConflictError,
    );

    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    expect(snapshot).toMatchObject({
      status: "succeeded",
      stage: "completed",
      sequence: 4,
    });
    expect(snapshot.programId).toBeDefined();
    expect(harness.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(harness.events.map((event) => event.eventType)).toEqual([
      "generation.planned",
      "generation.tracks-resolved",
      "generation.completed",
      "program.committed",
    ]);
    expect(
      harness.events.every(
        (event) => event.correlationId === started.jobId && event.profileId === harness.profile.id,
      ),
    ).toBe(true);
    expect(capturedContext?.library).toEqual({
      tracks: [],
      maximumTracks: 5,
      preferredLibraryTrackCount: 0,
      minimumLibraryTrackCount: 0,
    });

    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");
    expect(detail.program.scenarioText).toBe(command.scenarioText);
    expect(detail.timeline.map((item) => item.kind)).toEqual([
      "dj",
      "track",
      "track",
      "track",
      "track",
      "track",
    ]);
    const trackItem = detail.timeline.find((item) => item.kind === "track");
    expect(trackItem?.kind).toBe("track");
    if (trackItem?.kind !== "track") {
      throw new Error("Generated timeline has no track");
    }
    expect(trackItem.resolvedAudioRef).toMatch(/^(?:https:\/\/|media\/)/u);
    const columns = harness.database.client
      .prepare("PRAGMA table_info(program_generation_job)")
      .all() as unknown as Array<{ name: string }>;
    expect(columns.map(({ name }) => name)).not.toContain("scenario_text");
    await closeHarness(harness);
  });

  it("places intro, bounded segues and outro deterministically", async () => {
    const codex: CodexProvider = {
      plan(context) {
        const language = (context as { preferences: { djLanguage: "zh-CN" } }).preferences
          .djLanguage;
        return Promise.resolve({
          programTitle: "Deterministic Placement",
          scenarioSummary: "两首歌和多段 DJ",
          djLanguage: language,
          djPersona: "natural-radio",
          djScripts: [
            {
              type: "intro",
              language,
              text: "开场",
              displayText: "开场",
              estimatedTiming: true,
            },
            {
              type: "segue",
              language,
              text: "有效串场",
              displayText: "有效串场",
              estimatedTiming: true,
            },
            {
              type: "segue",
              language,
              text: "额外串场只保留文字",
              displayText: "额外串场只保留文字",
              estimatedTiming: true,
            },
            {
              type: "outro",
              language,
              text: "收尾",
              displayText: "收尾",
              estimatedTiming: true,
            },
          ],
          trackIntents: [
            { kind: "discovery", keyword: "Space", reason: "匹配第一首确定性 Mock 曲目" },
            { kind: "discovery", keyword: "Midnight", reason: "匹配第二首确定性 Mock 曲目" },
          ],
          playlistIntent: { energy: "mid", mood: "focused", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "两首歌和多段 DJ" },
      "generation-placement-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");
    expect(detail.program.trackIds).toHaveLength(2);
    expect(detail.timeline.map((item) => item.kind)).toEqual(["dj", "track", "dj", "track", "dj"]);
    expect(
      detail.djScripts
        .filter((segment) => segment.type === "segue")
        .map((segment) => segment.ttsAudioRef),
    ).toEqual(["tts/00000000-0000-4000-8000-000000000001.wav", null]);
    await closeHarness(harness);
  });

  it("uses the full library candidate range to recover the default library share", async () => {
    const providerTracks = Array.from({ length: 126 }, (_, index) => ({
      source: "netease" as const,
      sourceTrackId: `library-aware-${String(index + 1)}`,
      title:
        index < 120
          ? `Library Aware ${String(index + 1)} (Live)`
          : `Library Aware ${String(index + 1)}`,
      artist: `Artist ${String(index + 1)}`,
      album: "Library Aware Fixtures",
      durationMs: 180_000 + index * 1_000,
      lyricStatus: "available" as const,
      playable: true,
    }));
    const unmarkedCover: ProviderTrack = {
      source: "netease",
      sourceTrackId: "library-aware-unmarked-cover",
      title: "Library Aware 126 Artist 126",
      artist: "Cover Singer",
      album: "Tribute Recording",
      artworkUrl: null,
      durationMs: 180_000,
      lyricStatus: "available",
      playable: true,
    };
    const searchInvocations: string[] = [];
    const music: MusicProvider = {
      source: "netease",
      getLyrics() {
        return Promise.resolve({ status: "unavailable", content: null });
      },
      importPlaylist(playlistRef) {
        return Promise.resolve({
          source: "netease",
          sourcePlaylistId: playlistRef,
          title: "Library Aware",
          tracks: providerTracks.slice(0, 125),
        });
      },
      resolveAudio(sourceTrackId) {
        return Promise.resolve({
          resolvedAudioRef: `https://media.example.test/${sourceTrackId}.mp3`,
          expiresAt: "2099-01-01T00:00:00.000Z",
        });
      },
      search(keyword) {
        searchInvocations.push(keyword);
        return Promise.resolve({
          items: keyword === "adjacent discovery" ? [unmarkedCover, providerTracks[125]] : [],
        });
      },
    };
    let capturedContext: ReturnType<typeof codexPlanningContextSchema.parse> | undefined;
    const codex: CodexProvider = {
      plan(context) {
        const parsed = codexPlanningContextSchema.parse(context);
        capturedContext = parsed;
        return Promise.resolve({
          programTitle: "Library Aware 4/1",
          scenarioSummary: "默认库内优先",
          djLanguage: parsed.preferences.djLanguage,
          djPersona: parsed.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsed.preferences.djLanguage,
              text: "先从熟悉的声音出发，再留一个探索位置。",
              displayText: "先从熟悉的声音出发，再留一个探索位置。",
              estimatedTiming: true,
            },
          ],
          trackIntents: [
            ...parsed.library.tracks.slice(0, 4).map((track) => ({
              kind: "library" as const,
              trackId: track.trackId,
              reason: "当前 Profile 的库内锚点",
            })),
            {
              kind: "discovery" as const,
              keyword: "adjacent discovery",
              expectedArtist: "Artist 126",
              reason: "与库内锚点相邻的新歌",
            },
          ],
          playlistIntent: { energy: "low-mid", mood: "warm", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex, 5_000, createMockTtsProvider(), music);
    harness.library.importPlaylist(harness.profile.id, "library-aware", "library-aware-import");
    await harness.library.close();

    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "默认生成五首，优先我的音乐库" },
      "generation-library-aware-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");

    expect(capturedContext?.library).toMatchObject({
      maximumTracks: 5,
      preferredLibraryTrackCount: 4,
      minimumLibraryTrackCount: 4,
    });
    expect(capturedContext?.library.tracks).toHaveLength(125);
    expect(detail.tracks.map((track) => track.title).sort()).toEqual([
      "Library Aware 121",
      "Library Aware 122",
      "Library Aware 123",
      "Library Aware 124",
      "Library Aware 126",
    ]);
    expect(searchInvocations).toEqual(["adjacent discovery"]);
    await closeHarness(harness);
  });

  it("selects at most one track for each discovery intent", async () => {
    const codex: CodexProvider = {
      plan() {
        return Promise.resolve({
          programTitle: "One Intent One Track",
          scenarioSummary: "单个搜索词不能填满队列",
          djLanguage: "zh-CN",
          djPersona: "natural-radio",
          djScripts: [
            {
              type: "intro",
              language: "zh-CN",
              text: "只选一首。",
              displayText: "只选一首。",
              estimatedTiming: true,
            },
          ],
          trackIntents: [{ kind: "discovery", keyword: "i", reason: "该关键词可返回两个结果" }],
          playlistIntent: { energy: "mid", mood: "focused", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "单个关键词只选一首" },
      "generation-one-discovery-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");
    expect(detail.program.trackIds).toHaveLength(1);
    expect(detail.tracks[0]?.title).toBe("Space Song");
    await closeHarness(harness);
  });

  it("lets an explicit library-only plan override the suggested library ratio", async () => {
    let capturedContext: ReturnType<typeof codexPlanningContextSchema.parse> | undefined;
    const codex: CodexProvider = {
      plan(context) {
        const parsed = codexPlanningContextSchema.parse(context);
        capturedContext = parsed;
        return Promise.resolve({
          programTitle: "Explicit Library Only",
          scenarioSummary: "只听库内歌曲",
          djLanguage: parsed.preferences.djLanguage,
          djPersona: parsed.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsed.preferences.djLanguage,
              text: "这一期只从熟悉的音乐库里选歌。",
              displayText: "这一期只从熟悉的音乐库里选歌。",
              estimatedTiming: true,
            },
          ],
          trackIntents: parsed.library.tracks.map((track) => ({
            kind: "library" as const,
            trackId: track.trackId,
            reason: "用户明确要求只听库内歌曲",
          })),
          playlistIntent: { energy: "low-mid", mood: "familiar", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex);
    harness.library.importPlaylist(
      harness.profile.id,
      "mock-library-for-explicit-discovery",
      "explicit-discovery-import",
    );
    await harness.library.close();
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "这次只听库内歌曲，不要探索新歌" },
      "generation-explicit-library-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");
    expect(capturedContext?.library.tracks).toHaveLength(2);
    expect(capturedContext?.library.preferredLibraryTrackCount).toBe(2);
    expect(detail.program.trackIds).toHaveLength(2);
    expect(detail.program.trackIds).toEqual(
      capturedContext?.library.tracks.map((track) => track.trackId),
    );
    await closeHarness(harness);
  });

  it("fills the required library share from the full library when a planner returns only discovery", async () => {
    let capturedContext: ReturnType<typeof codexPlanningContextSchema.parse> | undefined;
    const codex: CodexProvider = {
      plan(context) {
        const parsed = codexPlanningContextSchema.parse(context);
        capturedContext = parsed;
        return Promise.resolve({
          programTitle: "Library Share Recovery",
          scenarioSummary: "规划器遗漏库内歌曲时由后端补齐",
          djLanguage: parsed.preferences.djLanguage,
          djPersona: parsed.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsed.preferences.djLanguage,
              text: "先留一首新发现，再回到你自己的音乐库。",
              displayText: "先留一首新发现，再回到你自己的音乐库。",
              estimatedTiming: true,
            },
          ],
          trackIntents: [
            {
              kind: "discovery",
              keyword: "Quiet Signal Artist Three",
              expectedArtist: "Artist Three",
              reason: "故意模拟只返回探索候选的规划器",
            },
          ],
          playlistIntent: { energy: "mid", mood: "balanced", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex);
    harness.library.importPlaylist(
      harness.profile.id,
      "mock-library-for-share-recovery",
      "library-share-recovery-import",
    );
    await harness.library.close();
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "默认生成五首" },
      "generation-library-share-recovery-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");
    const libraryTrackIds = new Set(capturedContext?.library.tracks.map((track) => track.trackId));

    expect(capturedContext?.library.minimumLibraryTrackCount).toBe(2);
    expect(detail.tracks.filter((track) => libraryTrackIds.has(track.id))).toHaveLength(2);
    expect(detail.tracks).toHaveLength(3);
    await closeHarness(harness);
  });

  it("skips foreign library ids and duplicate discoveries without cross-profile fallback", async () => {
    const codex: CodexProvider = {
      plan() {
        return Promise.resolve({
          programTitle: "Controlled Intent Degradation",
          scenarioSummary: "非法库内 ID 与重复搜索稳定降级",
          djLanguage: "zh-CN",
          djPersona: "natural-radio",
          djScripts: [
            {
              type: "intro",
              language: "zh-CN",
              text: "保留合法且可播放的曲目。",
              displayText: "保留合法且可播放的曲目。",
              estimatedTiming: true,
            },
          ],
          trackIntents: [
            {
              kind: "library",
              trackId: "90000000-0000-4000-8000-000000000099",
              reason: "不属于当前 Profile 的曲目",
            },
            { kind: "discovery", keyword: "Space", reason: "合法探索曲目" },
            { kind: "discovery", keyword: "Space", reason: "重复探索曲目" },
          ],
          playlistIntent: { energy: "low", mood: "safe", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "验证非法和重复 intent" },
      "generation-controlled-degradation-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");
    expect(detail.program.trackIds).toHaveLength(1);
    expect(detail.tracks[0]?.title).toBe("Space Song");
    expect(
      harness.events
        .filter((event) => event.eventType === "generation.degraded")
        .map((event) => event.payload),
    ).toEqual([
      {
        jobId: started.jobId,
        capability: "track",
        code: "PROGRAM_TRACK_UNAVAILABLE",
      },
    ]);
    await closeHarness(harness);
  });

  it("fails when an unavailable library intent leaves the required library share unmet", async () => {
    const baseMusic = createMockMusicProvider();
    const music: MusicProvider = {
      ...baseMusic,
      resolveAudio(sourceTrackId, options) {
        return sourceTrackId === "mock-space-song"
          ? Promise.reject(new Error("fixture library audio unavailable"))
          : baseMusic.resolveAudio(sourceTrackId, options);
      },
    };
    const codex: CodexProvider = {
      plan(context) {
        const parsed = codexPlanningContextSchema.parse(context);
        return Promise.resolve({
          programTitle: "Library Audio Degradation",
          scenarioSummary: "库内音频失败时稳定降级",
          djLanguage: parsed.preferences.djLanguage,
          djPersona: parsed.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsed.preferences.djLanguage,
              text: "不可播放的库内曲目会被跳过。",
              displayText: "不可播放的库内曲目会被跳过。",
              estimatedTiming: true,
            },
          ],
          trackIntents: parsed.library.tracks.map((track) => ({
            kind: "library" as const,
            trackId: track.trackId,
            reason: "验证库内音频可用性",
          })),
          playlistIntent: { energy: "mid", mood: "resilient", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex, 5_000, createMockTtsProvider(), music);
    harness.library.importPlaylist(
      harness.profile.id,
      "mock-library-audio-degradation",
      "library-audio-degradation-import",
    );
    await harness.library.close();
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "验证库内音频失败" },
      "generation-library-audio-degradation-001",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, started.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_INSUFFICIENT_LIBRARY_TRACKS",
    });
    expect(
      harness.events.some(
        (event) =>
          event.eventType === "generation.degraded" &&
          event.payload.capability === "track" &&
          event.payload.code === "PROGRAM_TRACK_UNAVAILABLE",
      ),
    ).toBe(true);
    await closeHarness(harness);
  });

  it("does not use a discovery fallback to replace a missing required library track", async () => {
    const baseMusic = createMockMusicProvider();
    const fallbackTrack: ProviderTrack = {
      source: "netease",
      sourceTrackId: "mock-space-alternate",
      title: "Space (Alternate)",
      artist: "Beach House",
      album: "Alternate Signals",
      artworkUrl: null,
      durationMs: 300_000,
      lyricStatus: "available",
      playable: true,
    };
    const music: MusicProvider = {
      ...baseMusic,
      search(keyword, options) {
        if (keyword === "Beach House") {
          return Promise.resolve({ items: [fallbackTrack] });
        }
        return baseMusic.search(keyword, options);
      },
      resolveAudio(sourceTrackId, options) {
        if (sourceTrackId === "mock-space-song") {
          return Promise.reject(new Error("fixture library audio unavailable"));
        }
        if (sourceTrackId === "mock-space-alternate") {
          return Promise.resolve({
            resolvedAudioRef: "https://media.example.test/mock-space-alternate.mp3",
            expiresAt: "2099-01-01T00:00:00.000Z",
          });
        }
        return baseMusic.resolveAudio(sourceTrackId, options);
      },
    };
    const codex: CodexProvider = {
      plan(context) {
        const parsed = codexPlanningContextSchema.parse(context);
        const libraryTrack = parsed.library.tracks.find((track) => track.title === "Space Song");
        if (libraryTrack === undefined) {
          throw new Error("Space Song fixture was not imported");
        }
        return Promise.resolve({
          programTitle: "Library Search Recovery",
          scenarioSummary: "库内音频失效后搜索同艺人补位",
          djLanguage: parsed.preferences.djLanguage,
          djPersona: parsed.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsed.preferences.djLanguage,
              text: "音频失效后使用同艺人可播放版本。",
              displayText: "音频失效后使用同艺人可播放版本。",
              estimatedTiming: true,
            },
          ],
          trackIntents: [
            {
              kind: "library",
              trackId: libraryTrack.trackId,
              reason: "验证库内音频失败后的同艺人恢复",
            },
          ],
          playlistIntent: { energy: "mid", mood: "recovered", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex, 5_000, createMockTtsProvider(), music);
    harness.library.importPlaylist(
      harness.profile.id,
      "mock-library-artist-recovery",
      "library-artist-recovery-import",
    );
    await harness.library.close();
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "验证同艺人音频恢复" },
      "generation-library-artist-recovery-001",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, started.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_INSUFFICIENT_LIBRARY_TRACKS",
    });
    await closeHarness(harness);
  });

  it("uses the complete DJ text for TTS and every persisted display surface", async () => {
    const completeText = "第一句需要完整播报。第二句也不能在界面中被截断。";
    const ttsCommands: unknown[] = [];
    const tts: TtsProvider = {
      synthesize(command, options) {
        ttsCommands.push(command);
        return createMockTtsProvider().synthesize(command, options);
      },
    };
    const codex: CodexProvider = {
      plan() {
        return Promise.resolve({
          programTitle: "Full DJ Script",
          scenarioSummary: "验证全文一致",
          djLanguage: "zh-CN",
          djPersona: "natural-radio",
          djScripts: [
            {
              type: "intro",
              language: "zh-CN",
              text: completeText,
              displayText: "第一句需要完整播报。",
              estimatedTiming: true,
            },
          ],
          trackIntents: [{ kind: "discovery", keyword: "Space", reason: "确定性 Mock 曲目" }],
          playlistIntent: { energy: "low", mood: "focused", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex, 5_000, tts);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "验证 DJ 全文" },
      "generation-full-script-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");

    expect(ttsCommands).toEqual([
      {
        text: completeText,
        language: "zh-CN",
        voiceStyle: "natural-radio",
      },
    ]);
    expect(detail.djScripts[0]).toMatchObject({
      text: completeText,
      displayText: completeText,
    });
    await closeHarness(harness);
  });

  it("keeps the previous Program and reports the precise TTS failure", async () => {
    const tts: TtsProvider = {
      synthesize() {
        return Promise.reject(Object.assign(new Error("timeout"), { code: "timeout" }));
      },
    };
    const harness = await createHarness(createMockCodexProvider(), 5_000, tts);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "验证 DJ 语音超时" },
      "generation-tts-timeout-001",
    );

    await harness.generation.waitForIdle();

    expect(harness.generation.get(harness.profile.id, started.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_TTS_TIMEOUT",
    });
    expect(harness.events.at(-1)).toMatchObject({
      eventType: "generation.degraded",
      payload: { capability: "tts", code: "PROGRAM_GENERATION_TTS_TIMEOUT" },
    });
    expect(harness.programs.list(harness.profile.id).items).toEqual([]);
    await closeHarness(harness);
  });

  it("cancels active work and discards late provider results and events", async () => {
    const called = deferred<undefined>();
    const result = deferred<unknown>();
    const codex: CodexProvider = {
      plan() {
        called.resolve(undefined);
        return result.promise;
      },
    };
    const harness = await createHarness(codex);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "切换 Profile 前的生成" },
      "generation-cancel-001",
    );
    await called.promise;
    await harness.generation.cancelProfile(harness.profile.id);
    expect(harness.generation.get(harness.profile.id, started.jobId).status).toBe("canceled");

    result.resolve(
      await createMockCodexProvider().plan(
        {
          scenarioText: "切换 Profile 前的生成",
          effectiveTaste: harness.taste.get(harness.profile.id).effective,
          history: [],
          library: {
            tracks: [],
            maximumTracks: 5,
            preferredLibraryTrackCount: 0,
            minimumLibraryTrackCount: 0,
          },
          currentTime: new Date().toISOString(),
          preferences: {
            djLanguage: harness.preferences.get(harness.profile.id).djLanguage,
            djVoiceStyle: harness.preferences.get(harness.profile.id).djVoiceStyle,
          },
        },
        { correlationId: started.jobId },
      ),
    );
    await Promise.resolve();
    expect(harness.events).toEqual([]);
    expect(harness.programs.list(harness.profile.id).items).toEqual([]);
    await closeHarness(harness);
  });

  it("reports unavailable planner configuration without misleading track failure", async () => {
    const unavailable: CodexProvider = {
      plan() {
        return Promise.reject(
          Object.assign(new Error("planner unavailable"), { code: "configuration_invalid" }),
        );
      },
    };
    const harness = await createHarness(unavailable);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "为午后工作规划一档节目" },
      "generation-planner-unavailable-001",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, started.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_PLANNER_CONFIGURATION_INVALID",
    });
    await closeHarness(harness);
  });

  it("times out ignored cancellation and recovers interrupted jobs to a stable failure", async () => {
    const hanging: CodexProvider = {
      plan: () => new Promise(() => undefined),
    };
    const harness = await createHarness(hanging, 10);
    const timedOut = harness.generation.start(
      harness.profile.id,
      { scenarioText: "会超时的生成" },
      "generation-timeout-001",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, timedOut.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_TIMEOUT",
    });

    const queued = harness.repository.create(
      "10000000-0000-4000-8000-000000000099",
      harness.profile.id,
      "generation-interrupted-001",
      new Date().toISOString(),
    );
    const recovered = createProgramGenerationService({
      codex: createMockCodexProvider(),
      events: { publish: (event) => harness.events.push(event) },
      library: harness.library,
      preferences: harness.preferences,
      programs: harness.programs,
      repository: harness.repository,
      taste: harness.taste,
      tts: createMockTtsProvider(),
    });
    expect(recovered.get(harness.profile.id, queued.snapshot.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_INTERRUPTED",
    });
    expect(
      recovered.start(
        harness.profile.id,
        { scenarioText: "重复键不重跑" },
        "generation-interrupted-001",
      ),
    ).toMatchObject({ jobId: queued.snapshot.jobId, status: "failed" });
    await recovered.close();
    await closeHarness(harness);
  });
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
    if (!["queued", "running"].includes(snapshot.status)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Program generation did not finish");
}

describe("S3-06 Program generation REST and reconnect snapshot", () => {
  it("returns 202 immediately and restores the terminal snapshot after reconnect", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-generation-api-"));
    const config = createConfig(parent);
    let app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);
    let session = await bootstrapSession(app);
    let authorization = `Bearer ${session.accessToken}`;
    const profileResponse = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      headers: {
        authorization,
        origin,
        "idempotency-key": "generation-api-profile-001",
      },
      payload: { radioName: "Night Signals", nickname: "Klein" },
    });
    const profile = profileSchema.parse(profileResponse.json<unknown>());
    const acceptedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/program-generations`,
      headers: {
        authorization,
        origin,
        "idempotency-key": "generation-api-001",
      },
      payload: { scenarioText: "夜晚写作" },
    });
    expect(acceptedResponse.statusCode).toBe(202);
    const accepted = jobAcceptedResponseSchema.parse(acceptedResponse.json<unknown>());
    const repeatedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/profiles/${profile.id}/program-generations`,
      headers: {
        authorization,
        origin,
        "idempotency-key": "generation-api-001",
      },
      payload: { scenarioText: "同一个键不会重跑" },
    });
    expect(jobAcceptedResponseSchema.parse(repeatedResponse.json<unknown>())).toEqual(accepted);
    const completed = await waitForTerminalSnapshot(app, profile.id, accepted.jobId, authorization);
    expect(completed.status).toBe("succeeded");

    openApps.splice(openApps.indexOf(app), 1);
    await app.close();
    app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);
    session = await bootstrapSession(app);
    authorization = `Bearer ${session.accessToken}`;
    const restoredResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/program-generations/${accepted.jobId}`,
      headers: { authorization, origin },
    });
    expect(programGenerationSnapshotSchema.parse(restoredResponse.json<unknown>())).toEqual(
      completed,
    );
  });

  it("cancels the previous Profile generation before switching context", async () => {
    const called = deferred<undefined>();
    const codex: CodexProvider = {
      plan() {
        called.resolve(undefined);
        return new Promise(() => undefined);
      },
    };
    const parent = await mkdtemp(join(tmpdir(), "koradio-generation-switch-"));
    const config = createConfig(parent);
    const app = await createApp({ codexProvider: codex, config, selectedPort: config.port });
    openApps.push(app);
    const session = await bootstrapSession(app);
    const authorization = `Bearer ${session.accessToken}`;
    const createProfile = async (key: string, nickname: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/profiles",
        headers: { authorization, origin, "idempotency-key": key },
        payload: { radioName: `${nickname} Radio`, nickname },
      });
      return profileSchema.parse(response.json<unknown>());
    };
    const firstProfile = await createProfile("generation-switch-profile-001", "First");
    const secondProfile = await createProfile("generation-switch-profile-002", "Second");
    await app.inject({
      method: "PUT",
      url: "/api/v1/profiles/current",
      headers: { authorization, origin },
      payload: { profileId: firstProfile.id },
    });
    const acceptedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/profiles/${firstProfile.id}/program-generations`,
      headers: {
        authorization,
        origin,
        "idempotency-key": "generation-switch-001",
      },
      payload: { scenarioText: "切换前的生成" },
    });
    const accepted = jobAcceptedResponseSchema.parse(acceptedResponse.json<unknown>());
    await called.promise;

    const switched = await app.inject({
      method: "PUT",
      url: "/api/v1/profiles/current",
      headers: { authorization, origin },
      payload: { profileId: secondProfile.id },
    });
    expect(switched.statusCode).toBe(200);
    const snapshotResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${firstProfile.id}/program-generations/${accepted.jobId}`,
      headers: { authorization, origin },
    });
    expect(programGenerationSnapshotSchema.parse(snapshotResponse.json<unknown>()).status).toBe(
      "canceled",
    );
  });

  it("uses both repair rounds while enforcing Chinese lyrics, unique artists and recent history", async () => {
    const providerTracks: ProviderTrack[] = [
      {
        source: "netease",
        sourceTrackId: "instrumental-track",
        title: "Like A Star (Piano Version)",
        artist: "Instrumental Artist",
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "available",
        playable: true,
      },
      {
        source: "netease",
        sourceTrackId: "japanese-track",
        title: "桜の季節",
        artist: "Japanese Artist",
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "available",
        playable: true,
      },
      {
        source: "netease",
        sourceTrackId: "english-track",
        title: "English Track",
        artist: "English Artist",
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "available",
        playable: true,
      },
      ...Array.from({ length: 9 }, (_, index): ProviderTrack => ({
        source: "netease",
        sourceTrackId: `chinese-track-${String(index + 1)}`,
        title: `中文曲目 ${String(index + 1)}`,
        artist: index < 2 ? "同一歌手" : `歌手 ${String(index)}`,
        album: "中文测试",
        artworkUrl: null,
        durationMs: 180_000 + index * 1_000,
        lyricStatus: "available",
        playable: true,
      })),
    ];
    const music: MusicProvider = {
      source: "netease",
      search(keyword) {
        return Promise.resolve({ items: keyword === "missing" ? [] : providerTracks });
      },
      importPlaylist() {
        return Promise.resolve({
          source: "netease",
          sourcePlaylistId: "fixture",
          title: "Fixture",
          tracks: providerTracks,
        });
      },
      getLyrics(sourceTrackId) {
        return Promise.resolve(
          sourceTrackId === "english-track"
            ? {
                status: "available" as const,
                content: "Only English words are present here",
                originalContent: "Only English words are present here",
              }
            : sourceTrackId === "japanese-track"
              ? {
                  status: "available" as const,
                  content: "さくらの風が吹く夜に\n心は遠くへ歩いていく",
                  originalContent: "さくらの風が吹く夜に\n心は遠くへ歩いていく",
                }
              : {
                  status: "available" as const,
                  content: "山河之间的风吹过夜晚\n我们继续向前走到天亮\n让心慢慢亮起来",
                  originalContent: "山河之间的风吹过夜晚\n我们继续向前走到天亮\n让心慢慢亮起来",
                },
        );
      },
      resolveAudio(sourceTrackId) {
        const index = Math.max(
          1,
          providerTracks.findIndex((track) => track.sourceTrackId === sourceTrackId) + 1,
        );
        return Promise.resolve({
          resolvedAudioRef: `media/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.wav`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      },
    };
    const codex: CodexProvider = {
      plan(context) {
        const parsed = codexPlanningContextSchema.parse(context);
        return Promise.resolve({
          programTitle: "中文补选测试",
          scenarioSummary: parsed.scenarioText,
          djLanguage: parsed.preferences.djLanguage,
          djPersona: parsed.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsed.preferences.djLanguage,
              text: "开始这段中文节目。",
              displayText: "开始这段中文节目。",
              estimatedTiming: true,
            },
          ],
          trackIntents: Array.from({ length: 12 }, (_, index) => ({
            kind: "discovery" as const,
            keyword: index < 4 ? "missing" : "good",
            reason: "验证首轮与两轮补选",
          })),
          playlistIntent: { energy: "中", mood: "安静", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex, 5_000, createMockTtsProvider(), music, null);

    const first = harness.generation.start(
      harness.profile.id,
      { scenarioText: "只要中文歌，做 8 首节目" },
      "ux11-strict-first",
    );
    await harness.generation.waitForIdle();
    const firstSnapshot = harness.generation.get(harness.profile.id, first.jobId);
    expect(firstSnapshot.status).toBe("succeeded");
    const detail = harness.programs.get(harness.profile.id, firstSnapshot.programId ?? "");
    expect(detail.tracks).toHaveLength(8);
    expect(detail.tracks.every((track) => track.title.startsWith("中文曲目"))).toBe(true);
    expect(new Set(detail.tracks.map((track) => track.artist)).size).toBe(8);
    const deepCommentary = detail.djScripts
      .filter((segment) => segment.type === "segue")
      .slice(0, 2);
    expect(deepCommentary).toHaveLength(2);
    expect(deepCommentary.every((segment) => Array.from(segment.text).length <= 340)).toBe(true);
    expect(deepCommentary.every((segment) => segment.ttsAudioRef !== null)).toBe(true);

    const second = harness.generation.start(
      harness.profile.id,
      { scenarioText: "再做 8 首中文歌节目" },
      "ux11-strict-second",
    );
    await harness.generation.waitForIdle();
    expect(harness.generation.get(harness.profile.id, second.jobId)).toMatchObject({
      status: "failed",
      errorCode: "PROGRAM_GENERATION_INSUFFICIENT_CHINESE_TRACKS",
    });
    await closeHarness(harness);

    const explicitHarness = await createHarness(codex, 5_000, createMockTtsProvider(), music, null);
    const explicit = explicitHarness.generation.start(
      explicitHarness.profile.id,
      { scenarioText: "只要中文歌，加入同一歌手的作品，做 8 首节目" },
      "ux11-explicit-artist",
    );
    await explicitHarness.generation.waitForIdle();
    const explicitSnapshot = explicitHarness.generation.get(
      explicitHarness.profile.id,
      explicit.jobId,
    );
    expect(explicitSnapshot.status).toBe("succeeded");
    const explicitDetail = explicitHarness.programs.get(
      explicitHarness.profile.id,
      explicitSnapshot.programId ?? "",
    );
    expect(explicitDetail.tracks.filter((track) => track.artist === "同一歌手")).toHaveLength(2);
    await closeHarness(explicitHarness);
  });

  it("keeps western vocal requests free of instrumental and East Asian tracks", async () => {
    const providerTracks: ProviderTrack[] = [
      {
        source: "netease",
        sourceTrackId: "mixed-piano",
        title: "Midnight Signal (Piano Version)",
        artist: "English Artist",
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "available",
        playable: true,
      },
      {
        source: "netease",
        sourceTrackId: "mixed-korean",
        title: "Foreign ~ k o r e a n ~",
        artist: "DEAN",
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "available",
        playable: true,
      },
      {
        source: "netease",
        sourceTrackId: "mixed-chinese",
        title: "枫桥雨",
        artist: "英复光",
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "available",
        playable: true,
      },
      {
        source: "netease",
        sourceTrackId: "mixed-japanese",
        title: "日暮里",
        artist: "JINBAO",
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "available",
        playable: true,
      },
      ...Array.from({ length: 8 }, (_, index): ProviderTrack => ({
        source: "netease",
        sourceTrackId: `mixed-western-${String(index)}`,
        title: `Western Track ${String(index)}`,
        artist: `Western Artist ${String(index)}`,
        album: "Fixture",
        artworkUrl: null,
        durationMs: 180_000 + index * 1_000,
        lyricStatus: "available",
        playable: true,
      })),
    ];
    const music: MusicProvider = {
      source: "netease",
      search() {
        return Promise.resolve({ items: providerTracks });
      },
      importPlaylist() {
        return Promise.resolve({
          source: "netease",
          sourcePlaylistId: "mixed-fixture",
          title: "Mixed Fixture",
          tracks: providerTracks,
        });
      },
      getLyrics(sourceTrackId) {
        if (sourceTrackId === "mixed-piano") {
          return Promise.resolve({ status: "unavailable" as const, content: null });
        }
        if (sourceTrackId === "mixed-korean") {
          return Promise.resolve({
            status: "available" as const,
            content: "이 밤에 너와 함께 걸어가며 마음을 노래해",
          });
        }
        if (sourceTrackId === "mixed-chinese") {
          return Promise.resolve({
            status: "available" as const,
            content: "山河之间的风吹过夜晚我们继续向前走到天亮",
          });
        }
        if (sourceTrackId === "mixed-japanese") {
          return Promise.resolve({
            status: "available" as const,
            content: "さくらの風が吹く夜に心は遠くへ歩いていく",
          });
        }
        return Promise.resolve({
          status: "available" as const,
          content: "Only English words are present here tonight",
        });
      },
      resolveAudio(sourceTrackId) {
        const index = providerTracks.findIndex((track) => track.sourceTrackId === sourceTrackId);
        return Promise.resolve({
          resolvedAudioRef: `media/00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}.wav`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      },
    };
    const codex: CodexProvider = {
      plan(context) {
        const parsed = codexPlanningContextSchema.parse(context);
        return Promise.resolve({
          programTitle: "Western Vocal Fixture",
          scenarioSummary: parsed.scenarioText,
          djLanguage: parsed.preferences.djLanguage,
          djPersona: parsed.preferences.djVoiceStyle,
          djScripts: [
            {
              type: "intro",
              language: parsed.preferences.djLanguage,
              text: "开始一段欧美人声节目。",
              displayText: "开始一段欧美人声节目。",
              estimatedTiming: true,
            },
          ],
          trackIntents: Array.from({ length: 12 }, (_, index) => ({
            kind: "discovery" as const,
            keyword: `mixed ${String(index)}`,
            reason: "验证统一候选资格校验",
          })),
          playlistIntent: { energy: "中", mood: "明亮", avoid: [] },
        });
      },
    };
    const harness = await createHarness(codex, 5_000, createMockTtsProvider(), music, null);
    const started = harness.generation.start(
      harness.profile.id,
      { scenarioText: "规划一档欧美流行歌单，不要纯音乐" },
      "western-vocal-001",
    );
    await harness.generation.waitForIdle();
    const snapshot = harness.generation.get(harness.profile.id, started.jobId);
    expect(snapshot.status).toBe("succeeded");
    const detail = harness.programs.get(harness.profile.id, snapshot.programId ?? "");
    expect(detail.tracks).toHaveLength(8);
    expect(detail.tracks.every((track) => track.artist.startsWith("Western Artist"))).toBe(true);
    await closeHarness(harness);
  });
});
