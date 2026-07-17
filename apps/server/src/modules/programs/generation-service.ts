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
  type ProgramDetail,
  type ProgramGenerationSnapshot,
  type ProgramGenerationStage,
  type TrackLyrics,
  type V1Event,
} from "@koradio/contracts";

import type { LibraryService } from "../library/index.js";
import type { ProfilePreferencesService } from "../profile-preferences/index.js";
import type { TasteService } from "../taste/index.js";
import {
  codexPlanningContextSchema,
  codexProgramPlanSchema,
  ttsSynthesisResultSchema,
  type CodexProgramPlan,
  type CodexProvider,
  type TtsProvider,
} from "./providers.js";
import type { ProgramGenerationRepository } from "./generation-persistence.js";
import type { ProgramService } from "./service.js";

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

type GenerationLibrary = Pick<LibraryService, "getLyrics" | "resolveAudio" | "searchWithFallback">;
type GenerationPrograms = Pick<ProgramService, "commit" | "list">;
type GenerationPreferences = Pick<ProfilePreferencesService, "get">;
type GenerationTaste = Pick<TasteService, "get">;

export interface CreateProgramGenerationServiceOptions {
  codex: CodexProvider;
  events: { publish(event: V1Event): void };
  library: GenerationLibrary;
  maximumTracks?: number;
  now?: () => Date;
  preferences: GenerationPreferences;
  programs: GenerationPrograms;
  randomId?: () => string;
  repository: ProgramGenerationRepository;
  taste: GenerationTaste;
  timeoutMs?: number;
  tts?: TtsProvider;
}

export interface ProgramGenerationService {
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

export function createProgramGenerationService(
  options: CreateProgramGenerationServiceOptions,
): ProgramGenerationService {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;
  const maximumTracks = Math.max(1, Math.min(options.maximumTracks ?? 5, 5));
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
    signal: AbortSignal,
  ): Promise<Array<{ audio: AudioResolution; track: MusicTrack }>> {
    setStage(snapshot.jobId, "resolving_tracks", signal);
    const search = await withAbort(
      () =>
        options.library.searchWithFallback(
          plan.musicQueries.map((query) => query.keyword),
          signal,
        ),
      signal,
    );
    assertActive(snapshot.jobId, signal);

    const resolved: Array<{ audio: AudioResolution; track: MusicTrack }> = [];
    let trackDegraded = false;
    for (const track of search.items.slice(0, maximumTracks)) {
      try {
        const audio = await withAbort(() => options.library.resolveAudio(track.id, signal), signal);
        assertActive(snapshot.jobId, signal);
        resolved.push({ audio, track });
      } catch (error) {
        if (signal.aborted || error instanceof GenerationAbortedError) {
          throw new GenerationAbortedError();
        }
        trackDegraded = true;
      }
    }

    if (trackDegraded) {
      publishDegraded(snapshot, "track", "PROGRAM_TRACK_UNAVAILABLE");
    }
    if (resolved.length === 0) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_NO_PLAYABLE_TRACKS");
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
    signal: AbortSignal,
  ): Promise<void> {
    setStage(snapshot.jobId, "enriching_tracks", signal);
    let degraded = false;
    for (const { track } of tracks) {
      try {
        const lyrics: TrackLyrics = await withAbort(
          () => options.library.getLyrics(track.id, signal),
          signal,
        );
        assertActive(snapshot.jobId, signal);
        degraded ||= lyrics.status === "unavailable";
      } catch (error) {
        if (signal.aborted || error instanceof GenerationAbortedError) {
          throw new GenerationAbortedError();
        }
        degraded = true;
      }
    }
    if (degraded) {
      publishDegraded(snapshot, "lyrics", "PROGRAM_LYRICS_UNAVAILABLE");
    }
  }

  async function buildProgram(
    snapshot: ProgramGenerationSnapshot,
    command: GenerateProgramCommand,
    plan: CodexProgramPlan,
    resolvedTracks: Array<{ audio: AudioResolution; track: MusicTrack }>,
    signal: AbortSignal,
  ): Promise<ProgramDetail> {
    setStage(snapshot.jobId, "synthesizing_dj", signal);
    const programId = randomId();
    const maximumSegues = Math.max(0, resolvedTracks.length - 1);
    let segueCount = 0;
    const playableScriptIndexes = new Set<number>();
    for (const [index, script] of plan.djScripts.entries()) {
      if (script.type === "intro" || script.type === "outro") {
        playableScriptIndexes.add(index);
      } else if (segueCount < maximumSegues) {
        playableScriptIndexes.add(index);
        segueCount += 1;
      }
    }

    let ttsDegraded = false;
    const djScripts: Array<DjScriptSegment & { durationMs: number | null }> = [];
    for (const [index, script] of plan.djScripts.entries()) {
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
        displayText: script.displayText,
        estimatedTiming,
        ttsAudioRef,
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
        createdAt: now().toISOString(),
      },
      djScripts: djScripts.map((segment) => ({
        id: segment.id,
        programId: segment.programId,
        type: segment.type,
        language: segment.language,
        text: segment.text,
        displayText: segment.displayText,
        estimatedTiming: segment.estimatedTiming,
        ttsAudioRef: segment.ttsAudioRef,
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
    const preferences = options.preferences.get(snapshot.profileId);
    const effectiveTaste = options.taste.get(snapshot.profileId).effective;
    const history = options.programs
      .list(snapshot.profileId, undefined, 20)
      .items.map((program) => ({
        title: program.title,
        scenarioText: program.scenarioText,
        createdAt: program.createdAt,
      }));
    const context = codexPlanningContextSchema.parse({
      scenarioText: command.scenarioText,
      effectiveTaste,
      history,
      currentTime: now().toISOString(),
      preferences: {
        djLanguage: preferences.djLanguage,
        djVoiceStyle: preferences.djVoiceStyle,
      },
    });
    const rawPlan = await withAbort(
      () => options.codex.plan(context, { correlationId: snapshot.jobId, signal }),
      signal,
    );
    assertActive(snapshot.jobId, signal);
    const parsedPlan = codexProgramPlanSchema.safeParse(rawPlan);
    if (!parsedPlan.success) {
      throw new GenerationPipelineError("PROGRAM_GENERATION_PLAN_INVALID");
    }
    const plan = parsedPlan.data;
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

    const resolvedTracks = await resolveTracks(snapshot, plan, signal);
    await enrichLyrics(snapshot, resolvedTracks, signal);
    const detail = await buildProgram(snapshot, command, plan, resolvedTracks, signal);
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
