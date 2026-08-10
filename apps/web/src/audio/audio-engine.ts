import type { PlaybackCheckpoint, PlaybackTimelineItem, ProgramDetail } from "@koradio/contracts";

import { ApiRequestError } from "../shared/api.js";
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
  audio?: AudioElementLike;
  voiceAudio?: AudioElementLike;
  checkpointIntervalMs?: number;
  lease?: PlaybackLeaseCoordinator;
  now?: () => number;
  preloader?: AudioPreloader;
  transport: ServiceTransport;
}

interface PreviewContext {
  kind: "dj" | "track";
  previewId: string;
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
  return new Audio();
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
  let voiceActive = false;
  let voiceRamp: ReturnType<typeof setInterval> | undefined;
  let userVolume = 1;
  const triggeredVoiceCues = new Set<string>();
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
    voiceActive = true;
    voiceAudio.pause();
    voiceAudio.src = sourceFor(item);
    voiceAudio.preload = "auto";
    voiceAudio.load();
    voiceAudio.currentTime = 0;
    voiceAudio.volume = 1;
    rampMusic(userVolume * 0.28, 350);
    update({
      voiceActive: true,
      voiceDurationMs: item.durationMs,
      voicePositionMs: 0,
      voiceSegmentId: item.segmentId,
    });
    try {
      await voiceAudio.play();
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
  }

  function preloadNext(): void {
    const next = timeline[currentIndex + 1];
    if (next === undefined) preloader.clear();
    else preloader.preload(sourceFor(next));
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
      },
    });
    try {
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
        },
      });
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
        },
      });
      if (!autoplayBlocked) {
        restoreAfterPreview(snapshot.preview);
      }
    }
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
    if (currentIndex >= timeline.length - 1) {
      audio.pause();
      const state = reason === "error" ? "failed" : "completed";
      update({
        state,
        positionMs: item.durationMs,
        mediaError: reason === "error" ? "queue_exhausted" : undefined,
      });
      await checkpoint(reason === "error" ? "failed" : "completed");
      if (reason === "ended" && queuedPreview !== undefined) {
        const queued = queuedPreview;
        queuedPreview = undefined;
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
    if (reason === "ended" && queuedPreview !== undefined) {
      const queued = queuedPreview;
      queuedPreview = undefined;
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
    const item = currentItem();
    if (epoch === undefined || item === undefined || lease.getState().ownership !== "active")
      return;
    const version = loadVersion;
    update({ state: "buffering", mediaError: undefined, leaseEpoch: epoch, ownership: "active" });
    try {
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
        update({ state: "failed", mediaError: "media_failed" });
        await advance("error");
      }
    }
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
      return;
    }
    if (expectedSource !== undefined && lease.getState().ownership === "active") {
      update({ state: "playing" });
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
      update({ state: "failed", mediaError: "media_failed" });
      void advance("error");
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

  return {
    async activateProfile(nextProfileId) {
      if (profileId === nextProfileId) return;
      if (profileId !== undefined) await yieldPlayback();
      profileId = nextProfileId;
      const epoch = lease.start(nextProfileId);
      update({
        ownership: epoch === undefined ? "passive" : "active",
        profileId: nextProfileId,
        leaseEpoch: epoch,
      });
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
    async loadProgram(nextProgram, loadOptions: LoadProgramOptions) {
      await stopPreview();
      await this.activateProfile(nextProgram.program.profileId);
      if (program?.program.id === nextProgram.program.id) return;
      if (program !== undefined && lease.getState().ownership === "active") await yieldPlayback();
      program = nextProgram;
      timeline =
        nextProgram.program.playbackMode === "voice-overlay"
          ? nextProgram.timeline.filter((item) => item.kind === "track")
          : nextProgram.timeline;
      triggeredVoiceCues.clear();
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
    },
    next: () => advance("next"),
    async pause() {
      if (lease.getState().ownership !== "active") return;
      audio.pause();
      voiceAudio.pause();
      update({ state: "paused" });
      await checkpoint("paused");
    },
    play: () => playCurrent(true),
    previewAudio,
    queuePreviewNext(preview) {
      queuedPreview = preview;
      return Promise.resolve();
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
