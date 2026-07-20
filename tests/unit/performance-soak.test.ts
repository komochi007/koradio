// @vitest-environment jsdom

import type { ProgramDetail } from "@koradio/contracts";
import { describe, expect, it, vi } from "vitest";

import { BoundedTtlCache } from "../../apps/server/src/modules/library/cache.js";
import { createAudioEngine } from "../../apps/web/src/audio/audio-engine.js";
import type {
  PlaybackLeaseCoordinator,
  PlaybackLeaseState,
} from "../../apps/web/src/audio/lease-coordinator.js";
import type { LeasePlaybackSnapshot } from "../../apps/web/src/audio/types.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";

const profileId = "00000000-0000-4000-8000-000000000010";
const programId = "00000000-0000-4000-8000-000000000070";
const timelineItemId = "00000000-0000-4000-8000-000000000073";
const simulatedHours = 8;
const updateIntervalMs = 250;
const simulatedDurationMs = simulatedHours * 60 * 60_000;

const program: ProgramDetail = {
  program: {
    id: programId,
    profileId,
    scenarioText: "长时播放压力测试",
    title: "Long Session",
    status: "ready",
    trackIds: ["00000000-0000-4000-8000-000000000071"],
    createdAt: "2026-07-20T08:00:00.000Z",
  },
  djScripts: [],
  tracks: [
    {
      id: "00000000-0000-4000-8000-000000000071",
      source: "netease",
      sourceTrackId: "long-session",
      title: "Long Session",
      artist: "Koradio",
      album: "Soak",
      durationMs: simulatedDurationMs,
      lyricStatus: "unavailable",
    },
  ],
  timeline: [
    {
      id: timelineItemId,
      kind: "track",
      position: 0,
      trackId: "00000000-0000-4000-8000-000000000071",
      resolvedAudioRef: "https://media.example.test/long-session.mp3",
      durationMs: simulatedDurationMs,
    },
  ],
};

class SoakAudio {
  currentTime = 0;
  duration = simulatedDurationMs / 1_000;
  error: MediaError | null = null;
  paused = true;
  preload = "";
  src = "";
  volume = 1;
  readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  load(): void {}

  pause(): void {
    this.paused = true;
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

class SoakLease implements PlaybackLeaseCoordinator {
  readonly listeners = new Set<(state: PlaybackLeaseState) => void>();
  readonly snapshotListeners = new Set<(snapshot: LeasePlaybackSnapshot) => void>();
  state: PlaybackLeaseState = { ownership: "active", epoch: 7, profileId };
  publishedSnapshots = 0;

  destroy(): void {
    this.listeners.clear();
    this.snapshotListeners.clear();
  }

  fence(): void {}

  getState(): PlaybackLeaseState {
    return this.state;
  }

  publishSnapshot(): void {
    this.publishedSnapshots += 1;
  }

  release(): void {
    this.state = { ownership: "passive", profileId };
  }

  requestTakeover(): Promise<number> {
    return Promise.resolve(7);
  }

  start(): number {
    return 7;
  }

  subscribe(listener: (state: PlaybackLeaseState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeSnapshot(listener: (snapshot: LeasePlaybackSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }
}

function createSoakTransport(): ServiceTransport & { checkpointWrites: number } {
  return {
    checkpointWrites: 0,
    clearSession() {},
    connectEvents: () => Promise.reject(new Error("unused")),
    fetchHealth: () => Promise.reject(new Error("unused")),
    request(path, init) {
      if ((init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "PLAYBACK_SNAPSHOT_NOT_FOUND",
              message: "Playback snapshot was not found",
              retryable: false,
              correlationId: "00000000-0000-4000-8000-000000000099",
            }),
            { status: 404 },
          ),
        );
      }
      this.checkpointWrites += 1;
      if (typeof init?.body !== "string") throw new TypeError("Expected checkpoint body");
      const body = JSON.parse(init.body) as {
        positionMs: number;
        status: string;
        volume: number;
      };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            profileId,
            programId,
            timelineItemId,
            positionMs: body.positionMs,
            volume: body.volume,
            status: body.status,
            savedAt: "2026-07-20T08:00:00.000Z",
          }),
          { status: 200 },
        ),
      );
    },
  };
}

describe("S6-04 performance soak", () => {
  it("keeps cache churn bounded and clears expired entries", () => {
    let now = 0;
    const cache = new BoundedTtlCache<number, { value: number }>({
      capacity: 512,
      defaultTtlMs: 60_000,
      now: () => now,
    });
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();

    for (let index = 0; index < 250_000; index += 1) {
      now = index;
      cache.set(index, { value: index });
      if (index % 17 === 0) cache.get(Math.max(0, index - 64));
    }

    const elapsedMs = performance.now() - startedAt;
    const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
    expect(cache.size).toBe(512);
    expect(elapsedMs).toBeLessThan(5_000);
    expect(retainedHeapBytes).toBeLessThan(64 * 1024 * 1024);

    now += 60_001;
    cache.prune();
    expect(cache.size).toBe(0);
    console.info(
      "S6-04 cache soak",
      JSON.stringify({ entries: 250_000, capacity: 512, elapsedMs, retainedHeapBytes }),
    );
  });

  it("simulates eight hours of progress without checkpoint or listener growth", async () => {
    let now = 0;
    const audio = new SoakAudio();
    const lease = new SoakLease();
    const transport = createSoakTransport();
    const preloader = { preload: vi.fn(), clear: vi.fn() };
    const engine = createAudioEngine({
      audio,
      checkpointIntervalMs: 15_000,
      lease,
      now: () => now,
      preloader,
      transport,
    });
    await engine.loadProgram(program, { autoplay: true });
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    const updateCount = simulatedDurationMs / updateIntervalMs;

    for (let index = 1; index <= updateCount; index += 1) {
      now = index * updateIntervalMs;
      audio.currentTime = now / 1_000;
      audio.emit("timeupdate");
      if (index % 4_000 === 0) await Promise.resolve();
    }
    await Promise.resolve();
    await Promise.resolve();

    const elapsedMs = performance.now() - startedAt;
    const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
    expect(transport.checkpointWrites).toBe(simulatedDurationMs / 15_000);
    expect(audio.listeners.size).toBe(5);
    expect([...audio.listeners.values()].every((listeners) => listeners.size === 1)).toBe(true);
    expect(preloader.preload).not.toHaveBeenCalled();
    expect(lease.publishedSnapshots).toBeGreaterThanOrEqual(updateCount);
    expect(elapsedMs).toBeLessThan(10_000);
    expect(retainedHeapBytes).toBeLessThan(64 * 1024 * 1024);

    await engine.destroy();
    expect(lease.listeners.size).toBe(0);
    expect(lease.snapshotListeners.size).toBe(0);
    console.info(
      "S6-04 playback soak",
      JSON.stringify({
        simulatedHours,
        updateCount,
        checkpointWrites: transport.checkpointWrites,
        elapsedMs,
        retainedHeapBytes,
      }),
    );
  });
});
