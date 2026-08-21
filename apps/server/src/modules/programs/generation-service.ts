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
import {
  hasNonCanonicalVersionMarker,
  isCanonicalOriginalCandidate,
  isNonCanonicalVersion,
  matchesTrackRequest,
  sortCanonicalCandidates,
} from "../library/track-version.js";
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
import { normalizeProgramListeningIntent } from "./listening-intent.js";
import { createPlanningContext } from "./planning-context.js";
import { isPotentiallyEligibleTrack, trackEligibilityFailureReason } from "./track-eligibility.js";
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

const maximumDeepCommentaryCharacters = 120;

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
      `${track.title} 把旋律向上推开，再在句尾收住；${track.artist} 的声音和节奏留出了一点呼吸。${factText.length === 0 ? "此刻不补写传闻，只听见鼓点和换气里的细节。" : factText}`,
    );
  }
  return trimCommentary(
    `${track.title} lets the melody rise, then draws it back. ${track.artist}'s voice and the rhythm leave room to breathe. ${factText || "No backstage story is needed here; listen for the drum weight and the small shifts inside the phrase."}`,
  );
}

function ttsFailureCode(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === "timeout") return "PROGRAM_GENERATION_TTS_TIMEOUT";
  if (code === "output_invalid") return "PROGRAM_GENERATION_TTS_OUTPUT_INVALID";
  if (code === "storage_unavailable") return "PROGRAM_GENERATION_TTS_STORAGE_UNAVAILABLE";
  if (code === "voice_unavailable") return "PROGRAM_GENERATION_TTS_VOICE_UNAVAILABLE";
  if (code === "configuration_invalid") return "PROGRAM_GENERATION_TTS_CONFIGURATION_INVALID";
  return "PROGRAM_GENERATION_TTS_UNAVAILABLE";
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
    minimumLibraryTrackCount: number,
    scenarioText: string,
    listeningIntent: GenerateProgramCommand["listeningIntent"],
    lyricsCache: Map<string, TrackLyrics>,
    signal: AbortSignal,
  ): Promise<Array<{ audio: AudioResolution; track: MusicTrack }>> {
    setStage(snapshot.jobId, "resolving_tracks", signal);
    const libraryCandidates = new Map(libraryTracks.map((track) => [track.id, track]));
    const resolved: Array<{ audio: AudioResolution; track: MusicTrack }> = [];
    const failedTrackIds = new Set<string>();
    const selectedTrackIds = new Set<string>();
    const selectedArtists = new Set<string>();
    const searchCache = new Map<string, Promise<MusicTrack[]>>();
    const recentTrackIds = new Set(
      options.programs
        .list(snapshot.profileId, undefined, 10)
        .items.flatMap((program) => program.trackIds),
    );
    const normalizedListeningIntent = normalizeProgramListeningIntent(
      scenarioText,
      listeningIntent,
    );
    const normalizedScenario = scenarioText.toLocaleLowerCase("en-US");
    let rejectedInstrumental = 0;
    let rejectedLanguage = 0;
    let rejectedRegion = 0;
    let rejectedLyrics = 0;
    let rejectedNonCanonicalVersion = 0;
    let failedAudioResolution = 0;
    let trackDegraded = false;

    const isExplicitTrack = (track: MusicTrack): boolean => {
      const titleKey = track.title.trim().toLocaleLowerCase("en-US");
      return titleKey.length >= 2 && normalizedScenario.includes(titleKey);
    };

    const resolvedLibraryTrackCount = (): number =>
      resolved.filter(({ track }) => libraryCandidates.has(track.id)).length;

    const isEligible = async (track: MusicTrack): Promise<boolean> => {
      if (!isPotentiallyEligibleTrack(track, normalizedListeningIntent, scenarioText)) {
        const reason = trackEligibilityFailureReason(
          track,
          normalizedListeningIntent,
          scenarioText,
        );
        if (reason === "instrumental") rejectedInstrumental += 1;
        else if (reason === "language") rejectedLanguage += 1;
        else if (reason === "region") rejectedRegion += 1;
        else if (reason === "lyrics") rejectedLyrics += 1;
        trackDegraded = true;
        return false;
      }
      if (
        normalizedListeningIntent.vocalMode === "any" &&
        normalizedListeningIntent.languageScope === "any" &&
        normalizedListeningIntent.regionScope === "any"
      ) {
        return true;
      }
      try {
        const cached = lyricsCache.get(track.id);
        const lyrics =
          cached ?? (await withAbort(() => options.library.getLyrics(track.id, signal), signal));
        lyricsCache.set(track.id, lyrics);
        const reason = trackEligibilityFailureReason(
          track,
          normalizedListeningIntent,
          scenarioText,
          lyrics,
        );
        if (reason === "instrumental") rejectedInstrumental += 1;
        else if (reason === "language") rejectedLanguage += 1;
        else if (reason === "region") rejectedRegion += 1;
        else if (reason === "lyrics") rejectedLyrics += 1;
        if (reason !== null) {
          trackDegraded = true;
          return false;
        }
        return true;
      } catch {
        rejectedLyrics += 1;
        trackDegraded = true;
        return false;
      }
    };

    const tryResolve = async (
      track: MusicTrack,
      discovery = false,
      forced = false,
    ): Promise<boolean> => {
      if (selectedTrackIds.has(track.id)) {
        return false;
      }
      const artistKey = track.artist.trim().toLocaleLowerCase("en-US");
      const explicitArtist = artistKey.length > 0 && normalizedScenario.includes(artistKey);
      const explicitTrack = isExplicitTrack(track);
      if (
        discovery &&
        resolvedLibraryTrackCount() < minimumLibraryTrackCount &&
        resolved.length >=
          targetTrackCount - (minimumLibraryTrackCount - resolvedLibraryTrackCount())
      ) {
        trackDegraded = true;
        return false;
      }
      if (discovery && !explicitTrack && isAlternativeVersion(track)) {
        rejectedNonCanonicalVersion += 1;
        trackDegraded = true;
        return false;
      }
      if (
        !forced &&
        ((!explicitTrack && recentTrackIds.has(track.id)) ||
          (!explicitArtist && selectedArtists.has(artistKey)))
      ) {
        trackDegraded = true;
        return false;
      }
      if (!(await isEligible(track))) {
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
        failedAudioResolution += 1;
        trackDegraded = true;
        return false;
      }
    };

    const searchCandidates = (keyword: string): Promise<MusicTrack[]> => {
      const normalizedKeyword = keyword.trim().slice(0, 100).toLocaleLowerCase("en-US");
      if (normalizedKeyword.length === 0) {
        return Promise.resolve([]);
      }
      const cached = searchCache.get(normalizedKeyword);
      if (cached !== undefined) return cached;
      const request = withAbort(
        () => options.library.search(keyword.trim().slice(0, 100), signal),
        signal,
      )
        .then((search) => {
          assertActive(snapshot.jobId, signal);
          return sortCanonicalCandidates(search.items, keyword);
        })
        .catch((error: unknown) => {
          if (signal.aborted || error instanceof GenerationAbortedError) {
            throw error;
          }
          trackDegraded = true;
          return [];
        });
      searchCache.set(normalizedKeyword, request);
      return request;
    };

    const searchAndResolve = async (
      keyword: string,
      includeLibraryCandidates = false,
      expectedArtist?: string,
    ): Promise<boolean> => {
      for (const track of await searchCandidates(keyword)) {
        if (
          failedTrackIds.has(track.id) ||
          (!includeLibraryCandidates && libraryCandidates.has(track.id)) ||
          (expectedArtist !== undefined && !isCanonicalOriginalCandidate(track, expectedArtist))
        ) {
          continue;
        }
        if (await tryResolve(track, true)) {
          return true;
        }
      }
      return false;
    };

    if (listeningIntent?.anchorTrack !== null && listeningIntent?.anchorTrack !== undefined) {
      const anchor = listeningIntent.anchorTrack;
      const explicitlyRequestedNonCanonicalAnchor = hasNonCanonicalVersionMarker(anchor.title);
      try {
        const libraryMatches = libraryTracks.filter((track) =>
          matchesTrackRequest(track, anchor.title, anchor.artist),
        );
        const search = await searchCandidates(
          `${anchor.title}${anchor.artist === null ? "" : ` ${anchor.artist}`}`,
        );
        const candidates = sortCanonicalCandidates(
          [...libraryMatches, ...search].filter(
            (track, index, items) =>
              items.findIndex((candidate) => candidate.id === track.id) === index &&
              matchesTrackRequest(track, anchor.title, anchor.artist) &&
              (explicitlyRequestedNonCanonicalAnchor || !isNonCanonicalVersion(track)),
          ),
          anchor.title,
        );
        const selected = candidates[0];
        if (selected === undefined || !(await tryResolve(selected, false, true))) {
          throw new GenerationPipelineError("PROGRAM_GENERATION_ANCHOR_TRACK_UNAVAILABLE");
        }
      } catch (error) {
        if (signal.aborted || error instanceof GenerationAbortedError) {
          throw new GenerationAbortedError();
        }
        if (error instanceof GenerationPipelineError) throw error;
        throw new GenerationPipelineError("PROGRAM_GENERATION_ANCHOR_TRACK_UNAVAILABLE");
      }
    }

    const intentRounds = strictTrackCount
      ? [
          plan.trackIntents.slice(0, targetTrackCount),
          ...Array.from(
            { length: Math.ceil(Math.max(0, plan.trackIntents.length - targetTrackCount) / 4) },
            (_, index) =>
              plan.trackIntents.slice(
                targetTrackCount + index * 4,
                targetTrackCount + (index + 1) * 4,
              ),
          ),
        ]
      : [plan.trackIntents];
    for (const intents of intentRounds) {
      await Promise.all(
        intents
          .filter((intent) => intent.kind === "discovery")
          .map((intent) => searchCandidates(intent.keyword)),
      );
      for (const intent of intents) {
        if (resolved.length === targetTrackCount) break;
        if (intent.kind === "library") {
          const track = libraryCandidates.get(intent.trackId);
          if (track === undefined) {
            trackDegraded = true;
            continue;
          }
          if (isAlternativeVersion(track) && !isExplicitTrack(track)) {
            rejectedNonCanonicalVersion += 1;
            trackDegraded = true;
            continue;
          }
          if (!(await tryResolve(track))) {
            await searchAndResolve(track.artist, true, track.artist);
          }
          continue;
        }
        await searchAndResolve(intent.keyword, false, intent.expectedArtist ?? undefined);
      }
      if (resolved.length === targetTrackCount) break;
    }

    for (const track of libraryTracks) {
      if (
        resolved.length === targetTrackCount ||
        resolvedLibraryTrackCount() >= minimumLibraryTrackCount
      ) {
        break;
      }
      if (isAlternativeVersion(track) && !isExplicitTrack(track)) {
        rejectedNonCanonicalVersion += 1;
        trackDegraded = true;
        continue;
      }
      await tryResolve(track);
    }

    if (trackDegraded) {
      publishDegraded(snapshot, "track", "PROGRAM_TRACK_UNAVAILABLE");
    }
    const insufficientTracksCode = (): string => {
      if (resolvedLibraryTrackCount() < minimumLibraryTrackCount) {
        return "PROGRAM_GENERATION_INSUFFICIENT_LIBRARY_TRACKS";
      }
      if (
        normalizedListeningIntent.languageScope === "chinese" &&
        rejectedLanguage + rejectedLyrics > 0
      ) {
        return "PROGRAM_GENERATION_INSUFFICIENT_CHINESE_TRACKS";
      }
      if (
        normalizedListeningIntent.regionScope === "western" &&
        normalizedListeningIntent.vocalMode === "vocal-only" &&
        rejectedRegion + rejectedInstrumental + rejectedLyrics > 0
      ) {
        return "PROGRAM_GENERATION_INSUFFICIENT_WESTERN_VOCAL_TRACKS";
      }
      if (
        normalizedListeningIntent.regionScope === "western" &&
        rejectedRegion + rejectedLyrics > 0
      ) {
        return "PROGRAM_GENERATION_INSUFFICIENT_WESTERN_TRACKS";
      }
      if (
        normalizedListeningIntent.vocalMode === "vocal-only" &&
        rejectedLyrics + rejectedInstrumental > 0
      ) {
        return "PROGRAM_GENERATION_INSUFFICIENT_VOCAL_TRACKS";
      }
      if (
        normalizedListeningIntent.languageScope !== "any" &&
        rejectedLanguage + rejectedLyrics > 0
      ) {
        return "PROGRAM_GENERATION_INSUFFICIENT_LANGUAGE_TRACKS";
      }
      if (rejectedNonCanonicalVersion > 0) {
        return "PROGRAM_GENERATION_INSUFFICIENT_CANONICAL_TRACKS";
      }
      if (failedAudioResolution > 0) {
        return "PROGRAM_GENERATION_INSUFFICIENT_PLAYABLE_AUDIO";
      }
      return "PROGRAM_GENERATION_INSUFFICIENT_TRACKS";
    };
    if (resolved.length === 0) {
      if (minimumLibraryTrackCount > 0 && resolvedLibraryTrackCount() < minimumLibraryTrackCount) {
        throw new GenerationPipelineError("PROGRAM_GENERATION_INSUFFICIENT_LIBRARY_TRACKS");
      }
      if (
        normalizedListeningIntent.languageScope === "chinese" &&
        rejectedLanguage + rejectedLyrics > 0
      ) {
        throw new GenerationPipelineError("PROGRAM_GENERATION_INSUFFICIENT_CHINESE_TRACKS");
      }
      if (
        normalizedListeningIntent.regionScope === "western" &&
        normalizedListeningIntent.vocalMode === "vocal-only" &&
        rejectedRegion + rejectedInstrumental + rejectedLyrics > 0
      ) {
        throw new GenerationPipelineError("PROGRAM_GENERATION_INSUFFICIENT_WESTERN_VOCAL_TRACKS");
      }
      if (
        normalizedListeningIntent.regionScope === "western" &&
        rejectedRegion + rejectedLyrics > 0
      ) {
        throw new GenerationPipelineError("PROGRAM_GENERATION_INSUFFICIENT_WESTERN_TRACKS");
      }
      if (
        normalizedListeningIntent.vocalMode === "vocal-only" &&
        rejectedLyrics + rejectedInstrumental > 0
      ) {
        throw new GenerationPipelineError("PROGRAM_GENERATION_INSUFFICIENT_VOCAL_TRACKS");
      }
      throw new GenerationPipelineError("PROGRAM_GENERATION_NO_PLAYABLE_TRACKS");
    }
    if (
      (strictTrackCount && resolved.length !== targetTrackCount) ||
      resolvedLibraryTrackCount() < minimumLibraryTrackCount
    ) {
      throw new GenerationPipelineError(insufficientTracksCode());
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

    if (playableScriptIndexes.size > 0 && options.tts === undefined) {
      publishDegraded(snapshot, "tts", "PROGRAM_TTS_UNAVAILABLE");
      throw new GenerationPipelineError("PROGRAM_GENERATION_TTS_UNAVAILABLE");
    }
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
          const code = ttsFailureCode(error);
          publishDegraded(snapshot, "tts", code);
          throw new GenerationPipelineError(code);
        }
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
    const libraryTracks = options.library.candidateTracks(snapshot.profileId, 1_000);
    const listeningIntent = normalizeProgramListeningIntent(
      command.scenarioText,
      command.listeningIntent,
    );
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
      listeningIntent,
      libraryTracks,
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
      context.library.minimumLibraryTrackCount,
      command.scenarioText,
      listeningIntent,
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
