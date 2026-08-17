import { randomUUID } from "node:crypto";

import {
  generationCompletedEventSchema,
  generationDegradedEventSchema,
  generationPlannedEventSchema,
  generationTracksResolvedEventSchema,
  programCommittedEventSchema,
  programDetailSchema,
  type AudioResolution,
  type DjScriptSegment,
  type GenerateProgramCommand,
  type MusicTrack,
  type OriginMode,
  type ProgramDetail,
  type ProgramGenerationSnapshot,
  type ProgramGenerationStage,
  type TrackLyrics,
  type V1Event,
} from "@koradio/contracts";

import type { LibraryService } from "../library/index.js";
import { isNonCanonicalVersion } from "../library/track-version.js";
import type { ProfilePreferencesService } from "../profile-preferences/index.js";
import type { TasteService } from "../taste/index.js";
import {
  codexProgramPlanSchema,
  ttsSynthesisResultSchema,
  type CodexProgramPlan,
  type CodexProvider,
  type ProgramPlannerProvider,
  type TtsProvider,
} from "./providers.js";
import { createPlanningContext } from "./planning-context.js";
import type { ProgramGenerationRepository } from "./generation-persistence.js";
import type { ProgramService } from "./service.js";
import type { MusicFact, MusicFactProvider } from "./music-facts.js";

export class ProgramGenerationNotFoundError extends Error {
  constructor() {
    super("Program generation was not found");
    this.name = "ProgramGenerationNotFoundError";
  }
}

class GenerationPipelineError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "GenerationPipelineError";
    this.code = code;
  }
}

class GenerationAbortedError extends Error {
  constructor() {
    super("Program generation was aborted");
    this.name = "GenerationAbortedError";
  }
}

interface ActiveRun {
  controller: AbortController;
  profileId: string;
  promise: Promise<void>;
  timedOut: boolean;
}

type GenerationLibrary = Pick<
  LibraryService,
  "candidateTracks" | "getLyrics" | "resolveAudio" | "search"
>;
type GenerationPrograms = Pick<ProgramService, "commit" | "list">;
type GenerationPreferences = Pick<ProfilePreferencesService, "get">;
type GenerationTaste = Pick<TasteService, "get">;

export function isAlternativeVersion(track: Pick<MusicTrack, "album" | "title">): boolean {
  return isNonCanonicalVersion({ ...track, artist: "" });
}

export interface CreateProgramGenerationServiceOptions {
  codex?: CodexProvider;
  events: { publish(event: V1Event): void };
  library: GenerationLibrary;
  facts?: MusicFactProvider;
  maximumTracks?: number;
  now?: () => Date;
  originMode?: OriginMode;
  preferences: GenerationPreferences;
  programs: GenerationPrograms;
  planner?: ProgramPlannerProvider | (() => ProgramPlannerProvider);
  randomId?: () => string;
  repository: ProgramGenerationRepository;
  taste: GenerationTaste;
  timeoutMs?: number;
  tts?: TtsProvider;
}

export interface ProgramGenerationService {
  active(profileId: string): ProgramGenerationSnapshot | null;
  cancelProfile(profileId: string): Promise<void>;
  close(): Promise<void>;
  get(profileId: string, jobId: string): ProgramGenerationSnapshot;
  start(
    profileId: string,
    command: GenerateProgramCommand,
    idempotencyKey: string,
  ): ProgramGenerationSnapshot;
  waitForIdle(): Promise<void>;
}

const chineseTrackCounts = new Map([
  ["八", 8],
  ["九", 9],
  ["十", 10],
  ["十一", 11],
  ["十二", 12],
]);

const maximumDeepCommentaryCharacters = 340;

function trimCommentary(value: string): string {
  const characters = Array.from(value.trim());
  if (characters.length <= maximumDeepCommentaryCharacters) return value.trim();
  return `${characters.slice(0, maximumDeepCommentaryCharacters - 1).join("")}…`;
}

function deepCommentaryFor(
  track: MusicTrack,
  language: "zh-CN" | "en-GB",
  facts: MusicFact[],
): string {
  const factText = trimCommentary(facts.map((fact) => fact.fact).join(" "));
  if (language === "zh-CN") {
    return trimCommentary(
      `${track.title} 先把旋律向上推开，再在句尾收住；节奏不急着给出答案，留白让呼吸停在拍点之间。${track.artist} 的声音与伴奏没有争抢中心，情绪藏在音色、力度和距离感里。${factText.length === 0 ? "没有可靠来源时，我们不补写幕后传闻，只谈这段录音里真正听得见的细节。" : factText} 在这一刻听它，可以留意一次换气、鼓点的轻重或重复旋律里细小的变化；那正是它能把当前情绪带向下一首歌的原因。`,
    );
  }
  return trimCommentary(
    `${track.title} lets the melody rise, then draws it back at the end of each phrase. The rhythm leaves space rather than rushing to resolve, while ${track.artist}'s voice and the arrangement share the centre. ${factText || "There is no reliable source for a backstage story here, so we stay with what the recording itself reveals."} Listen for one breath, a change in drum weight, or a small shift inside a repeated phrase; those details let this track carry the room into the next one.`,
  );
}

export function requestedProgramTrackCount(scenarioText: string): number | null {
  const numeric = scenarioText.match(/(?:^|\D)(\d{1,2})\s*(?:首|支|曲)/u)?.[1];
  if (numeric !== undefined) return Number.parseInt(numeric, 10);
  const chinese = scenarioText.match(/(十二|十一|十|九|八)\s*(?:首|支|曲)/u)?.[1];
  return chinese === undefined ? null : (chineseTrackCounts.get(chinese) ?? null);
}

function isActive(snapshot: ProgramGenerationSnapshot | null): boolean {
  return snapshot?.status === "queued" || snapshot?.status === "running";
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function resolvePlanner(options: CreateProgramGenerationServiceOptions): ProgramPlannerProvider {
  const planner = typeof options.planner === "function" ? options.planner() : options.planner;
  if (planner !== undefined) {
    return planner;
  }
  if (options.codex !== undefined) {
    return options.codex;
  }
  throw new Error("Program planner has not been configured");
}

function withAbort<Value>(operation: () => Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) {
    return Promise.reject(new GenerationAbortedError());
  }

  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(new GenerationAbortedError());
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", abort);
      });
  });
}

async function mapWithConcurrency<Value, Result>(
  values: Value[],
  maximumConcurrency: number,
  mapper: (value: Value) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, maximumConcurrency), values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values.at(index);
        if (value === undefined) return;
        results[index] = await mapper(value);
      }
    }),
  );
  return results;
}

export function createProgramGenerationService(
  options: CreateProgramGenerationServiceOptions,
): ProgramGenerationService {
  const now = options.now ?? (() => new Date());
  const originMode = options.originMode ?? "mock";
  const randomId = options.randomId ?? randomUUID;
  const configuredTrackCount =
    options.maximumTracks === undefined ? 8 : Math.max(1, Math.min(options.maximumTracks, 12));
  const strictTrackCount = options.maximumTracks === undefined;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const activeRuns = new Map<string, ActiveRun>();

  options.repository.recoverInterrupted(now().toISOString());

  function assertActive(jobId: string, signal: AbortSignal): ProgramGenerationSnapshot {
    if (signal.aborted) {
      throw new GenerationAbortedError();
    }
    const snapshot = options.repository.getById(jobId);
    if (snapshot === null || (snapshot.status !== "queued" && snapshot.status !== "running")) {
      throw new GenerationAbortedError();
    }
    return snapshot;
  }

  function setStage(jobId: string, stage: ProgramGenerationStage, signal: AbortSignal): void {
    assertActive(jobId, signal);
    options.repository.setStage(jobId, stage, now().toISOString());
  }

  function publish(
    jobId: string,
    build: (sequence: number, occurredAt: string) => V1Event,
    terminal = false,
  ): void {
    const snapshot = options.repository.getById(jobId);
    if (snapshot === null || (!terminal && !isActive(snapshot))) {
      throw new GenerationAbortedError();
    }
    const occurredAt = now().toISOString();
    const sequence = options.repository.reserveSequence(jobId, occurredAt);
    if (sequence === null) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_STATE_UNAVAILABLE");
    }
    options.events.publish(build(sequence, occurredAt));
  }

  function publishDegraded(
    snapshot: ProgramGenerationSnapshot,
    capability: "tts" | "lyrics" | "track",
    code: string,
  ): void {
    publish(snapshot.jobId, (sequence, occurredAt) =>
      generationDegradedEventSchema.parse({
        eventId: randomId(),
        eventType: "generation.degraded",
        version: 1,
        profileId: snapshot.profileId,
        correlationId: snapshot.jobId,
        sequence,
        occurredAt,
        payload: { jobId: snapshot.jobId, capability, code },
      }),
    );
  }

  async function resolveTracks(
    snapshot: ProgramGenerationSnapshot,
    plan: CodexProgramPlan,
    libraryTracks: MusicTrack[],
    targetTrackCount: number,
    scenarioText: string,
    lyricsCache: Map<string, TrackLyrics>,
    signal: AbortSignal,
  ): Promise<Array<{ audio: AudioResolution; track: MusicTrack }>> {
    setStage(snapshot.jobId, "resolving_tracks", signal);
    const libraryCandidates = new Map(libraryTracks.map((track) => [track.id, track]));
    const resolved: Array<{ audio: AudioResolution; track: MusicTrack }> = [];
    const failedTrackIds = new Set<string>();
    const selectedTrackIds = new Set<string>();
    const selectedArtists = new Set<string>();
    const recentTrackIds = new Set(
      options.programs
        .list(snapshot.profileId, undefined, 10)
        .items.flatMap((program) => program.trackIds),
    );
    const chineseOnly = /中文歌|华语歌|国语歌|粤语歌/u.test(scenarioText);
    const normalizedScenario = scenarioText.toLocaleLowerCase("en-US");
    let trackDegraded = false;

    const isExplicitTrack = (track: MusicTrack): boolean => {
      const titleKey = track.title.trim().toLocaleLowerCase("en-US");
      return titleKey.length >= 2 && normalizedScenario.includes(titleKey);
    };

    const isChineseVocal = async (track: MusicTrack): Promise<boolean> => {
      if (!chineseOnly) return true;
      try {
        const cached = lyricsCache.get(track.id);
        const lyrics =
          cached ?? (await withAbort(() => options.library.getLyrics(track.id, signal), signal));
        lyricsCache.set(track.id, lyrics);
        if (lyrics.content === null) return false;
        const original = lyrics.originalContent ?? lyrics.content;
        const normalized = original.replace(/\[[^\]]+\]/gu, "").replace(/[\s\p{P}\p{S}\d]/gu, "");
        if (normalized.length === 0) return false;
        const han = normalized.match(/\p{Script=Han}/gu)?.length ?? 0;
        return han / Array.from(normalized).length >= 0.6;
      } catch {
        return false;
      }
    };

    const tryResolve = async (track: MusicTrack, discovery = false): Promise<boolean> => {
      if (selectedTrackIds.has(track.id)) {
        return false;
      }
      const artistKey = track.artist.trim().toLocaleLowerCase("en-US");
      const explicitArtist = artistKey.length > 0 && normalizedScenario.includes(artistKey);
      const explicitTrack = isExplicitTrack(track);
      if (discovery && !explicitTrack && isAlternativeVersion(track)) {
        trackDegraded = true;
        return false;
      }
      if (
        (!explicitTrack && recentTrackIds.has(track.id)) ||
        (!explicitArtist && selectedArtists.has(artistKey))
      ) {
        trackDegraded = true;
        return false;
      }
      if (!(await isChineseVocal(track))) {
        trackDegraded = true;
        return false;
      }
      if (!track.playable) {
        failedTrackIds.add(track.id);
        trackDegraded = true;
        return false;
      }
      try {
        const audio = await withAbort(() => options.library.resolveAudio(track.id, signal), signal);
        assertActive(snapshot.jobId, signal);
        resolved.push({ audio, track });
        selectedTrackIds.add(track.id);
        selectedArtists.add(artistKey);
        return true;
      } catch (error) {
        if (signal.aborted || error instanceof GenerationAbortedError) {
          throw new GenerationAbortedError();
        }
        failedTrackIds.add(track.id);
        trackDegraded = true;
        return false;
      }
    };

    const searchAndResolve = async (
      keyword: string,
      includeLibraryCandidates = false,
    ): Promise<boolean> => {
      const normalizedKeyword = keyword.trim().slice(0, 100).toLocaleLowerCase("en-US");
      if (normalizedKeyword.length === 0) {
        return false;
      }
      try {
        const search = await withAbort(
          () => options.library.search(keyword.trim().slice(0, 100), signal),
          signal,
        );
        assertActive(snapshot.jobId, signal);
        for (const track of search.items) {
          if (
            failedTrackIds.has(track.id) ||
            (!includeLibraryCandidates && libraryCandidates.has(track.id))
          ) {
            continue;
          }
          if (await tryResolve(track, true)) {
            return true;
          }
        }
      } catch (error) {
        if (signal.aborted || error instanceof GenerationAbortedError) {
          throw new GenerationAbortedError();
        }
        trackDegraded = true;
      }
      return false;
    };

    const intentRounds = strictTrackCount
      ? [
          plan.trackIntents.slice(0, targetTrackCount),
          plan.trackIntents.slice(targetTrackCount, targetTrackCount + 2),
          plan.trackIntents.slice(targetTrackCount + 2, targetTrackCount + 4),
        ]
      : [plan.trackIntents];
    for (const intents of intentRounds) {
      for (const intent of intents) {
        if (resolved.length === targetTrackCount) break;
        if (intent.kind === "library") {
          const track = libraryCandidates.get(intent.trackId);
          if (track === undefined) {
            trackDegraded = true;
            continue;
          }
          if (isAlternativeVersion(track) && !isExplicitTrack(track)) {
            trackDegraded = true;
            continue;
          }
          if (!(await tryResolve(track))) {
            await searchAndResolve(track.artist, true);
          }
          continue;
        }
        await searchAndResolve(intent.keyword);
      }
      if (resolved.length === targetTrackCount) break;
    }

    if (trackDegraded) {
      publishDegraded(snapshot, "track", "PROGRAM_TRACK_UNAVAILABLE");
    }
    if (resolved.length === 0) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_NO_PLAYABLE_TRACKS");
    }
    if (strictTrackCount && resolved.length !== targetTrackCount) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_INSUFFICIENT_TRACKS");
    }
    publish(snapshot.jobId, (sequence, occurredAt) =>
      generationTracksResolvedEventSchema.parse({
        eventId: randomId(),
        eventType: "generation.tracks-resolved",
        version: 1,
        profileId: snapshot.profileId,
        correlationId: snapshot.jobId,
        sequence,
        occurredAt,
        payload: { jobId: snapshot.jobId, trackCount: resolved.length },
      }),
    );
    return resolved;
  }

  async function enrichLyrics(
    snapshot: ProgramGenerationSnapshot,
    tracks: Array<{ audio: AudioResolution; track: MusicTrack }>,
    lyricsCache: Map<string, TrackLyrics>,
    signal: AbortSignal,
  ): Promise<void> {
    setStage(snapshot.jobId, "enriching_tracks", signal);
    const degradedFlags = await mapWithConcurrency(tracks, 4, async ({ track }) => {
      try {
        const cached = lyricsCache.get(track.id);
        const lyrics: TrackLyrics =
          cached ?? (await withAbort(() => options.library.getLyrics(track.id, signal), signal));
        lyricsCache.set(track.id, lyrics);
        assertActive(snapshot.jobId, signal);
        return lyrics.status === "unavailable";
      } catch (error) {
        if (signal.aborted || error instanceof GenerationAbortedError) {
          throw new GenerationAbortedError();
        }
        return true;
      }
    });
    const degraded = degradedFlags.some(Boolean);
    if (degraded) {
      publishDegraded(snapshot, "lyrics", "PROGRAM_LYRICS_UNAVAILABLE");
    }
  }

  async function buildProgram(
    snapshot: ProgramGenerationSnapshot,
    command: GenerateProgramCommand,
    plan: CodexProgramPlan,
    resolvedTracks: Array<{ audio: AudioResolution; track: MusicTrack }>,
    featuredFacts: Map<string, MusicFact[]>,
    signal: AbortSignal,
  ): Promise<ProgramDetail> {
    setStage(snapshot.jobId, "synthesizing_dj", signal);
    const programId = randomId();
    const maximumSegues = Math.max(0, resolvedTracks.length - 1);
    let segueCount = 0;
    const deepScripts: Array<CodexProgramPlan["djScripts"][number] & { citations?: MusicFact[] }> =
      [];
    for (const { track } of strictTrackCount ? resolvedTracks.slice(0, 2) : []) {
      const facts = featuredFacts.get(track.id) ?? [];
      const text = deepCommentaryFor(track, plan.djLanguage, facts);
      deepScripts.push({
        type: "segue",
        language: plan.djLanguage,
        text,
        displayText: text,
        estimatedTiming: true,
        citations: facts,
      });
    }
    const scripts: Array<CodexProgramPlan["djScripts"][number] & { citations?: MusicFact[] }> = [
      ...plan.djScripts.filter((script) => script.type === "intro"),
      ...deepScripts,
      ...plan.djScripts.filter((script) => script.type === "segue"),
      ...plan.djScripts.filter((script) => script.type === "outro"),
    ];
    const playableScriptIndexes = new Set<number>();
    for (const [index, script] of scripts.entries()) {
      if (script.type === "intro" || script.type === "outro") {
        playableScriptIndexes.add(index);
      } else if (segueCount < maximumSegues) {
        playableScriptIndexes.add(index);
        segueCount += 1;
      }
    }

    let ttsDegraded = false;
    const djScripts: Array<DjScriptSegment & { durationMs: number | null }> = [];
    for (const [index, script] of scripts.entries()) {
      let ttsAudioRef: string | null = null;
      let estimatedTiming = script.estimatedTiming;
      let durationMs: number | null = null;
      if (playableScriptIndexes.has(index) && options.tts !== undefined) {
        try {
          const result = ttsSynthesisResultSchema.parse(
            await withAbort(
              () =>
                options.tts?.synthesize(
                  {
                    text: script.text,
                    language: script.language,
                    voiceStyle: plan.djPersona,
                  },
                  { correlationId: snapshot.jobId, signal },
                ) ?? Promise.reject(new Error("TTS unavailable")),
              signal,
            ),
          );
          assertActive(snapshot.jobId, signal);
          ttsAudioRef = result.audioRef;
          estimatedTiming = result.estimatedTiming;
          durationMs = result.durationMs;
        } catch (error) {
          if (signal.aborted || error instanceof GenerationAbortedError) {
            throw new GenerationAbortedError();
          }
          ttsDegraded = true;
        }
      } else if (playableScriptIndexes.has(index)) {
        ttsDegraded = true;
      }
      djScripts.push({
        id: randomId(),
        programId,
        type: script.type,
        language: script.language,
        text: script.text,
        displayText: script.text,
        estimatedTiming,
        revealedAt: null,
        ttsAudioRef,
        citations: (script.citations ?? []).map((citation) => ({
          id: randomId(),
          title: citation.title,
          url: citation.url,
          provider: citation.provider,
        })),
        durationMs,
      });
    }
    if (ttsDegraded) {
      publishDegraded(snapshot, "tts", "PROGRAM_TTS_UNAVAILABLE");
    }

    const timeline: unknown[] = [];
    const addDj = (segment: (typeof djScripts)[number]) => {
      if (segment.ttsAudioRef !== null && segment.durationMs !== null) {
        timeline.push({
          id: randomId(),
          kind: "dj",
          position: timeline.length,
          segmentId: segment.id,
          audioRef: segment.ttsAudioRef,
          durationMs: segment.durationMs,
        });
      }
    };
    const introSegments = djScripts.filter((segment) => segment.type === "intro");
    const segueSegments = djScripts
      .filter((segment) => segment.type === "segue" && segment.ttsAudioRef !== null)
      .slice(0, maximumSegues);
    const outroSegments = djScripts.filter((segment) => segment.type === "outro");
    introSegments.forEach(addDj);
    for (const [trackIndex, resolved] of resolvedTracks.entries()) {
      if (trackIndex > 0) {
        const segue = segueSegments[trackIndex - 1];
        if (segue !== undefined) {
          addDj(segue);
        }
      }
      timeline.push({
        id: randomId(),
        kind: "track",
        position: timeline.length,
        trackId: resolved.track.id,
        resolvedAudioRef: resolved.audio.resolvedAudioRef,
        durationMs: resolved.track.durationMs,
      });
    }
    outroSegments.forEach(addDj);

    return programDetailSchema.parse({
      program: {
        id: programId,
        profileId: snapshot.profileId,
        scenarioText: command.scenarioText,
        title: plan.programTitle,
        status: "ready",
        trackIds: resolvedTracks.map(({ track }) => track.id),
        originMode,
        playbackMode: "voice-overlay",
        createdAt: now().toISOString(),
      },
      djScripts: djScripts.map((segment) => ({
        id: segment.id,
        programId: segment.programId,
        type: segment.type,
        language: segment.language,
        text: segment.text,
        displayText: segment.text,
        estimatedTiming: segment.estimatedTiming,
        revealedAt: null,
        ttsAudioRef: segment.ttsAudioRef,
        citations: segment.citations,
      })),
      tracks: resolvedTracks.map(({ track }) => track),
      timeline,
    });
  }

  async function runGeneration(
    snapshot: ProgramGenerationSnapshot,
    command: GenerateProgramCommand,
    signal: AbortSignal,
  ): Promise<void> {
    options.repository.markRunning(snapshot.jobId, now().toISOString());
    const requestedTrackCount = requestedProgramTrackCount(command.scenarioText);
    if (
      strictTrackCount &&
      requestedTrackCount !== null &&
      (requestedTrackCount < 8 || requestedTrackCount > 12)
    ) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_TRACK_COUNT_OUT_OF_RANGE");
    }
    const targetTrackCount = strictTrackCount
      ? (requestedTrackCount ?? configuredTrackCount)
      : configuredTrackCount;
    const libraryTracks = options.library.candidateTracks(snapshot.profileId, 120);
    const context = createPlanningContext(
      {
        library: options.library,
        now,
        preferences: options.preferences,
        programs: options.programs,
        taste: options.taste,
      },
      snapshot.profileId,
      command.scenarioText,
      targetTrackCount,
    );
    let rawPlan: unknown;
    try {
      rawPlan = await withAbort(
        () => resolvePlanner(options).plan(context, { correlationId: snapshot.jobId, signal }),
        signal,
      );
    } catch (error) {
      const plannerFailure = [
        "configuration_invalid",
        "unauthorized",
        "payment_required",
        "rate_limited",
        "response_invalid",
        "timeout",
        "unavailable",
      ].find((code) => hasErrorCode(error, code));
      if (plannerFailure !== undefined) {
        const reason =
          plannerFailure === "response_invalid" &&
          typeof error === "object" &&
          error !== null &&
          "reason" in error &&
          typeof (error as { reason?: unknown }).reason === "string"
            ? `_${(error as { reason: string }).reason.toUpperCase()}`
            : "";
        throw new GenerationPipelineError(
          `PROGRAM_GENERATION_PLANNER_${plannerFailure.toUpperCase()}${reason}`,
        );
      }
      throw error;
    }
    assertActive(snapshot.jobId, signal);
    const parsedPlan = codexProgramPlanSchema.safeParse(rawPlan);
    if (!parsedPlan.success) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_PLAN_INVALID");
    }
    const plan = parsedPlan.data;
    if (strictTrackCount && plan.trackIntents.length < targetTrackCount) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_PLAN_INSUFFICIENT");
    }
    publish(snapshot.jobId, (sequence, occurredAt) =>
      generationPlannedEventSchema.parse({
        eventId: randomId(),
        eventType: "generation.planned",
        version: 1,
        profileId: snapshot.profileId,
        correlationId: snapshot.jobId,
        sequence,
        occurredAt,
        payload: { jobId: snapshot.jobId },
      }),
    );

    const lyricsCache = new Map<string, TrackLyrics>();
    const resolvedTracks = await resolveTracks(
      snapshot,
      plan,
      libraryTracks,
      targetTrackCount,
      command.scenarioText,
      lyricsCache,
      signal,
    );
    await enrichLyrics(snapshot, resolvedTracks, lyricsCache, signal);
    const featuredFacts = new Map<string, MusicFact[]>();
    if (options.facts !== undefined) {
      const factResults = await Promise.all(
        resolvedTracks.slice(0, 2).map(async ({ track }) => {
          try {
            return [
              track.id,
              await withAbort(
                () => options.facts?.lookup(track, signal) ?? Promise.resolve([]),
                signal,
              ),
            ] as const;
          } catch (error) {
            if (signal.aborted || error instanceof GenerationAbortedError) {
              throw new GenerationAbortedError();
            }
            return [track.id, [] as MusicFact[]] as const;
          }
        }),
      );
      for (const [trackId, facts] of factResults) {
        featuredFacts.set(trackId, facts);
      }
    }
    const detail = await buildProgram(
      snapshot,
      command,
      plan,
      resolvedTracks,
      featuredFacts,
      signal,
    );
    setStage(snapshot.jobId, "committing", signal);
    assertActive(snapshot.jobId, signal);
    try {
      options.programs.commit(detail, () => {
        options.repository.succeed(snapshot.jobId, detail.program.id, now().toISOString());
      });
    } catch {
      throw new GenerationPipelineError("PROGRAM_GENERATION_COMMIT_FAILED");
    }

    publish(
      snapshot.jobId,
      (sequence, occurredAt) =>
        generationCompletedEventSchema.parse({
          eventId: randomId(),
          eventType: "generation.completed",
          version: 1,
          profileId: snapshot.profileId,
          correlationId: snapshot.jobId,
          sequence,
          occurredAt,
          payload: { jobId: snapshot.jobId, programId: detail.program.id },
        }),
      true,
    );
    publish(
      snapshot.jobId,
      (sequence, occurredAt) =>
        programCommittedEventSchema.parse({
          eventId: randomId(),
          eventType: "program.committed",
          version: 1,
          profileId: snapshot.profileId,
          correlationId: snapshot.jobId,
          sequence,
          occurredAt,
          payload: detail,
        }),
      true,
    );
  }

  function startRun(snapshot: ProgramGenerationSnapshot, command: GenerateProgramCommand): void {
    const controller = new AbortController();
    const run: ActiveRun = {
      controller,
      profileId: snapshot.profileId,
      promise: Promise.resolve(),
      timedOut: false,
    };
    const timeout = setTimeout(() => {
      run.timedOut = true;
      controller.abort();
    }, timeoutMs);
    timeout.unref();
    run.promise = Promise.resolve()
      .then(() => runGeneration(snapshot, command, controller.signal))
      .catch((error: unknown) => {
        const current = options.repository.getById(snapshot.jobId);
        if (!isActive(current)) {
          return;
        }
        const errorCode =
          run.timedOut || error instanceof GenerationAbortedError || hasErrorCode(error, "timeout")
            ? "PROGRAM_GENERATION_TIMEOUT"
            : error instanceof GenerationPipelineError
              ? error.code
              : "PROGRAM_GENERATION_FAILED";
        options.repository.fail(snapshot.jobId, errorCode, now().toISOString());
      })
      .finally(() => {
        clearTimeout(timeout);
        activeRuns.delete(snapshot.jobId);
      });
    activeRuns.set(snapshot.jobId, run);
  }

  return {
    active(profileId) {
      return options.repository.active(profileId);
    },
    async cancelProfile(profileId) {
      options.repository.cancelProfile(profileId, now().toISOString());
      const pending: Promise<void>[] = [];
      for (const run of activeRuns.values()) {
        if (run.profileId === profileId) {
          run.controller.abort();
          pending.push(run.promise);
        }
      }
      await Promise.allSettled(pending);
    },
    async close() {
      const profileIds = new Set([...activeRuns.values()].map((run) => run.profileId));
      await Promise.all([...profileIds].map((profileId) => this.cancelProfile(profileId)));
    },
    get(profileId, jobId) {
      const snapshot = options.repository.get(profileId, jobId);
      if (snapshot === null) {
        throw new ProgramGenerationNotFoundError();
      }
      return snapshot;
    },
    start(profileId, command, idempotencyKey) {
      const created = options.repository.create(
        randomId(),
        profileId,
        idempotencyKey,
        now().toISOString(),
      );
      if (created.created) {
        startRun(created.snapshot, command);
      }
      return created.snapshot;
    },
    async waitForIdle() {
      await Promise.allSettled([...activeRuns.values()].map((run) => run.promise));
    },
  };
}
