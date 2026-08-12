// @vitest-environment jsdom

import type { ProgramDetail } from "@koradio/contracts";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPlaybackCheckpoint } from "../../apps/web/src/audio/api.js";
import { createAudioEngine } from "../../apps/web/src/audio/audio-engine.js";
import { useAudioSnapshot } from "../../apps/web/src/audio/react.js";
import type { AudioEngineFacade, AudioEngineSnapshot } from "../../apps/web/src/audio/types.js";
import type {
  PlaybackLeaseCoordinator,
  PlaybackLeaseState,
} from "../../apps/web/src/audio/lease-coordinator.js";
import type { LeasePlaybackSnapshot } from "../../apps/web/src/audio/types.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";

const profileId = "00000000-0000-4000-8000-000000000010";
const programId = "00000000-0000-4000-8000-000000000070";

const program: ProgramDetail = {
  program: {
    id: programId,
    profileId,
    scenarioText: "安静地写东西",
    title: "After Hours",
    status: "ready",
    trackIds: ["00000000-0000-4000-8000-000000000071", "00000000-0000-4000-8000-000000000072"],
    originMode: "mock",
    createdAt: "2026-07-19T08:00:00.000Z",
  },
  djScripts: [
    {
      id: "00000000-0000-4000-8000-000000000080",
      programId,
      type: "intro",
      language: "zh-CN",
      text: "先让房间安静下来。",
      displayText: "先让房间安静下来。",
      estimatedTiming: false,
      ttsAudioRef: "tts/00000000-0000-4000-8000-000000000081.wav",
    },
  ],
  tracks: [
    {
      id: "00000000-0000-4000-8000-000000000071",
      source: "netease",
      sourceTrackId: "track-one",
      title: "First",
      artist: "Artist",
      album: "Album",
      artworkUrl: null,
      durationMs: 10_000,
      lyricStatus: "available",
      playable: true,
      originMode: "mock",
    },
    {
      id: "00000000-0000-4000-8000-000000000072",
      source: "netease",
      sourceTrackId: "track-two",
      title: "Second",
      artist: "Artist",
      album: "Album",
      artworkUrl: null,
      durationMs: 20_000,
      lyricStatus: "unavailable",
      playable: true,
      originMode: "mock",
    },
  ],
  timeline: [
    {
      id: "00000000-0000-4000-8000-000000000073",
      kind: "track",
      position: 0,
      trackId: "00000000-0000-4000-8000-000000000071",
      resolvedAudioRef: "https://media.example.test/first.mp3",
      durationMs: 10_000,
    },
    {
      id: "00000000-0000-4000-8000-000000000074",
      kind: "dj",
      position: 1,
      segmentId: "00000000-0000-4000-8000-000000000080",
      audioRef: "tts/00000000-0000-4000-8000-000000000081.wav",
      durationMs: 5_000,
    },
    {
      id: "00000000-0000-4000-8000-000000000075",
      kind: "track",
      position: 2,
      trackId: "00000000-0000-4000-8000-000000000072",
      resolvedAudioRef: "https://media.example.test/second.mp3",
      durationMs: 20_000,
    },
  ],
};

class FakeAudio {
  currentTime = 0;
  duration = 0;
  error: MediaError | null = null;
  paused = true;
  preload = "";
  src = "";
  volume = 1;
  readonly listeners = new Map<string, Set<() => void>>();
  readonly load = vi.fn();
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  playResult: () => Promise<void> = () => {
    this.paused = false;
    return Promise.resolve();
  };
  readonly play = vi.fn(() => this.playResult());
  readonly removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  fail(): void {
    this.error = {
      code: 4,
      message: "unsupported",
      MEDIA_ERR_ABORTED: 1,
      MEDIA_ERR_NETWORK: 2,
      MEDIA_ERR_DECODE: 3,
      MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
    };
    this.emit("error");
  }
}

class FakeAnalyser {
  fftSize = 512;
  readonly connect = vi.fn();

  constructor(private readonly sample: number) {}

  getByteTimeDomainData(values: Uint8Array): void {
    values.fill(this.sample);
  }
}

class FakeAudioContext {
  state: AudioContextState = "suspended";
  readonly destination = {} as AudioDestinationNode;
  readonly analyser: FakeAnalyser;
  readonly createAnalyser = vi.fn(() => this.analyser as unknown as AnalyserNode);
  readonly createMediaElementSource = vi.fn(
    () => ({ connect: vi.fn() }) as unknown as MediaElementAudioSourceNode,
  );
  readonly resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });

  constructor(sample: number) {
    this.analyser = new FakeAnalyser(sample);
  }
}

function asHtmlAudio(audio: FakeAudio): FakeAudio {
  const prototype = Object.create(HTMLAudioElement.prototype) as object;
  const fakeAudioPrototype = Object.getPrototypeOf(audio) as object;
  Object.defineProperties(prototype, Object.getOwnPropertyDescriptors(fakeAudioPrototype));
  Object.setPrototypeOf(audio, prototype);
  return audio;
}

function stubAudioContext(context: FakeAudioContext): void {
  const AudioContext = function AudioContext(): FakeAudioContext {
    return context;
  };
  vi.stubGlobal("AudioContext", AudioContext);
}

function stubMatchMedia(reducedMotion: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reducedMotion }) as MediaQueryList),
  );
}

class FakeLease implements PlaybackLeaseCoordinator {
  state: PlaybackLeaseState = { ownership: "active", epoch: 7, profileId };
  readonly listeners = new Set<(state: PlaybackLeaseState) => void>();
  readonly snapshotListeners = new Set<(snapshot: LeasePlaybackSnapshot) => void>();
  readonly published: LeasePlaybackSnapshot[] = [];
  destroyed = false;
  released = false;

  destroy(): void {
    this.destroyed = true;
  }

  fence(epoch: number): void {
    if (this.state.epoch === epoch) this.setState({ ownership: "passive", profileId });
  }

  getState(): PlaybackLeaseState {
    return this.state;
  }

  publishSnapshot(snapshot: LeasePlaybackSnapshot): void {
    this.published.push(snapshot);
  }

  release(): void {
    this.released = true;
    this.setState({ ownership: "passive", profileId });
  }

  requestTakeover(): Promise<number> {
    this.setState({ ownership: "active", epoch: 8, profileId });
    return Promise.resolve(8);
  }

  start(nextProfileId: string): number | undefined {
    this.state = { ...this.state, profileId: nextProfileId };
    return this.state.epoch;
  }

  subscribe(listener: (state: PlaybackLeaseState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeSnapshot(listener: (snapshot: LeasePlaybackSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  emitSnapshot(snapshot: LeasePlaybackSnapshot): void {
    for (const listener of this.snapshotListeners) listener(snapshot);
  }

  setState(state: PlaybackLeaseState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function errorEnvelope(code: string): string {
  return JSON.stringify({
    code,
    message: code,
    retryable: false,
    correlationId: "00000000-0000-4000-8000-000000000099",
  });
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function createTransport(
  options: {
    checkpoint?: "missing" | "saved" | "wrong-program";
    saveStatus?: number;
  } = {},
): ServiceTransport & { requests: Array<{ path: string; init?: RequestInit }> } {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  return {
    requests,
    clearSession() {},
    connectEvents: () => Promise.reject(new Error("unused")),
    fetchHealth: () => Promise.reject(new Error("unused")),
    request(path, init) {
      requests.push({ path, ...(init === undefined ? {} : { init }) });
      if ((init?.method ?? "GET") === "GET") {
        if (options.checkpoint === "saved" || options.checkpoint === "wrong-program") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                profileId,
                programId:
                  options.checkpoint === "saved"
                    ? programId
                    : "00000000-0000-4000-8000-000000000098",
                timelineItemId: program.timeline[1]?.id,
                positionMs: 2_000,
                volume: 0.5,
                status: "paused",
                savedAt: "2026-07-19T08:00:00.000Z",
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(errorEnvelope("PLAYBACK_SNAPSHOT_NOT_FOUND"), { status: 404 }),
        );
      }
      const status = options.saveStatus ?? 200;
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as {
              profileId: string;
              programId: string;
              timelineItemId: string;
              positionMs: number;
              volume: number;
              status: string;
            })
          : undefined;
      return Promise.resolve(
        new Response(
          status === 200
            ? JSON.stringify({
                profileId: body?.profileId,
                programId: body?.programId,
                timelineItemId: body?.timelineItemId,
                positionMs: body?.positionMs,
                volume: body?.volume,
                status: body?.status,
                savedAt: "2026-07-19T08:00:00.000Z",
              })
            : errorEnvelope("PLAYBACK_LEASE_STALE"),
          { status },
        ),
      );
    },
  };
}

function latestCheckpointRequest(
  transport: ServiceTransport & { requests: Array<{ path: string; init?: RequestInit }> },
): Record<string, unknown> {
  const body = transport.requests.filter((request) => request.init?.method === "PUT").at(-1)
    ?.init?.body;
  if (typeof body !== "string") throw new Error("Expected a JSON checkpoint request");
  return JSON.parse(body) as Record<string, unknown>;
}

describe("Audio Engine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores a checkpoint, controls playback and saves boundary checkpoints", async () => {
    const audio = new FakeAudio();
    const lease = new FakeLease();
    const transport = createTransport({ checkpoint: "saved" });
    const preloader = { preload: vi.fn(), clear: vi.fn() };
    const engine = createAudioEngine({ audio, lease, preloader, transport });

    await engine.loadProgram(program, { autoplay: false });
    expect(engine.getSnapshot()).toMatchObject({ currentIndex: 1, positionMs: 2_000, volume: 0.5 });
    expect(audio.src).toBe("/tts/00000000-0000-4000-8000-000000000081.wav");
    expect(preloader.preload).toHaveBeenLastCalledWith("https://media.example.test/second.mp3");

    await engine.play();
    expect(engine.getSnapshot().state).toBe("playing");
    await engine.seek(9_000);
    expect(engine.getSnapshot().positionMs).toBe(5_000);
    await engine.pause();
    await engine.seek(1_000);
    expect(engine.getSnapshot().state).toBe("paused");
    await engine.next();
    expect(engine.getSnapshot().currentIndex).toBe(2);
    expect(latestCheckpointRequest(transport)).toMatchObject({
      timelineItemId: program.timeline[2]?.id,
      positionMs: 0,
    });
    await engine.previous();
    expect(engine.getSnapshot().currentIndex).toBe(1);
    expect(latestCheckpointRequest(transport)).toMatchObject({
      timelineItemId: program.timeline[1]?.id,
      positionMs: 0,
    });
    engine.setVolume(-1);
    expect(engine.getSnapshot().volume).toBe(0);
    engine.setVolume(2);
    expect(engine.getSnapshot().volume).toBe(1);
    expect(
      transport.requests.filter((request) => request.init?.method === "PUT").length,
    ).toBeGreaterThan(3);

    await engine.destroy();
    expect(lease.destroyed).toBe(true);
    expect(audio.removeAttribute).toHaveBeenCalledWith("src");
    const stoppedIndex = engine.getSnapshot().currentIndex;
    audio.fail();
    await flushAsync();
    expect(engine.getSnapshot().currentIndex).toBe(stoppedIndex);
    await engine.destroy();
  });

  it("previews through the single audio element and restores the prior playing state", async () => {
    const audio = new FakeAudio();
    const transport = createTransport();
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport,
    });
    await engine.loadProgram(program, { autoplay: true });
    audio.currentTime = 4;
    audio.emit("timeupdate");

    await engine.previewAudio({
      kind: "track",
      previewId: program.tracks[1]?.id ?? "",
      resolvedAudioRef: "https://media.example.test/preview.mp3",
      durationMs: 20_000,
    });
    expect(latestCheckpointRequest(transport)).toMatchObject({
      timelineItemId: program.timeline[0]?.id,
      positionMs: 4_000,
      status: "paused",
    });
    expect(audio.src).toBe("https://media.example.test/preview.mp3");
    expect(engine.getSnapshot()).toMatchObject({
      state: "paused",
      positionMs: 4_000,
      preview: {
        kind: "track",
        previewId: program.tracks[1]?.id,
        state: "playing",
      },
    });

    audio.currentTime = 1.5;
    audio.emit("timeupdate");
    expect(engine.getSnapshot()).toMatchObject({
      positionMs: 4_000,
      preview: { positionMs: 1_500 },
    });
    audio.emit("ended");
    await flushAsync();
    expect(engine.getSnapshot()).toMatchObject({
      state: "playing",
      currentIndex: 0,
      positionMs: 4_000,
    });
    expect(engine.getSnapshot().preview).toBeUndefined();
    expect(audio.src).toBe("https://media.example.test/first.mp3");
    expect(audio.currentTime).toBe(4);

    await engine.previewAudio({
      kind: "track",
      previewId: program.tracks[1]?.id ?? "",
      resolvedAudioRef: "https://media.example.test/preview.mp3",
      durationMs: 20_000,
    });
    await engine.stopPreview();
    await flushAsync();
    expect(engine.getSnapshot().preview).toBeUndefined();
    expect(engine.getSnapshot()).toMatchObject({ state: "playing", positionMs: 4_000 });
  });

  it("keeps preview failures recoverable and never advances the program", async () => {
    const audio = new FakeAudio();
    const lease = new FakeLease();
    const engine = createAudioEngine({
      audio,
      lease,
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    await engine.loadProgram(program, { autoplay: false });
    audio.playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));

    await engine.previewAudio({
      kind: "track",
      previewId: program.tracks[1]?.id ?? "",
      resolvedAudioRef: "https://media.example.test/preview.mp3",
      durationMs: 20_000,
    });
    expect(engine.getSnapshot()).toMatchObject({
      currentIndex: 0,
      state: "paused",
      preview: { state: "paused", mediaError: "autoplay_blocked" },
    });

    audio.playResult = () => Promise.resolve();
    await engine.previewAudio({
      kind: "track",
      previewId: program.tracks[1]?.id ?? "",
      resolvedAudioRef: "https://media.example.test/preview.mp3",
      durationMs: 20_000,
    });
    audio.emit("waiting");
    expect(engine.getSnapshot().preview?.state).toBe("loading");
    audio.emit("playing");
    expect(engine.getSnapshot().preview?.state).toBe("playing");
    audio.fail();
    expect(engine.getSnapshot()).toMatchObject({
      currentIndex: 0,
      state: "paused",
      preview: { state: "failed", mediaError: "media_failed" },
    });
    expect(audio.src).toBe("https://media.example.test/first.mp3");
    await engine.stopPreview();
    expect(engine.getSnapshot().preview).toBeUndefined();

    audio.playResult = () => Promise.reject(new Error("decoder failed"));
    await engine.previewAudio({
      kind: "track",
      previewId: program.tracks[1]?.id ?? "",
      resolvedAudioRef: "https://media.example.test/preview.mp3",
      durationMs: 20_000,
    });
    expect(engine.getSnapshot()).toMatchObject({
      currentIndex: 0,
      state: "paused",
      preview: { state: "failed", mediaError: "media_failed" },
    });
    await engine.stopPreview();

    let resolvePreview: (() => void) | undefined;
    audio.playResult = () =>
      new Promise<void>((resolve) => {
        resolvePreview = resolve;
      });
    lease.setState({ ownership: "passive", profileId });
    const pendingPreview = engine.previewAudio({
      kind: "track",
      previewId: program.tracks[1]?.id ?? "",
      resolvedAudioRef: "https://media.example.test/preview.mp3",
      durationMs: 20_000,
    });
    lease.setState({ ownership: "passive", profileId });
    resolvePreview?.();
    await pendingPreview;
    expect(audio.pause).toHaveBeenCalled();
    expect(engine.getSnapshot().preview).toBeUndefined();
  });

  it("plays a queued single-track preview after the final program track", async () => {
    const audio = new FakeAudio();
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    await engine.loadProgram(program, { autoplay: false });
    await engine.next();
    await engine.next();
    await engine.queuePreviewNext?.({
      kind: "track",
      previewId: "00000000-0000-4000-8000-000000000099",
      resolvedAudioRef: "https://media.example.test/queued-preview.mp3",
      durationMs: 12_000,
    });
    await engine.play();

    audio.emit("ended");
    await vi.waitFor(() => {
      expect(engine.getSnapshot()).toMatchObject({
        state: "completed",
        preview: { previewId: "00000000-0000-4000-8000-000000000099", state: "playing" },
      });
    });
    audio.emit("ended");
    await vi.waitFor(() => {
      expect(engine.getSnapshot()).toMatchObject({ state: "completed", preview: undefined });
    });
    await engine.destroy();
  });

  it("plays a queued single-track preview between program items and resumes the next item", async () => {
    const audio = new FakeAudio();
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    await engine.loadProgram(program, { autoplay: true });
    await engine.queuePreviewNext?.({
      kind: "track",
      previewId: "00000000-0000-4000-8000-000000000098",
      resolvedAudioRef: "https://media.example.test/middle-preview.mp3",
      durationMs: 12_000,
    });

    audio.emit("ended");
    await vi.waitFor(() => {
      expect(engine.getSnapshot().preview?.previewId).toBe("00000000-0000-4000-8000-000000000098");
    });
    audio.emit("ended");
    await vi.waitFor(() => {
      expect(engine.getSnapshot()).toMatchObject({ currentIndex: 1, state: "playing" });
    });
    await engine.destroy();
  });

  it("fences preview completions that arrive after the preview was stopped", async () => {
    const audio = new FakeAudio();
    let resolvePlay: (() => void) | undefined;
    audio.playResult = () => new Promise<void>((resolve) => (resolvePlay = resolve));
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    await engine.loadProgram(program, { autoplay: false });
    const pending = engine.previewAudio({
      kind: "track",
      previewId: "00000000-0000-4000-8000-000000000097",
      resolvedAudioRef: "https://media.example.test/stale-preview.mp3",
      durationMs: 12_000,
    });
    await flushAsync();
    await engine.stopPreview();
    resolvePlay?.();
    await pending;
    expect(engine.getSnapshot().preview).toBeUndefined();

    let rejectPlay: ((error: Error) => void) | undefined;
    audio.playResult = () => new Promise<void>((_resolve, reject) => (rejectPlay = reject));
    const rejected = engine.previewAudio({
      kind: "track",
      previewId: "00000000-0000-4000-8000-000000000096",
      resolvedAudioRef: "https://media.example.test/stale-rejected-preview.mp3",
      durationMs: 12_000,
    });
    await flushAsync();
    await engine.stopPreview();
    rejectPlay?.(new Error("stale"));
    await rejected;
    expect(engine.getSnapshot().preview).toBeUndefined();
    await engine.destroy();
  });

  it("autoplays a fresh program and advances through ended segments to completion", async () => {
    const audio = new FakeAudio();
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport({ checkpoint: "wrong-program" }),
    });
    await engine.loadProgram(program, { autoplay: true });
    expect(engine.getSnapshot()).toMatchObject({ currentIndex: 0, state: "playing" });

    audio.currentTime = 4;
    audio.emit("timeupdate");
    await flushAsync();
    audio.currentTime = 5;
    audio.emit("timeupdate");
    expect(engine.getSnapshot().positionMs).toBe(5_000);
    audio.emit("waiting");
    expect(engine.getSnapshot().state).toBe("buffering");
    audio.emit("playing");
    audio.emit("ended");
    await flushAsync();
    expect(engine.getSnapshot().currentIndex).toBe(1);
    audio.emit("ended");
    await flushAsync();
    audio.emit("ended");
    await flushAsync();
    expect(engine.getSnapshot().state).toBe("completed");
    audio.emit("waiting");
  });

  it("retries a failed track once before skipping and reports an exhausted queue", async () => {
    const audio = new FakeAudio();
    const resolveTrackAudio = vi.fn((_profileId: string, trackId: string) =>
      Promise.resolve({
        trackId,
        resolvedAudioRef: `https://media.example.test/${trackId}-refreshed.mp3`,
        expiresAt: "2030-07-19T08:05:00.000Z",
      }),
    );
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      resolveTrackAudio,
      transport: createTransport(),
    });
    await engine.loadProgram(program, { autoplay: false });
    audio.fail();
    await flushAsync();
    expect(engine.getSnapshot().currentIndex).toBe(0);
    expect(audio.src).toContain("00000000-0000-4000-8000-000000000071-refreshed.mp3");
    expect(resolveTrackAudio).toHaveBeenCalledTimes(1);
    audio.fail();
    await flushAsync();
    expect(engine.getSnapshot().currentIndex).toBe(1);
    audio.fail();
    await flushAsync();
    expect(engine.getSnapshot().currentIndex).toBe(2);
    audio.fail();
    await flushAsync();
    expect(engine.getSnapshot().currentIndex).toBe(2);
    audio.fail();
    await flushAsync();
    expect(engine.getSnapshot()).toMatchObject({ state: "failed", mediaError: "queue_exhausted" });
    await engine.destroy();
  });

  it("samples the current media analyser and freezes after the reduced-motion sample", async () => {
    const audio = asHtmlAudio(new FakeAudio());
    const context = new FakeAudioContext(156);
    stubAudioContext(context);
    stubMatchMedia(true);
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });

    await engine.loadProgram(program, { autoplay: true });

    expect(context.createMediaElementSource).toHaveBeenCalledOnce();
    expect(context.analyser.connect).toHaveBeenCalledWith(context.destination);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(engine.getSnapshot()).toMatchObject({ waveformUnavailable: false });
    expect(engine.getSnapshot().waveform).toHaveLength(64);
    expect(engine.getSnapshot().waveform?.every((value) => value > 0.015)).toBe(true);
    await engine.pause();
    await engine.destroy();
  });

  it("marks a silent or unavailable analyser without falling back to a decorative waveform", async () => {
    const audio = asHtmlAudio(new FakeAudio());
    const context = new FakeAudioContext(128);
    stubAudioContext(context);
    stubMatchMedia(true);
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });

    await engine.loadProgram(program, { autoplay: true });

    expect(engine.getSnapshot()).toMatchObject({ waveform: undefined, waveformUnavailable: true });
    await engine.destroy();
  });

  it("continues sampling real media only while playback remains active", async () => {
    const audio = asHtmlAudio(new FakeAudio());
    const context = new FakeAudioContext(156);
    let sample: FrameRequestCallback | undefined;
    stubAudioContext(context);
    stubMatchMedia(false);
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      sample = callback;
      return 7;
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });

    await engine.loadProgram(program, { autoplay: true });
    expect(requestFrame).toHaveBeenCalledOnce();
    sample?.(0);
    expect(engine.getSnapshot().waveform).toHaveLength(64);
    audio.paused = true;
    sample?.(16);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    await engine.destroy();
  });

  it("keeps the existing source playable when a short-lived URL refresh fails", async () => {
    const audio = new FakeAudio();
    const firstItem = program.timeline[0];
    const firstTrack = program.tracks[0];
    if (firstItem === undefined || firstTrack === undefined)
      throw new Error("Fixture is incomplete");
    const resolveTrackAudio = vi.fn(() => Promise.reject(new Error("resolver unavailable")));
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      resolveTrackAudio,
      transport: createTransport(),
    });

    await engine.loadProgram(
      { ...program, tracks: [firstTrack], timeline: [firstItem] },
      { autoplay: false },
    );
    await engine.play();
    expect(engine.getSnapshot()).toMatchObject({ state: "playing", currentIndex: 0 });
    expect(resolveTrackAudio).toHaveBeenCalledOnce();
    await engine.destroy();
  });

  it("keeps autoplay denial recoverable without skipping the item", async () => {
    const audio = new FakeAudio();
    audio.playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    await engine.loadProgram(program, { autoplay: true });
    expect(engine.getSnapshot()).toMatchObject({
      currentIndex: 0,
      state: "paused",
      mediaError: "autoplay_blocked",
    });
  });

  it("throttles progress checkpoints and fences a stale epoch", async () => {
    let currentTime = 0;
    const audio = new FakeAudio();
    const lease = new FakeLease();
    const engine = createAudioEngine({
      audio,
      checkpointIntervalMs: 1_000,
      lease,
      now: () => currentTime,
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport({ saveStatus: 409 }),
    });
    await engine.loadProgram(program, { autoplay: false });
    await engine.play();
    currentTime = 1_001;
    audio.currentTime = 1;
    audio.emit("timeupdate");
    await flushAsync();
    expect(lease.getState().ownership).toBe("passive");
    expect(engine.getSnapshot().checkpointError).toBe(true);
  });

  it("keeps high-frequency progress updates to one checkpoint per interval", async () => {
    let currentTime = 0;
    let resolveCheckpoint: ((response: Response) => void) | undefined;
    const audio = new FakeAudio();
    const transport = createTransport();
    const request = vi.fn((_path: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          new Response(errorEnvelope("PLAYBACK_SNAPSHOT_NOT_FOUND"), { status: 404 }),
        );
      }
      return new Promise<Response>((resolve) => {
        resolveCheckpoint = resolve;
      });
    });
    transport.request = request;
    const engine = createAudioEngine({
      audio,
      checkpointIntervalMs: 1_000,
      lease: new FakeLease(),
      now: () => currentTime,
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport,
    });
    await engine.loadProgram(program, { autoplay: false });
    await engine.play();

    currentTime = 1_001;
    for (let index = 0; index < 2_000; index += 1) {
      audio.currentTime = (index % 9) + 1;
      audio.emit("timeupdate");
    }
    expect(request).toHaveBeenCalledTimes(2);

    resolveCheckpoint?.(
      new Response(
        JSON.stringify({
          profileId,
          programId,
          timelineItemId: program.timeline[0]?.id,
          positionMs: 1_000,
          volume: 1,
          status: "playing",
          savedAt: "2026-07-19T08:00:00.000Z",
        }),
        { status: 200 },
      ),
    );
    await flushAsync();
    currentTime = 2_002;
    audio.emit("timeupdate");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("mirrors the active tab snapshot and takes over before playing", async () => {
    const audio = new FakeAudio();
    const lease = new FakeLease();
    lease.state = { ownership: "passive", profileId };
    const engine = createAudioEngine({
      audio,
      lease,
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    await engine.loadProgram(program, { autoplay: false });
    lease.emitSnapshot({
      profileId,
      programId,
      timelineItemId: program.timeline[2]?.id ?? "",
      currentIndex: 2,
      itemCount: 3,
      positionMs: 3_000,
      durationMs: 20_000,
      volume: 0.7,
      state: "playing",
      leaseEpoch: 7,
    });
    lease.emitSnapshot({
      profileId: "00000000-0000-4000-8000-000000000099",
      programId,
      timelineItemId: program.timeline[0]?.id ?? "",
      currentIndex: 0,
      itemCount: 3,
      positionMs: 0,
      durationMs: 10_000,
      volume: 1,
      state: "paused",
      leaseEpoch: 8,
    });
    expect(engine.getSnapshot()).toMatchObject({ ownership: "passive", currentIndex: 2 });
    await engine.play();
    expect(engine.getSnapshot()).toMatchObject({ ownership: "active", state: "playing" });
    await engine.prepareForProfileSwitch();
    expect(lease.released).toBe(true);
    expect(engine.getSnapshot().state).toBe("idle");
  });

  it("uses the browser audio, preloader and lease defaults", async () => {
    const audio = new FakeAudio();
    class SilentChannel {
      addEventListener(): void {}
      close(): void {}
      postMessage(): void {}
    }
    vi.stubGlobal("Audio", function Audio(): FakeAudio {
      return audio;
    });
    vi.stubGlobal("BroadcastChannel", SilentChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "browser-owner" });
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => {
        values.clear();
      },
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    });
    window.localStorage.clear();
    const engine = createAudioEngine({ transport: createTransport() });

    await engine.loadProgram(program, { autoplay: false });
    expect(document.head.querySelector('link[rel="preload"]')?.getAttribute("href")).toBe(
      "/tts/00000000-0000-4000-8000-000000000081.wav",
    );
    await engine.next();
    await engine.next();
    expect(document.head.querySelector('link[rel="preload"]')).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    await flushAsync();
    expect(window.localStorage.getItem("koradio.playback.lease.v1")).toBeNull();
    await engine.destroy();
  });

  it("overlays DJ voice on music and restores the listener volume after ducking", async () => {
    const music = new FakeAudio();
    const voice = new FakeAudio();
    const lease = new FakeLease();
    const intro = program.timeline[1];
    const firstTrack = program.timeline[0];
    const secondTrack = program.timeline[2];
    if (
      intro === undefined ||
      intro.kind !== "dj" ||
      firstTrack === undefined ||
      secondTrack === undefined
    ) {
      throw new Error("Audio fixture is incomplete");
    }
    const overlayProgram: ProgramDetail = {
      ...program,
      program: { ...program.program, playbackMode: "voice-overlay" },
      timeline: [
        intro,
        firstTrack,
        {
          ...intro,
          id: "00000000-0000-4000-8000-000000000091",
          position: 2,
        },
        secondTrack,
      ],
    };
    const engine = createAudioEngine({
      audio: music,
      lease,
      transport: createTransport(),
      voiceAudio: voice,
    });

    await engine.loadProgram(overlayProgram, { autoplay: true });
    await flushAsync();
    expect(engine.getSnapshot()).toMatchObject({
      currentItem: { kind: "track", trackId: program.program.trackIds[0] },
      itemCount: 2,
      voiceActive: true,
      voiceSegmentId: intro.segmentId,
    });
    vi.advanceTimersByTime(350);
    expect(music.volume).toBeCloseTo(0.28, 2);
    await engine.pause();
    expect(voice.paused).toBe(true);
    await engine.play();
    expect(voice.play).toHaveBeenCalledTimes(2);
    engine.setVolume(0.5);
    voice.currentTime = 1.2;
    voice.emit("timeupdate");
    expect(engine.getSnapshot()).toMatchObject({ voicePositionMs: 1_200, volume: 0.5 });
    expect(music.volume).toBeCloseTo(0.14, 2);
    voice.emit("ended");
    vi.advanceTimersByTime(650);
    expect(music.volume).toBeCloseTo(0.5, 2);
    expect(engine.getSnapshot()).toMatchObject({
      voiceActive: false,
      voiceSegmentId: undefined,
    });
    await engine.destroy();
  });

  it("contains overlay voice failures and cues the outro over the final track", async () => {
    const music = new FakeAudio();
    const voice = new FakeAudio();
    const lease = new FakeLease();
    const intro = program.timeline[1];
    const firstTrack = program.timeline[0];
    const secondTrack = program.timeline[2];
    if (intro === undefined || firstTrack === undefined || secondTrack === undefined) {
      throw new Error("Audio fixture is incomplete");
    }
    const outro = {
      ...intro,
      id: "00000000-0000-4000-8000-000000000095",
      position: 3,
    };
    const overlayProgram: ProgramDetail = {
      ...program,
      program: { ...program.program, playbackMode: "voice-overlay" },
      timeline: [intro, firstTrack, secondTrack, outro],
    };
    voice.playResult = () => Promise.reject(new Error("voice unavailable"));
    const engine = createAudioEngine({
      audio: music,
      lease,
      transport: createTransport(),
      voiceAudio: voice,
    });

    await engine.loadProgram(overlayProgram, { autoplay: true });
    await flushAsync();
    expect(engine.getSnapshot().voiceActive).toBe(false);
    voice.emit("ended");
    voice.emit("error");
    music.emit("ended");
    await vi.waitFor(() => {
      expect(engine.getSnapshot().currentIndex).toBe(1);
    });
    voice.playResult = () => {
      voice.paused = false;
      return Promise.resolve();
    };
    music.currentTime = 19;
    music.emit("timeupdate");
    await flushAsync();
    expect(engine.getSnapshot().voiceActive).toBe(true);
    voice.fail();
    vi.advanceTimersByTime(650);
    expect(engine.getSnapshot().voiceActive).toBe(false);
    lease.setState({ ownership: "passive", profileId });
    await engine.pause();
    await engine.destroy();
  });

  it("recovers music when resuming a paused overlay voice fails", async () => {
    const music = new FakeAudio();
    const voice = new FakeAudio();
    const intro = program.timeline[1];
    const firstTrack = program.timeline[0];
    if (intro === undefined || firstTrack === undefined) throw new Error("Fixture is incomplete");
    const engine = createAudioEngine({
      audio: music,
      lease: new FakeLease(),
      transport: createTransport(),
      voiceAudio: voice,
    });
    await engine.loadProgram(
      {
        ...program,
        program: { ...program.program, playbackMode: "voice-overlay" },
        timeline: [intro, firstTrack],
      },
      { autoplay: true },
    );
    await engine.pause();
    voice.playResult = () => Promise.reject(new Error("resume failed"));
    await engine.play();
    vi.advanceTimersByTime(650);
    expect(engine.getSnapshot()).toMatchObject({ state: "playing", voiceActive: false });
    expect(music.volume).toBeCloseTo(1, 2);
    await engine.destroy();
  });

  it("keeps pending playback fenced and handles commands without an active item", async () => {
    const audio = new FakeAudio();
    const lease = new FakeLease();
    let resolvePlay: (() => void) | undefined;
    audio.playResult = () => new Promise<void>((resolve) => (resolvePlay = resolve));
    const engine = createAudioEngine({
      audio,
      lease,
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    await engine.pause();
    await engine.previous();
    await engine.seek(1_000);
    await engine.next();
    lease.setState({ ownership: "passive", profileId });
    await engine.play();

    await engine.loadProgram(program, { autoplay: false });
    const pendingPlay = engine.play();
    lease.setState({ ownership: "passive", profileId });
    resolvePlay?.();
    await pendingPlay;
    expect(audio.pause).toHaveBeenCalled();
    expect(engine.getSnapshot().ownership).toBe("passive");
  });

  it("reports checkpoint restore failures and generic media playback failures", async () => {
    const audio = new FakeAudio();
    audio.playResult = () => Promise.reject(new Error("decoder failed"));
    const transport = createTransport();
    transport.request = vi.fn((_path: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return Promise.resolve(new Response(errorEnvelope("UNEXPECTED"), { status: 500 }));
      }
      return Promise.resolve(new Response(errorEnvelope("UNEXPECTED"), { status: 500 }));
    });
    const engine = createAudioEngine({
      audio,
      lease: new FakeLease(),
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport,
    });

    await engine.loadProgram(program, { autoplay: true });
    expect(engine.getSnapshot()).toMatchObject({
      checkpointError: true,
      currentIndex: 2,
      mediaError: "queue_exhausted",
    });
  });

  it("restarts the current item, switches programs and exposes subscription cleanup", async () => {
    const audio = new FakeAudio();
    const lease = new FakeLease();
    const engine = createAudioEngine({
      audio,
      lease,
      preloader: { preload: vi.fn(), clear: vi.fn() },
      transport: createTransport(),
    });
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    await engine.loadProgram(program, { autoplay: false });
    await engine.loadProgram(program, { autoplay: true });
    await engine.play();
    audio.currentTime = 4;
    audio.emit("timeupdate");
    await engine.previous();
    expect(engine.getSnapshot()).toMatchObject({
      currentIndex: 0,
      positionMs: 0,
      state: "playing",
    });
    unsubscribe();
    const count = listener.mock.calls.length;
    engine.setVolume(0.25);
    expect(listener).toHaveBeenCalledTimes(count);

    const replacement: ProgramDetail = {
      ...program,
      program: { ...program.program, id: "00000000-0000-4000-8000-000000000090" },
    };
    await engine.loadProgram(replacement, { autoplay: false });
    await engine.activateProfile("00000000-0000-4000-8000-000000000011");
    expect(engine.getSnapshot().profileId).toBe("00000000-0000-4000-8000-000000000011");
    await engine.clearProgram?.();
    expect(engine.getSnapshot()).toMatchObject({
      state: "idle",
      profileId: undefined,
      programId: undefined,
      itemCount: 0,
    });
    expect(lease.released).toBe(true);
    expect(audio.removeAttribute).toHaveBeenCalledWith("src");
  });

  it("propagates unexpected checkpoint API errors", async () => {
    const transport = createTransport();
    transport.request = () =>
      Promise.resolve(new Response(errorEnvelope("UNEXPECTED"), { status: 500 }));
    await expect(getPlaybackCheckpoint(transport, profileId)).rejects.toMatchObject({
      status: 500,
    });
  });

  it("provides client and server React snapshots", () => {
    let value = { ownership: "active", state: "ready" } as AudioEngineSnapshot;
    const listeners = new Set<() => void>();
    const engine = {
      getSnapshot: () => value,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    } as unknown as AudioEngineFacade;
    const { result, unmount } = renderHook(() => useAudioSnapshot(engine));
    expect(result.current.state).toBe("ready");
    act(() => {
      value = { ...value, state: "paused" };
      for (const listener of listeners) listener();
    });
    expect(result.current.state).toBe("paused");
    expect(
      renderToString(
        createElement(() => createElement("span", null, useAudioSnapshot(engine).state)),
      ),
    ).toContain("paused");
    unmount();
    expect(listeners.size).toBe(0);
  });
});
