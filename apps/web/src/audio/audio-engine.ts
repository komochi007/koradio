import {
  djScriptSegmentSchema,
  type PlaybackCheckpoint,
  type PlaybackTimelineItem,
  type ProgramDetail,
  type AudioResolution,
} from "@koradio/contracts";

import { ApiRequestError, requestJson } from "../shared/api.js";
import type { ServiceTransport } from "../shared/transport.js";
import { getPlaybackCheckpoint, savePlaybackCheckpoint } from "./api.js";
import {
  createPlaybackLeaseCoordinator,
  type PlaybackLeaseCoordinator,
} from "./lease-coordinator.js";
import type {
  AudioEngineFacade,
  AudioEngineSnapshot,
  AudioPlaybackState,
  LeasePlaybackSnapshot,
  LoadProgramOptions,
  PreviewAudioOptions,
} from "./types.js";

interface AudioElementLike {
  currentTime: number;
  duration: number;
  error: MediaError | null;
  paused: boolean;
  preload: string;
  src: string;
  volume: number;
  addEventListener(type: string, listener: () => void): void;
  load(): void;
  pause(): void;
  play(): Promise<void>;
  removeAttribute(name: string): void;
}

interface AudioPreloader {
  clear(): void;
  preload(source: string): void;
}

interface CreateAudioEngineOptions {
  activateProgramHandoff?: (profileId: string, programId: string) => Promise<ProgramDetail>;
  audio?: AudioElementLike;
  voiceAudio?: AudioElementLike;
  checkpointIntervalMs?: number;
  lease?: PlaybackLeaseCoordinator;
  now?: () => number;
  preloader?: AudioPreloader;
  resolveTrackAudio?: (profileId: string, trackId: string) => Promise<AudioResolution>;
  transport: ServiceTransport;
}

interface PreviewContext {
  kind: "dj" | "track";
  previewId: string;
  resolvedAudioRef: string;
  durationMs: number;
  returnIndex: number | undefined;
  returnPositionMs: number;
  returnWasPlaying: boolean;
}

const initialSnapshot: AudioEngineSnapshot = {
  ownership: "passive",
  state: "idle",
  profileId: undefined,
  programId: undefined,
  currentItem: undefined,
  currentIndex: 0,
  itemCount: 0,
  positionMs: 0,
  durationMs: 0,
  volume: 1,
  leaseEpoch: undefined,
  mediaError: undefined,
  checkpointError: false,
};

function createAudioElement(): AudioElementLike {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  return audio;
}

function createSilentAudioElement(): AudioElementLike {
  return {
    currentTime: 0,
    duration: 0,
    error: null,
    paused: true,
    preload: "none",
    src: "",
    volume: 1,
    addEventListener() {},
    load() {},
    pause() {},
    play: () => Promise.resolve(),
    removeAttribute() {},
  };
}

function createPreloader(): AudioPreloader {
  let link: HTMLLinkElement | undefined;
  return {
    clear() {
      link?.remove();
      link = undefined;
    },
    preload(source) {
      link?.remove();
      link = document.createElement("link");
      link.rel = "preload";
      link.as = "audio";
      link.href = source;
      document.head.append(link);
    },
  };
}

function playableSource(reference: string): string {
  return reference.includes("://") || reference.startsWith("/") ? reference : `/${reference}`;
}

function sourceFor(item: PlaybackTimelineItem): string {
  return playableSource(item.kind === "track" ? item.resolvedAudioRef : item.audioRef);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function spatiallySmoothWaveform(values: number[]): number[] {
  return values.map((value, index) => {
    const previous = Number(values[Math.max(0, index - 1)]);
    const next = Number(values[Math.min(values.length - 1, index + 1)]);
    return (previous + value * 2 + next) / 4;
  });
}

export function createAudioEngine(options: CreateAudioEngineOptions): AudioEngineFacade {
  const audio = options.audio ?? createAudioElement();
  const voiceAudio =
    options.voiceAudio ??
    (options.audio === undefined ? createAudioElement() : createSilentAudioElement());
  const preloader = options.preloader ?? createPreloader();
  const now = options.now ?? Date.now;
  const checkpointIntervalMs = options.checkpointIntervalMs ?? 15_000;
  const listeners = new Set<() => void>();
  let snapshot = initialSnapshot;
  let program: ProgramDetail | undefined;
  let timeline: PlaybackTimelineItem[] = [];
  let profileId: string | undefined;
  let currentIndex = 0;
  let lastCheckpointAt = 0;
  let loadVersion = 0;
  let expectedSource: string | undefined;
  let previewContext: PreviewContext | undefined;
  let queuedPreview: PreviewAudioOptions | undefined;
  let scheduledProgramHandoff: ProgramDetail | undefined;
  let voiceActive = false;
  let voiceRamp: ReturnType<typeof setInterval> | undefined;
  let userVolume = 1;
  let analyser: AnalyserNode | undefined;
  let audioContext: AudioContext | undefined;
  let waveformFrame: number | undefined;
  let lastWaveformSampleAt: number | undefined;
  let waveformConnected = false;
  let smoothedWaveform: number[] | undefined;
  const audioResolutions = new Map<string, { expiresAtMs: number; resolvedAudioRef: string }>();
  const retriedMediaItems = new Set<string>();
  const triggeredVoiceCues = new Set<string>();
  const revealedVoiceSegments = new Set<string>();
  let destroyed = false;

  async function yieldPlayback(): Promise<void> {
    previewContext = undefined;
    update({ preview: undefined });
    await checkpoint(snapshot.state === "completed" ? "completed" : "paused");
    stopMedia();
  }

  const lease =
    options.lease ??
    createPlaybackLeaseCoordinator({
      onYield: yieldPlayback,
    });

  function currentItem(): PlaybackTimelineItem | undefined {
    return timeline[currentIndex];
  }

  function activePreviewId(): string | undefined {
    return previewContext?.previewId;
  }

  function isCurrentPreview(version: number, previewId: string): boolean {
    return (
      version === loadVersion &&
      activePreviewId() === previewId &&
      lease.getState().ownership === "active"
    );
  }

  function remoteSnapshot(value: LeasePlaybackSnapshot): AudioEngineSnapshot {
    const item = timeline.find((candidate) => candidate.id === value.timelineItemId);
    return {
      ownership: "passive",
      state: value.state,
      profileId: value.profileId,
      programId: value.programId,
      currentItem: item,
      currentIndex: value.currentIndex,
      itemCount: value.itemCount,
      positionMs: value.positionMs,
      durationMs: value.durationMs,
      volume: value.volume,
      leaseEpoch: value.leaseEpoch,
      mediaError: value.mediaError,
      checkpointError: false,
    };
  }

  function publish(): void {
    for (const listener of listeners) listener();
    const item = snapshot.currentItem;
    if (
      snapshot.ownership === "active" &&
      snapshot.profileId !== undefined &&
      snapshot.programId !== undefined &&
      snapshot.leaseEpoch !== undefined &&
      item !== undefined
    ) {
      lease.publishSnapshot({
        profileId: snapshot.profileId,
        programId: snapshot.programId,
        timelineItemId: item.id,
        currentIndex: snapshot.currentIndex,
        itemCount: snapshot.itemCount,
        positionMs: snapshot.positionMs,
        durationMs: snapshot.durationMs,
        volume: snapshot.volume,
        state: snapshot.state,
        leaseEpoch: snapshot.leaseEpoch,
        ...(snapshot.mediaError === undefined ? {} : { mediaError: snapshot.mediaError }),
      });
    }
  }

  function update(next: Partial<AudioEngineSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    publish();
  }

  function stopWaveformSampling(): void {
    if (waveformFrame !== undefined) cancelAnimationFrame(waveformFrame);
    waveformFrame = undefined;
  }

  function readWaveform(): number[] | undefined {
    if (analyser === undefined) return undefined;
    const values = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(values);
    const raw = Array.from({ length: 64 }, (_, index) => {
      const start = Math.floor((index * values.length) / 64);
      const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / 64));
      let total = 0;
      for (let cursor = start; cursor < end; cursor += 1)
        total += Math.abs(Number(values[cursor]) - 128);
      return Math.min(1, total / (end - start) / 34);
    });
    const spatial = spatiallySmoothWaveform(raw);
    smoothedWaveform = spatial.map((value, index) => {
      const previous = smoothedWaveform?.[index] ?? value;
      return previous * 0.8 + value * 0.2;
    });
    return smoothedWaveform;
  }

  function publishWaveformSample(): void {
    const waveform = readWaveform();
    const active = waveform?.some((value) => value > 0.015) ?? false;
    update({ waveform: active ? waveform : undefined, waveformUnavailable: !active });
  }

  function startWaveformSampling(): void {
    if (waveformFrame !== undefined || analyser === undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      publishWaveformSample();
      return;
    }
    const sample = (timestamp: number): void => {
      if (destroyed || analyser === undefined) return;
      if (lastWaveformSampleAt === undefined || timestamp - lastWaveformSampleAt >= 42) {
        lastWaveformSampleAt = timestamp;
        publishWaveformSample();
      }
      if (!audio.paused) waveformFrame = requestAnimationFrame(sample);
      else waveformFrame = undefined;
    };
    waveformFrame = requestAnimationFrame(sample);
  }

  function initializeWaveform(): void {
    if (waveformConnected || typeof window === "undefined") return;
    if (!(audio instanceof HTMLAudioElement)) {
      update({ waveformUnavailable: true });
      return;
    }
    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.84;
      audioContext.createMediaElementSource(audio).connect(analyser);
      analyser.connect(audioContext.destination);
      waveformConnected = true;
    } catch {
      update({ waveformUnavailable: true });
    }
  }

  async function prepareWaveform(): Promise<void> {
    initializeWaveform();
    if (audioContext?.state === "suspended") await audioContext.resume();
  }

  function rampMusic(target: number, durationMs: number): void {
    if (voiceRamp !== undefined) clearInterval(voiceRamp);
    const start = audio.volume;
    const startedAt = now();
    voiceRamp = setInterval(() => {
      const progress = clamp((now() - startedAt) / durationMs, 0, 1);
      audio.volume = start + (target - start) * progress;
      if (progress >= 1 && voiceRamp !== undefined) {
        clearInterval(voiceRamp);
        voiceRamp = undefined;
      }
    }, 25);
  }

  function originalTrackPosition(trackId: string): number {
    return (
      program?.timeline.findIndex((item) => item.kind === "track" && item.trackId === trackId) ?? -1
    );
  }

  function cueBeforeTrack(trackIndex: number): PlaybackTimelineItem | undefined {
    const track = timeline[trackIndex];
    if (program === undefined || track?.kind !== "track") return undefined;
    const position = originalTrackPosition(track.trackId);
    const previousTrack =
      trackIndex === 0
        ? -1
        : originalTrackPosition(
            (timeline[trackIndex - 1] as Extract<PlaybackTimelineItem, { kind: "track" }>).trackId,
          );
    return program.timeline.slice(previousTrack + 1, position).find((item) => item.kind === "dj");
  }

  function outroCue(): PlaybackTimelineItem | undefined {
    const last = timeline.at(-1);
    if (program === undefined || last?.kind !== "track") return undefined;
    return program.timeline
      .slice(originalTrackPosition(last.trackId) + 1)
      .find((item) => item.kind === "dj");
  }

  async function startVoice(item: PlaybackTimelineItem | undefined): Promise<void> {
    if (item?.kind !== "dj" || triggeredVoiceCues.has(item.id)) return;
    triggeredVoiceCues.add(item.id);
    voiceAudio.pause();
    voiceAudio.src = sourceFor(item);
    voiceAudio.preload = "auto";
    voiceAudio.load();
    voiceAudio.currentTime = 0;
    voiceAudio.volume = 1;
    rampMusic(userVolume * 0.28, 350);
    try {
      await voiceAudio.play();
      voiceActive = true;
      update({
        voiceActive: true,
        voiceDurationMs: item.durationMs,
        voicePositionMs: 0,
        voiceSegmentId: item.segmentId,
      });
      if (
        profileId !== undefined &&
        program !== undefined &&
        !revealedVoiceSegments.has(item.segmentId)
      ) {
        revealedVoiceSegments.add(item.segmentId);
        void requestJson(
          options.transport,
          `/api/v1/profiles/${encodeURIComponent(profileId)}/programs/${encodeURIComponent(program.program.id)}/dj-scripts/${encodeURIComponent(item.segmentId)}/reveal`,
          djScriptSegmentSchema,
          { method: "PUT" },
        ).catch(() => {
          revealedVoiceSegments.delete(item.segmentId);
        });
      }
    } catch {
      voiceActive = false;
      rampMusic(userVolume, 650);
      update({
        voiceActive: false,
        voiceDurationMs: undefined,
        voicePositionMs: undefined,
        voiceSegmentId: undefined,
      });
    }
  }

  function maybeStartOverlay(positionMs: number): void {
    if (program?.program.playbackMode !== "voice-overlay") return;
    const item = currentItem();
    if (item?.kind !== "track") return;
    if (currentIndex === 0 && positionMs < 1_500) void startVoice(cueBeforeTrack(0));
    const nextCue =
      currentIndex < timeline.length - 1 ? cueBeforeTrack(currentIndex + 1) : outroCue();
    if (nextCue?.kind !== "dj") return;
    const lead = clamp(Math.round(nextCue.durationMs * 0.35), 8_000, 18_000);
    if (positionMs >= item.durationMs - lead) void startVoice(nextCue);
  }

  function stopMedia(): void {
    loadVersion += 1;
    expectedSource = undefined;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    voiceAudio.pause();
    voiceAudio.removeAttribute("src");
    voiceAudio.load();
    voiceActive = false;
    if (voiceRamp !== undefined) clearInterval(voiceRamp);
    audio.volume = userVolume;
    preloader.clear();
    stopWaveformSampling();
  }

  async function refreshTrackAudio(
    item: Extract<PlaybackTimelineItem, { kind: "track" }>,
    force = false,
  ): Promise<Extract<PlaybackTimelineItem, { kind: "track" }>> {
    if (profileId === undefined) return item;
    if (options.resolveTrackAudio === undefined) return item;
    const cached = audioResolutions.get(item.trackId);
    if (!force && cached !== undefined && cached.expiresAtMs > now() + 30_000) {
      return { ...item, resolvedAudioRef: cached.resolvedAudioRef };
    }
    try {
      const resolution = await options.resolveTrackAudio(profileId, item.trackId);
      const expiresAtMs = Date.parse(resolution.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) return item;
      audioResolutions.set(item.trackId, {
        expiresAtMs,
        resolvedAudioRef: resolution.resolvedAudioRef,
      });
      while (audioResolutions.size > 24) {
        const oldest = audioResolutions.keys().next().value;
        if (oldest === undefined) break;
        audioResolutions.delete(oldest);
      }
      return { ...item, resolvedAudioRef: resolution.resolvedAudioRef };
    } catch {
      return item;
    }
  }

  function applyTrackAudio(
    item: Extract<PlaybackTimelineItem, { kind: "track" }>,
  ): Extract<PlaybackTimelineItem, { kind: "track" }> {
    const index = timeline.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) timeline[index] = item;
    if (currentIndex === index) update({ currentItem: item });
    return item;
  }

  async function refreshCurrentTrackSource(force = false): Promise<boolean> {
    const item = currentItem();
    if (item?.kind !== "track") return true;
    const refreshed = applyTrackAudio(await refreshTrackAudio(item, force));
    if (currentItem()?.id !== item.id) return false;
    const source = sourceFor(refreshed);
    if (source === expectedSource || playableSource(source) === expectedSource) return true;
    const positionMs = snapshot.positionMs;
    audio.pause();
    audio.src = source;
    expectedSource = audio.src;
    audio.preload = "auto";
    audio.load();
    audio.currentTime = clamp(positionMs, 0, refreshed.durationMs) / 1000;
    return true;
  }

  function preloadNext(): void {
    const next = timeline[currentIndex + 1];
    if (next === undefined) preloader.clear();
    else if (next.kind === "track") {
      preloader.preload(sourceFor(next));
      void refreshTrackAudio(next).then((resolved) => {
        if (
          timeline[currentIndex + 1]?.id === resolved.id &&
          sourceFor(resolved) !== sourceFor(next)
        ) {
          preloader.preload(sourceFor(resolved));
        }
      });
    } else preloader.preload(sourceFor(next));
  }

  function setCurrentItem(
    index: number,
    positionMs = 0,
    state: AudioPlaybackState = "ready",
  ): void {
    if (program === undefined) return;
    currentIndex = clamp(index, 0, timeline.length - 1);
    const item = timeline[currentIndex];
    if (item === undefined) return;
    const source = sourceFor(item);
    loadVersion += 1;
    audio.pause();
    audio.src = source;
    expectedSource = audio.src;
    audio.preload = "auto";
    audio.load();
    audio.currentTime = clamp(positionMs, 0, item.durationMs) / 1000;
    update({
      state,
      currentItem: item,
      currentIndex,
      itemCount: timeline.length,
      positionMs: clamp(positionMs, 0, item.durationMs),
      durationMs: item.durationMs,
      volume: userVolume,
      mediaError: undefined,
      preview: undefined,
    });
    preloadNext();
  }

  function restoreAfterPreview(failedPreview?: AudioEngineSnapshot["preview"]): void {
    const returning = previewContext;
    if (returning === undefined) return;
    previewContext = undefined;
    stopMedia();
    update({ preview: undefined });
    if (program !== undefined && returning.returnIndex !== undefined) {
      setCurrentItem(returning.returnIndex, returning.returnPositionMs, "paused");
      if (returning.returnWasPlaying) void playCurrent(false);
    }
    if (failedPreview !== undefined) {
      update({ preview: failedPreview });
    }
  }

  async function previewAudio(preview: PreviewAudioOptions): Promise<void> {
    if (lease.getState().ownership !== "active") {
      await lease.requestTakeover();
      update({
        ownership: "active",
        leaseEpoch: lease.getState().epoch,
      });
    }
    if (lease.getState().ownership !== "active") return;
    if (previewContext === undefined) {
      const item = currentItem();
      const returnWasPlaying = snapshot.state === "playing" || snapshot.state === "buffering";
      if (item !== undefined) {
        audio.pause();
        update({ state: "paused" });
        await checkpoint("paused");
      }
      previewContext = {
        kind: preview.kind,
        previewId: preview.previewId,
        resolvedAudioRef: preview.resolvedAudioRef,
        durationMs: preview.durationMs,
        returnIndex: item === undefined ? undefined : currentIndex,
        returnPositionMs: item === undefined ? 0 : snapshot.positionMs,
        returnWasPlaying,
      };
    } else {
      previewContext = {
        ...previewContext,
        kind: preview.kind,
        previewId: preview.previewId,
        resolvedAudioRef: preview.resolvedAudioRef,
        durationMs: preview.durationMs,
      };
    }
    loadVersion += 1;
    const version = loadVersion;
    audio.pause();
    audio.src = playableSource(preview.resolvedAudioRef);
    expectedSource = audio.src;
    audio.preload = "auto";
    audio.load();
    audio.currentTime = 0;
    preloader.clear();
    update({
      preview: {
        kind: preview.kind,
        previewId: preview.previewId,
        state: "loading",
        positionMs: 0,
        durationMs: preview.durationMs,
        mediaError: undefined,
        resolvedAudioRef: preview.resolvedAudioRef,
        track: preview.track,
      },
    });
    try {
      await prepareWaveform();
      await audio.play();
      if (!isCurrentPreview(version, preview.previewId)) {
        audio.pause();
        return;
      }
      update({
        preview: {
          kind: preview.kind,
          previewId: preview.previewId,
          state: "playing",
          positionMs: 0,
          durationMs: preview.durationMs,
          mediaError: undefined,
          resolvedAudioRef: preview.resolvedAudioRef,
          track: preview.track,
        },
      });
      startWaveformSampling();
    } catch (error) {
      if (!isCurrentPreview(version, preview.previewId)) {
        audio.pause();
        return;
      }
      const autoplayBlocked = error instanceof DOMException && error.name === "NotAllowedError";
      update({
        preview: {
          kind: preview.kind,
          previewId: preview.previewId,
          state: autoplayBlocked ? "paused" : "failed",
          positionMs: 0,
          durationMs: preview.durationMs,
          mediaError: autoplayBlocked ? "autoplay_blocked" : "media_failed",
          resolvedAudioRef: preview.resolvedAudioRef,
          track: preview.track,
        },
      });
      if (!autoplayBlocked) {
        restoreAfterPreview(snapshot.preview);
      }
    }
  }

  async function playPreview(): Promise<void> {
    const preview = snapshot.preview;
    const context = previewContext;
    if (preview === undefined || context === undefined) return;
    if (lease.getState().ownership !== "active") {
      await lease.requestTakeover();
      update({ ownership: lease.getState().ownership, leaseEpoch: lease.getState().epoch });
    }
    if (lease.getState().ownership !== "active") return;
    const version = loadVersion;
    const previewId = context.previewId;
    const source = playableSource(context.resolvedAudioRef);
    if (audio.src !== source) {
      audio.pause();
      audio.src = source;
      expectedSource = audio.src;
      audio.preload = "auto";
      audio.load();
      audio.currentTime = clamp(preview.positionMs, 0, preview.durationMs) / 1000;
    }
    update({ preview: { ...preview, state: "loading", mediaError: undefined } });
    try {
      await prepareWaveform();
      await audio.play();
      if (!isCurrentPreview(version, previewId)) {
        audio.pause();
        return;
      }
      const currentPreview = snapshot.preview;
      if (currentPreview === undefined) return;
      update({ preview: { ...currentPreview, state: "playing", mediaError: undefined } });
      startWaveformSampling();
    } catch (error) {
      if (!isCurrentPreview(version, previewId)) return;
      const autoplayBlocked = error instanceof DOMException && error.name === "NotAllowedError";
      const currentPreview = snapshot.preview;
      if (currentPreview === undefined) return;
      update({
        preview: {
          ...currentPreview,
          state: autoplayBlocked ? "paused" : "failed",
          mediaError: autoplayBlocked ? "autoplay_blocked" : "media_failed",
        },
      });
      if (!autoplayBlocked) restoreAfterPreview(snapshot.preview);
    }
  }

  function pausePreview(): boolean {
    if (previewContext === undefined || snapshot.preview === undefined) return false;
    audio.pause();
    update({ preview: { ...snapshot.preview, state: "paused" } });
    return true;
  }

  function seekPreview(positionMs: number): boolean {
    if (
      previewContext === undefined ||
      snapshot.preview === undefined ||
      lease.getState().ownership !== "active"
    ) {
      return false;
    }
    const next = clamp(Math.round(positionMs), 0, snapshot.preview.durationMs);
    audio.currentTime = next / 1000;
    update({ preview: { ...snapshot.preview, positionMs: next } });
    return true;
  }

  function stopPreview(): Promise<void> {
    if (previewContext === undefined) {
      if (snapshot.preview !== undefined) update({ preview: undefined });
      return Promise.resolve();
    }
    restoreAfterPreview();
    return Promise.resolve();
  }

  async function checkpoint(status?: "playing" | "paused" | "completed" | "failed"): Promise<void> {
    const item = currentItem();
    const epoch = lease.getState().epoch;
    if (
      profileId === undefined ||
      program === undefined ||
      item === undefined ||
      epoch === undefined ||
      lease.getState().ownership !== "active"
    ) {
      return;
    }
    const resolvedStatus =
      status ??
      (snapshot.state === "playing" || snapshot.state === "buffering" ? "playing" : "paused");
    const positionMs =
      resolvedStatus === "completed"
        ? item.durationMs
        : clamp(snapshot.positionMs, 0, item.durationMs);
    lastCheckpointAt = now();
    try {
      await savePlaybackCheckpoint(options.transport, {
        profileId,
        programId: program.program.id,
        timelineItemId: item.id,
        positionMs,
        volume: userVolume,
        status: resolvedStatus,
        leaseEpoch: epoch,
      });
      update({ checkpointError: false });
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.status === 409 &&
        error.envelope?.code === "PLAYBACK_LEASE_STALE"
      ) {
        lease.fence(epoch);
      }
      update({ checkpointError: true });
    }
  }

  async function advance(reason: "ended" | "error" | "next"): Promise<void> {
    const item = currentItem();
    if (item === undefined || program === undefined) return;
    await checkpoint(
      reason === "error" ? "failed" : snapshot.state === "playing" ? "playing" : "paused",
    );
    if (
      reason === "ended" &&
      scheduledProgramHandoff !== undefined &&
      scheduledProgramHandoff.program.profileId === profileId
    ) {
      const handoff = scheduledProgramHandoff;
      try {
        const activated = await options.activateProgramHandoff?.(profileId, handoff.program.id);
        if (activated !== undefined) {
          scheduledProgramHandoff = undefined;
          await loadProgram(activated, { autoplay: true });
          return;
        }
      } catch {
        scheduledProgramHandoff = undefined;
      }
    }
    if (currentIndex >= timeline.length - 1) {
      audio.pause();
      const state = reason === "error" ? "failed" : "completed";
      update({
        state,
        positionMs: item.durationMs,
        mediaError: reason === "error" ? "queue_exhausted" : undefined,
      });
      await checkpoint(reason === "error" ? "failed" : "completed");
      if ((reason === "ended" || reason === "next") && queuedPreview !== undefined) {
        const queued = queuedPreview;
        queuedPreview = undefined;
        update({ queuedPreview: undefined });
        await previewAudio(queued);
        if (previewContext !== undefined) {
          previewContext = { ...previewContext, returnIndex: undefined, returnWasPlaying: false };
        }
        update({ state: "completed" });
      }
      return;
    }
    const shouldPlay =
      snapshot.state === "playing" ||
      snapshot.state === "buffering" ||
      reason === "ended" ||
      reason === "error";
    const nextIndex = currentIndex + 1;
    setCurrentItem(nextIndex, 0, shouldPlay ? "buffering" : "paused");
    if ((reason === "ended" || reason === "next") && queuedPreview !== undefined) {
      const queued = queuedPreview;
      queuedPreview = undefined;
      update({ queuedPreview: undefined });
      await previewAudio(queued);
      return;
    }
    if (shouldPlay) await playCurrent(false);
    if (
      currentIndex === nextIndex &&
      snapshot.state !== "failed" &&
      snapshot.state !== "completed"
    ) {
      await checkpoint(snapshot.state === "playing" ? "playing" : "paused");
    }
  }

  async function playCurrent(requestTakeover: boolean): Promise<void> {
    if (requestTakeover && lease.getState().ownership !== "active") {
      await lease.requestTakeover();
      if (program !== undefined) setCurrentItem(currentIndex, snapshot.positionMs, "ready");
    }
    const epoch = lease.getState().epoch;
    let item = currentItem();
    if (epoch === undefined || item === undefined || lease.getState().ownership !== "active")
      return;
    if (options.resolveTrackAudio !== undefined && !(await refreshCurrentTrackSource())) return;
    item = currentItem();
    if (item === undefined) return;
    const version = loadVersion;
    update({ state: "buffering", mediaError: undefined, leaseEpoch: epoch, ownership: "active" });
    try {
      initializeWaveform();
      if (audioContext?.state === "suspended") await audioContext.resume();
      await audio.play();
      if (
        version !== loadVersion ||
        lease.getState().ownership !== "active" ||
        lease.getState().epoch !== epoch
      ) {
        audio.pause();
        return;
      }
      update({ state: "playing" });
      startWaveformSampling();
      if (voiceActive && voiceAudio.paused) {
        await voiceAudio.play().catch(() => {
          voiceActive = false;
          rampMusic(userVolume, 650);
          update({
            voiceActive: false,
            voiceDurationMs: undefined,
            voicePositionMs: undefined,
            voiceSegmentId: undefined,
          });
        });
      }
      preloadNext();
      maybeStartOverlay(snapshot.positionMs);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError") {
        update({ state: "paused", mediaError: "autoplay_blocked" });
      } else {
        await recoverMediaFailure();
      }
    }
  }

  async function recoverMediaFailure(): Promise<void> {
    const item = currentItem();
    if (item?.kind === "track" && !retriedMediaItems.has(item.id)) {
      retriedMediaItems.add(item.id);
      await refreshCurrentTrackSource(true);
      await playCurrent(false);
      return;
    }
    update({ state: "failed", mediaError: "media_failed" });
    await advance("error");
  }

  async function restore(programDetail: ProgramDetail, autoplay: boolean): Promise<void> {
    const version = ++loadVersion;
    let saved: PlaybackCheckpoint | null = null;
    try {
      saved = await getPlaybackCheckpoint(options.transport, programDetail.program.profileId);
    } catch {
      update({ checkpointError: true });
    }
    if (destroyed || version !== loadVersion || program !== programDetail) return;
    const savedIndex =
      saved?.programId === programDetail.program.id
        ? timeline.findIndex((item) => item.id === saved.timelineItemId)
        : -1;
    const index = savedIndex >= 0 ? savedIndex : 0;
    const positionMs = savedIndex >= 0 ? (saved?.positionMs ?? 0) : 0;
    if (lease.getState().ownership === "active") {
      userVolume = saved?.volume ?? userVolume;
      audio.volume = userVolume;
      setCurrentItem(index, positionMs, saved?.status === "completed" ? "completed" : "paused");
      if (autoplay && saved?.status !== "completed") await playCurrent(false);
    } else {
      currentIndex = index;
      const item = timeline[index];
      update({
        ownership: "passive",
        state: saved?.status === "completed" ? "completed" : "paused",
        currentItem: item,
        currentIndex: index,
        itemCount: timeline.length,
        positionMs,
        durationMs: item?.durationMs ?? 0,
        volume: saved?.volume ?? snapshot.volume,
      });
    }
  }

  audio.addEventListener("timeupdate", () => {
    if (previewContext !== undefined && snapshot.preview !== undefined) {
      update({
        preview: {
          ...snapshot.preview,
          positionMs: clamp(Math.round(audio.currentTime * 1000), 0, previewContext.durationMs),
        },
      });
      return;
    }
    const item = currentItem();
    if (
      expectedSource === undefined ||
      item === undefined ||
      lease.getState().ownership !== "active"
    )
      return;
    const positionMs = clamp(Math.round(audio.currentTime * 1000), 0, item.durationMs);
    update({ positionMs });
    maybeStartOverlay(positionMs);
    if (snapshot.state === "playing" && now() - lastCheckpointAt >= checkpointIntervalMs) {
      void checkpoint("playing");
    }
  });
  audio.addEventListener("waiting", () => {
    if (previewContext !== undefined && snapshot.preview !== undefined) {
      update({ preview: { ...snapshot.preview, state: "loading" } });
      return;
    }
    if (expectedSource !== undefined && snapshot.state === "playing") {
      update({ state: "buffering" });
    }
  });
  audio.addEventListener("playing", () => {
    if (previewContext !== undefined && snapshot.preview !== undefined) {
      update({ preview: { ...snapshot.preview, state: "playing" } });
      initializeWaveform();
      startWaveformSampling();
      return;
    }
    if (expectedSource !== undefined && lease.getState().ownership === "active") {
      update({ state: "playing" });
      initializeWaveform();
      startWaveformSampling();
    }
  });
  audio.addEventListener("ended", () => {
    if (previewContext !== undefined) {
      restoreAfterPreview();
      return;
    }
    if (expectedSource !== undefined && lease.getState().ownership === "active") {
      void advance("ended");
    }
  });
  audio.addEventListener("error", () => {
    if (previewContext !== undefined && snapshot.preview !== undefined && audio.error !== null) {
      restoreAfterPreview({
        ...snapshot.preview,
        state: "failed",
        mediaError: "media_failed",
      });
      return;
    }
    if (
      expectedSource !== undefined &&
      lease.getState().ownership === "active" &&
      audio.error !== null
    ) {
      void recoverMediaFailure();
    }
  });
  voiceAudio.addEventListener("ended", () => {
    if (!voiceActive) return;
    voiceActive = false;
    rampMusic(userVolume, 650);
    update({
      voiceActive: false,
      voiceDurationMs: undefined,
      voicePositionMs: undefined,
      voiceSegmentId: undefined,
    });
  });
  voiceAudio.addEventListener("error", () => {
    if (!voiceActive || voiceAudio.error === null) return;
    voiceActive = false;
    rampMusic(userVolume, 650);
    update({
      voiceActive: false,
      voiceDurationMs: undefined,
      voicePositionMs: undefined,
      voiceSegmentId: undefined,
    });
  });
  voiceAudio.addEventListener("timeupdate", () => {
    if (!voiceActive || snapshot.voiceDurationMs === undefined) return;
    update({
      voicePositionMs: clamp(
        Math.round(voiceAudio.currentTime * 1000),
        0,
        snapshot.voiceDurationMs,
      ),
    });
  });

  lease.subscribe((leaseState) => {
    if (leaseState.ownership === "passive") {
      previewContext = undefined;
      stopMedia();
      update({ ownership: "passive", leaseEpoch: undefined, preview: undefined });
    } else {
      update({ ownership: "active", leaseEpoch: leaseState.epoch });
    }
  });
  lease.subscribeSnapshot((remote) => {
    if (
      lease.getState().ownership === "passive" &&
      profileId === remote.profileId &&
      program?.program.id === remote.programId
    ) {
      currentIndex = remote.currentIndex;
      snapshot = remoteSnapshot(remote);
      publish();
    }
  });

  const onPageHide = (): void => {
    void yieldPlayback().finally(() => {
      lease.release();
    });
  };
  window.addEventListener("pagehide", onPageHide);

  async function activateProfile(nextProfileId: string): Promise<void> {
    if (profileId === nextProfileId) return;
    if (profileId !== undefined) await yieldPlayback();
    profileId = nextProfileId;
    const epoch = lease.start(nextProfileId);
    update({
      ownership: epoch === undefined ? "passive" : "active",
      profileId: nextProfileId,
      leaseEpoch: epoch,
    });
  }

  async function loadProgram(
    nextProgram: ProgramDetail,
    loadOptions: LoadProgramOptions,
  ): Promise<void> {
    await stopPreview();
    await activateProfile(nextProgram.program.profileId);
    if (program?.program.id === nextProgram.program.id) return;
    if (program !== undefined && lease.getState().ownership === "active") await yieldPlayback();
    program = nextProgram;
    timeline =
      nextProgram.program.playbackMode === "voice-overlay"
        ? nextProgram.timeline.filter((item) => item.kind === "track")
        : nextProgram.timeline;
    triggeredVoiceCues.clear();
    retriedMediaItems.clear();
    audioResolutions.clear();
    profileId = nextProgram.program.profileId;
    currentIndex = 0;
    update({
      profileId,
      programId: nextProgram.program.id,
      state: "ready",
      currentIndex: 0,
      itemCount: timeline.length,
      positionMs: 0,
      durationMs: timeline[0]?.durationMs ?? 0,
      checkpointError: false,
      mediaError: undefined,
    });
    await restore(nextProgram, loadOptions.autoplay);
  }

  return {
    async activateProfile(nextProfileId) {
      await activateProfile(nextProfileId);
    },
    async clearProgram() {
      await stopPreview();
      await yieldPlayback();
      lease.release();
      stopMedia();
      program = undefined;
      timeline = [];
      profileId = undefined;
      snapshot = initialSnapshot;
      publish();
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener("pagehide", onPageHide);
      await yieldPlayback();
      lease.destroy();
      stopMedia();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    clearProgramHandoff() {
      scheduledProgramHandoff = undefined;
    },
    async loadProgram(nextProgram, loadOptions: LoadProgramOptions) {
      await loadProgram(nextProgram, loadOptions);
    },
    async syncProgram(nextProgram) {
      await activateProfile(nextProgram.program.profileId);
      if (program !== undefined || snapshot.preview !== undefined) return;
      await loadProgram(nextProgram, { autoplay: false });
    },
    async next() {
      if (previewContext !== undefined) {
        await stopPreview();
        return;
      }
      await advance("next");
    },
    async pause() {
      if (lease.getState().ownership !== "active") return;
      if (pausePreview()) return;
      audio.pause();
      voiceAudio.pause();
      update({ state: "paused" });
      await checkpoint("paused");
    },
    play() {
      if (previewContext !== undefined && snapshot.preview !== undefined) return playPreview();
      return playCurrent(true);
    },
    previewAudio,
    queuePreviewNext(preview) {
      queuedPreview = preview;
      update({
        queuedPreview: {
          kind: preview.kind,
          previewId: preview.previewId,
          durationMs: preview.durationMs,
          track: preview.track,
        },
      });
      return Promise.resolve();
    },
    scheduleProgramHandoff(nextProgram) {
      scheduledProgramHandoff = nextProgram;
    },
    async prepareForProfileSwitch() {
      await yieldPlayback();
      lease.release();
      program = undefined;
      timeline = [];
      profileId = undefined;
      snapshot = initialSnapshot;
      publish();
    },
    async previous() {
      if (lease.getState().ownership !== "active" || program === undefined) return;
      if (previewContext !== undefined) {
        await stopPreview();
        return;
      }
      await checkpoint(snapshot.state === "playing" ? "playing" : "paused");
      const shouldPlay = snapshot.state === "playing" || snapshot.state === "buffering";
      const index = snapshot.positionMs > 3_000 ? currentIndex : Math.max(0, currentIndex - 1);
      setCurrentItem(index, 0, shouldPlay ? "buffering" : "paused");
      if (shouldPlay) await playCurrent(false);
      if (currentIndex === index && snapshot.state !== "failed" && snapshot.state !== "completed") {
        await checkpoint(snapshot.state === "playing" ? "playing" : "paused");
      }
    },
    async seek(positionMs) {
      if (seekPreview(positionMs)) return;
      const item = currentItem();
      if (item === undefined || lease.getState().ownership !== "active") return;
      const next = clamp(Math.round(positionMs), 0, item.durationMs);
      audio.currentTime = next / 1000;
      update({ positionMs: next });
      await checkpoint(snapshot.state === "playing" ? "playing" : "paused");
    },
    setVolume(volume) {
      const next = clamp(volume, 0, 1);
      userVolume = next;
      audio.volume = voiceActive ? next * 0.28 : next;
      update({ volume: next });
    },
    stopPreview,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
