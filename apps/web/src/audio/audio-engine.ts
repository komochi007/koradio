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

function sourceFor(item: PlaybackTimelineItem): string {
  return item.kind === "track" ? item.resolvedAudioRef : `/${item.audioRef}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function createAudioEngine(options: CreateAudioEngineOptions): AudioEngineFacade {
  const audio = options.audio ?? createAudioElement();
  const preloader = options.preloader ?? createPreloader();
  const now = options.now ?? Date.now;
  const checkpointIntervalMs = options.checkpointIntervalMs ?? 15_000;
  const listeners = new Set<() => void>();
  let snapshot = initialSnapshot;
  let program: ProgramDetail | undefined;
  let profileId: string | undefined;
  let currentIndex = 0;
  let lastCheckpointAt = 0;
  let loadVersion = 0;
  let expectedSource: string | undefined;
  let previewContext: PreviewContext | undefined;
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
    return program?.timeline[currentIndex];
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
    const item = program?.timeline.find((candidate) => candidate.id === value.timelineItemId);
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

  function stopMedia(): void {
    loadVersion += 1;
    expectedSource = undefined;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    preloader.clear();
  }

  function preloadNext(): void {
    const next = program?.timeline[currentIndex + 1];
    if (next === undefined) preloader.clear();
    else preloader.preload(sourceFor(next));
  }

  function setCurrentItem(
    index: number,
    positionMs = 0,
    state: AudioPlaybackState = "ready",
  ): void {
    if (program === undefined) return;
    currentIndex = clamp(index, 0, program.timeline.length - 1);
    const item = program.timeline[currentIndex];
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
      itemCount: program.timeline.length,
      positionMs: clamp(positionMs, 0, item.durationMs),
      durationMs: item.durationMs,
      volume: audio.volume,
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
    audio.src = preview.resolvedAudioRef;
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
        volume: audio.volume,
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
    if (currentIndex >= program.timeline.length - 1) {
      audio.pause();
      const state = reason === "error" ? "failed" : "completed";
      update({
        state,
        positionMs: item.durationMs,
        mediaError: reason === "error" ? "queue_exhausted" : undefined,
      });
      await checkpoint(reason === "error" ? "failed" : "completed");
      return;
    }
    const shouldPlay =
      snapshot.state === "playing" ||
      snapshot.state === "buffering" ||
      reason === "ended" ||
      reason === "error";
    const nextIndex = currentIndex + 1;
    setCurrentItem(nextIndex, 0, shouldPlay ? "buffering" : "paused");
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
      preloadNext();
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
        ? programDetail.timeline.findIndex((item) => item.id === saved.timelineItemId)
        : -1;
    const index = savedIndex >= 0 ? savedIndex : 0;
    const positionMs = savedIndex >= 0 ? (saved?.positionMs ?? 0) : 0;
    if (lease.getState().ownership === "active") {
      audio.volume = saved?.volume ?? audio.volume;
      setCurrentItem(index, positionMs, saved?.status === "completed" ? "completed" : "paused");
      if (autoplay && saved?.status !== "completed") await playCurrent(false);
    } else {
      currentIndex = index;
      const item = programDetail.timeline[index];
      update({
        ownership: "passive",
        state: saved?.status === "completed" ? "completed" : "paused",
        currentItem: item,
        currentIndex: index,
        itemCount: programDetail.timeline.length,
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
      profileId = nextProgram.program.profileId;
      currentIndex = 0;
      update({
        profileId,
        programId: nextProgram.program.id,
        state: "ready",
        currentIndex: 0,
        itemCount: nextProgram.timeline.length,
        positionMs: 0,
        durationMs: nextProgram.timeline[0]?.durationMs ?? 0,
        checkpointError: false,
        mediaError: undefined,
      });
      await restore(nextProgram, loadOptions.autoplay);
    },
    next: () => advance("next"),
    async pause() {
      if (lease.getState().ownership !== "active") return;
      audio.pause();
      update({ state: "paused" });
      await checkpoint("paused");
    },
    play: () => playCurrent(true),
    previewAudio,
    async prepareForProfileSwitch() {
      await yieldPlayback();
      lease.release();
      program = undefined;
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
      audio.volume = next;
      update({ volume: next });
    },
    stopPreview,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
