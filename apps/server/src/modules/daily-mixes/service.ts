import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  dailyMixTodayResponseSchema,
  dailyMixPlaybackCheckpointSchema,
  type DailyMixDetail,
  type DailyMixGenerationSnapshot,
  type DailyMixListResponse,
  type DailyMixPlaybackCheckpoint,
  type DailyMixTodayResponse,
  type DailyMixTrackBucket,
  type FeedbackEvent,
  type MusicTrack,
  type PlaybackSourceSession,
  type SaveDailyMixCheckpointCommand,
} from "@koradio/contracts";

import type { FeedbackRepository } from "../feedback/index.js";
import type { LibraryService } from "../library/index.js";
import { isCanonicalOriginalCandidate, sortCanonicalCandidates } from "../library/track-version.js";
import type { ProgramService } from "../programs/index.js";
import type { TasteService } from "../taste/index.js";
import {
  DailyMixDataError,
  DailyMixNotFoundError,
  readDailyMixDetail,
  type DailyMixRepository,
} from "./persistence.js";
import {
  dailyMixPlanSchema,
  dailyMixPlanningContextSchema,
  type DailyMixCandidate,
  type DailyMixPlannerProvider,
} from "./providers.js";

const targetTrackCount = 20;
const minimumLibraryCount = 2;
const primaryDiscoveryCounts = { close: 12, adjacent: 4, surprise: 2 } as const;
const dailyMixSchedule: DailyMixTrackBucket[] = [
  "close",
  "adjacent",
  "close",
  "library",
  "close",
  "surprise",
  "close",
  "adjacent",
  "close",
  "close",
  "library",
  "close",
  "adjacent",
  "close",
  "surprise",
  "close",
  "adjacent",
  "close",
  "close",
  "close",
];

interface ResolvedCandidate {
  bucket: DailyMixTrackBucket;
  track: MusicTrack;
}

interface ActiveRun {
  controller: AbortController;
  promise: Promise<void>;
}

export class DailyMixGenerationNotFoundError extends Error {}
export class DailyMixCheckpointPolicyError extends Error {}
export class DailyMixCheckpointStaleError extends Error {}

export interface CreateDailyMixServiceOptions {
  client: DatabaseSync;
  feedback: Pick<FeedbackRepository, "list">;
  library: Pick<LibraryService, "candidateTracks" | "getTracks" | "resolveAudio" | "search">;
  now?: () => Date;
  planner: DailyMixPlannerProvider | (() => DailyMixPlannerProvider);
  programs: Pick<ProgramService, "current" | "findProgram" | "list">;
  randomId?: () => string;
  repository: DailyMixRepository;
  taste: Pick<TasteService, "get">;
  timeoutMs?: number;
}

export interface DailyMixService {
  close(): Promise<void>;
  activateSource(
    profileId: string,
    command: { kind: "program" | "daily"; sourceId: string },
  ): PlaybackSourceSession;
  ensure(profileId: string, retry?: boolean): DailyMixGenerationSnapshot;
  get(profileId: string, id: string): DailyMixDetail;
  getGeneration(profileId: string, id: string): DailyMixGenerationSnapshot;
  getCheckpoint(profileId: string): DailyMixPlaybackCheckpoint | null;
  getSourceSession(profileId: string): PlaybackSourceSession | null;
  list(profileId: string): DailyMixListResponse;
  saveCheckpoint(
    profileId: string,
    command: SaveDailyMixCheckpointCommand,
  ): DailyMixPlaybackCheckpoint;
  today(profileId: string): DailyMixTodayResponse;
}

function formatLocalDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftLocalDate(value: Date, days: number): string {
  return formatLocalDate(new Date(value.getFullYear(), value.getMonth(), value.getDate() + days));
}

function canonicalTrackKey(track: Pick<MusicTrack, "title" | "artist">): string {
  return `${track.title}|${track.artist}`.trim().toLocaleLowerCase("en-US");
}

function artistKey(track: Pick<MusicTrack, "artist">): string {
  return track.artist.trim().toLocaleLowerCase("en-US");
}

async function mapWithConcurrency<Value, Result>(
  values: readonly Value[],
  concurrency: number,
  mapper: (value: Value) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (index < values.length) {
        const current = index;
        index += 1;
        const value = values[current];
        if (value !== undefined) results[current] = await mapper(value);
      }
    }),
  );
  return results;
}

function activeRecentDislikes(events: FeedbackEvent[], now: Date): Set<string> {
  const latest = new Map<string, FeedbackEvent>();
  for (const event of events) {
    if (event.type !== "track_disliked" && event.type !== "track_dislike_removed") continue;
    latest.set(event.targetId, event);
  }
  const minimum = now.getTime() - 48 * 60 * 60_000;
  return new Set(
    [...latest.values()]
      .filter((event) => event.type === "track_disliked" && Date.parse(event.createdAt) >= minimum)
      .map((event) => event.targetId),
  );
}

function arrange(candidates: ResolvedCandidate[]): ResolvedCandidate[] {
  const groups = new Map<DailyMixTrackBucket, ResolvedCandidate[]>([
    ["library", []],
    ["close", []],
    ["adjacent", []],
    ["surprise", []],
  ]);
  candidates.forEach((candidate) => groups.get(candidate.bucket)?.push(candidate));
  const fallback = candidates.filter((candidate) => candidate.bucket !== "library");
  const used = new Set<string>();
  const ordered = dailyMixSchedule.flatMap((bucket) => {
    let direct = groups.get(bucket)?.shift();
    while (direct !== undefined && used.has(direct.track.id)) {
      direct = groups.get(bucket)?.shift();
    }
    const selected = direct ?? fallback.find((candidate) => !used.has(candidate.track.id));
    if (selected === undefined) return [];
    used.add(selected.track.id);
    return [selected];
  });
  const unique = ordered;
  for (let index = 1; index < unique.length; index += 1) {
    const previous = unique[index - 1];
    const current = unique[index];
    if (previous === undefined || current === undefined) continue;
    if (artistKey(previous.track) !== artistKey(current.track)) continue;
    const swap = unique.findIndex((candidate, candidateIndex) => {
      const next = unique[candidateIndex + 1];
      return (
        candidateIndex > index &&
        artistKey(candidate.track) !== artistKey(previous.track) &&
        (next === undefined || artistKey(current.track) !== artistKey(next.track))
      );
    });
    const replacement = unique[swap];
    if (swap > index && replacement !== undefined) {
      unique[index] = replacement;
      unique[swap] = current;
    }
  }
  return unique.slice(0, targetTrackCount);
}

export function createDailyMixService(options: CreateDailyMixServiceOptions): DailyMixService {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const activeRuns = new Map<string, ActiveRun>();
  options.repository.recoverInterrupted(now().toISOString());

  const planner = (): DailyMixPlannerProvider =>
    typeof options.planner === "function" ? options.planner() : options.planner;

  async function run(snapshot: DailyMixGenerationSnapshot, signal: AbortSignal): Promise<void> {
    const current = now();
    const minimumDate = shiftLocalDate(current, -6);
    options.repository.markRunning(snapshot.jobId, current.toISOString());
    const taste = options.taste.get(snapshot.profileId);
    const libraryTracks = options.library.candidateTracks(snapshot.profileId, 1_000);
    const programTracks = options.programs
      .list(snapshot.profileId, undefined, 20)
      .items.filter(
        (program) => Date.parse(program.createdAt) >= current.getTime() - 24 * 60 * 60_000,
      )
      .flatMap((program) => program.trackIds);
    const recentTrackIds = new Set([
      ...programTracks,
      ...options.repository.recentTrackIds(snapshot.profileId, minimumDate),
    ]);
    const dislikedTrackIds = activeRecentDislikes(
      options.feedback.list(snapshot.profileId),
      current,
    );
    const recentTracks = options.library.getTracks([...recentTrackIds]);
    const dislikedTracks = options.library.getTracks([...dislikedTrackIds]);
    const baseContext = {
      localDate: snapshot.localDate,
      effectiveTaste: taste.effective,
      tasteBlueprint: taste.blueprint ?? null,
      libraryTracks: libraryTracks.map((track) => ({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationMs: track.durationMs,
      })),
      recentTracks: recentTracks.map((track) => ({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
      })),
      dislikedTracks: dislikedTracks.map((track) => ({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
      })),
      currentTime: current.toISOString(),
      refill: null,
    };
    const context = dailyMixPlanningContextSchema.parse(baseContext);
    const plan = dailyMixPlanSchema.parse(
      await planner().planDailyMix(context, { correlationId: snapshot.jobId, signal }),
    );
    if (signal.aborted) throw new Error("aborted");
    options.repository.setStage(snapshot.jobId, "resolving_tracks", now().toISOString());

    const libraryIds = new Set(libraryTracks.map((track) => track.id));
    const excludedIds = new Set([...recentTrackIds, ...dislikedTrackIds]);
    const excludedKeys = new Set([...recentTracks, ...dislikedTracks].map(canonicalTrackKey));

    async function resolveCandidates(
      candidates: DailyMixCandidate[],
    ): Promise<ResolvedCandidate[]> {
      const resolved = await mapWithConcurrency(candidates, 6, async (candidate) => {
        if (signal.aborted) return null;
        if (candidate.kind === "library") {
          const track = libraryTracks.find((item) => item.id === candidate.trackId);
          if (track === undefined || excludedIds.has(track.id)) return null;
          try {
            await options.library.resolveAudio(track.id, signal);
            return { bucket: "library" as const, track };
          } catch {
            return null;
          }
        }
        try {
          const response = await options.library.search(candidate.keyword, signal);
          const candidates = sortCanonicalCandidates(response.items, candidate.keyword).filter(
            (track) =>
              !libraryIds.has(track.id) &&
              !excludedIds.has(track.id) &&
              !excludedKeys.has(canonicalTrackKey(track)) &&
              isCanonicalOriginalCandidate(track, candidate.expectedArtist),
          );
          for (const track of candidates.slice(0, 3)) {
            try {
              await options.library.resolveAudio(track.id, signal);
              return { bucket: candidate.bucket, track };
            } catch {}
          }
        } catch {
          return null;
        }
        return null;
      });
      return resolved.filter((candidate): candidate is ResolvedCandidate => candidate !== null);
    }

    const candidatePool = await resolveCandidates(plan.candidates);
    const selected = new Map<string, ResolvedCandidate>();
    const artistCounts = new Map<string, number>();
    const choose = (candidate: ResolvedCandidate): boolean => {
      const key = canonicalTrackKey(candidate.track);
      const artist = artistKey(candidate.track);
      if (selected.has(key) || (artistCounts.get(artist) ?? 0) >= 2) return false;
      selected.set(key, candidate);
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
      return true;
    };
    const chooseBucket = (bucket: DailyMixTrackBucket, count: number): void => {
      candidatePool
        .filter((item) => item.bucket === bucket)
        .some((candidate) => {
          choose(candidate);
          return [...selected.values()].filter((item) => item.bucket === bucket).length >= count;
        });
    };
    chooseBucket("library", Math.min(minimumLibraryCount, libraryTracks.length));
    chooseBucket("close", primaryDiscoveryCounts.close);
    chooseBucket("adjacent", primaryDiscoveryCounts.adjacent);
    chooseBucket("surprise", primaryDiscoveryCounts.surprise);

    const missing = {
      close: Math.max(
        0,
        primaryDiscoveryCounts.close -
          [...selected.values()].filter((item) => item.bucket === "close").length,
      ),
      adjacent: Math.max(
        0,
        primaryDiscoveryCounts.adjacent -
          [...selected.values()].filter((item) => item.bucket === "adjacent").length,
      ),
      surprise: Math.max(
        0,
        primaryDiscoveryCounts.surprise -
          [...selected.values()].filter((item) => item.bucket === "surprise").length,
      ),
    };
    if (missing.close + missing.adjacent + missing.surprise > 0) {
      const refillContext = dailyMixPlanningContextSchema.parse({
        ...baseContext,
        refill: {
          ...missing,
          excludedQueries: plan.candidates.flatMap((candidate) =>
            candidate.kind === "discovery"
              ? [`${candidate.keyword}|${candidate.expectedArtist}`]
              : [],
          ),
        },
      });
      const refill = dailyMixPlanSchema.parse(
        await planner().planDailyMix(refillContext, { correlationId: snapshot.jobId, signal }),
      );
      for (const candidate of await resolveCandidates(refill.candidates)) choose(candidate);
    }

    for (const candidate of candidatePool) {
      if (selected.size >= targetTrackCount) break;
      choose(candidate);
    }
    const ordered = arrange([...selected.values()]);
    if (ordered.length !== targetTrackCount) {
      throw new Error("insufficient_tracks");
    }
    options.repository.setStage(snapshot.jobId, "committing", now().toISOString());
    options.client.exec("BEGIN IMMEDIATE");
    try {
      options.repository.commit(
        snapshot.jobId,
        ordered.map((item) => ({ trackId: item.track.id, bucket: item.bucket })),
        now().toISOString(),
      );
      options.repository.prune(snapshot.profileId, minimumDate);
      options.client.exec("COMMIT");
    } catch (error) {
      options.client.exec("ROLLBACK");
      throw error;
    }
  }

  function start(snapshot: DailyMixGenerationSnapshot): void {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    timeout.unref();
    const promise = Promise.resolve()
      .then(() => run(snapshot, controller.signal))
      .catch((error: unknown) => {
        const current = options.repository.getSnapshot(snapshot.profileId, snapshot.jobId);
        if (current === null || !["queued", "running"].includes(current.status)) return;
        options.repository.fail(
          snapshot.jobId,
          controller.signal.aborted
            ? "DAILY_MIX_GENERATION_TIMEOUT"
            : error instanceof DailyMixDataError
              ? "DAILY_MIX_GENERATION_COMMIT_FAILED"
              : "DAILY_MIX_GENERATION_INSUFFICIENT_TRACKS",
          now().toISOString(),
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        activeRuns.delete(snapshot.jobId);
      });
    activeRuns.set(snapshot.jobId, { controller, promise });
  }

  return {
    activateSource(profileId, command) {
      const existing = options.repository.findSourceSession(profileId);
      if (command.kind === "program") {
        if (options.programs.findProgram(profileId, command.sourceId) === null) {
          throw new DailyMixNotFoundError();
        }
        return options.repository.upsertSourceSession(
          profileId,
          "program",
          command.sourceId,
          existing?.dailyMixId ?? null,
          now().toISOString(),
        );
      }
      readDailyMixDetail(options.repository, options.library, profileId, command.sourceId);
      return options.repository.upsertSourceSession(
        profileId,
        "daily",
        existing?.programId ?? options.programs.current(profileId)?.program.id ?? null,
        command.sourceId,
        now().toISOString(),
      );
    },
    async close() {
      activeRuns.forEach((run) => {
        run.controller.abort();
      });
      await Promise.allSettled([...activeRuns.values()].map((run) => run.promise));
    },
    ensure(profileId, retry = false) {
      const localDate = formatLocalDate(now());
      const existing = options.repository.findToday(profileId, localDate);
      if (existing !== null) {
        const snapshot = options.repository.getSnapshot(profileId, existing.id);
        if (snapshot === null) throw new DailyMixDataError();
        if (snapshot.status !== "failed" || !retry) return snapshot;
        const restarted = options.repository.resetForRetry(snapshot.jobId, now().toISOString());
        start(restarted);
        return restarted;
      }
      const snapshot = options.repository.create(
        randomId(),
        profileId,
        localDate,
        now().toISOString(),
      );
      start(snapshot);
      return snapshot;
    },
    get(profileId, id) {
      return readDailyMixDetail(options.repository, options.library, profileId, id);
    },
    getGeneration(profileId, id) {
      const snapshot = options.repository.getSnapshot(profileId, id);
      if (snapshot === null) throw new DailyMixGenerationNotFoundError();
      return snapshot;
    },
    getCheckpoint(profileId) {
      return options.repository.findCheckpoint(profileId)?.checkpoint ?? null;
    },
    getSourceSession(profileId) {
      return options.repository.findSourceSession(profileId);
    },
    list(profileId) {
      return options.repository.list(profileId, shiftLocalDate(now(), -6));
    },
    saveCheckpoint(profileId, command) {
      if (profileId !== command.profileId) throw new DailyMixCheckpointPolicyError();
      const detail = readDailyMixDetail(
        options.repository,
        options.library,
        profileId,
        command.dailyMixId,
      );
      const relation = detail.tracks[command.position];
      if (
        relation?.track.id !== command.trackId ||
        command.positionMs > relation.track.durationMs ||
        (command.status === "completed" &&
          (command.position !== detail.tracks.length - 1 ||
            command.positionMs !== relation.track.durationMs))
      ) {
        throw new DailyMixCheckpointPolicyError();
      }
      const existing = options.repository.findCheckpoint(profileId);
      if (existing !== null && command.leaseEpoch < existing.leaseEpoch) {
        throw new DailyMixCheckpointStaleError();
      }
      const checkpoint = dailyMixPlaybackCheckpointSchema.parse({
        profileId,
        dailyMixId: command.dailyMixId,
        trackId: command.trackId,
        position: command.position,
        positionMs: command.positionMs,
        volume: command.volume,
        status: command.status,
        savedAt: now().toISOString(),
      });
      options.repository.saveCheckpoint(checkpoint, command.leaseEpoch);
      return checkpoint;
    },
    today(profileId) {
      const localDate = formatLocalDate(now());
      const row = options.repository.findToday(profileId, localDate);
      if (row === null) {
        return dailyMixTodayResponseSchema.parse({ localDate, generation: null, mix: null });
      }
      const generation = options.repository.getSnapshot(profileId, row.id);
      return dailyMixTodayResponseSchema.parse({
        localDate,
        generation,
        mix:
          row.status === "succeeded"
            ? readDailyMixDetail(options.repository, options.library, profileId, row.id)
            : null,
      });
    },
  };
}

export { formatLocalDate };
