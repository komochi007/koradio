// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlaybackLeaseCoordinator,
  playbackLeaseChannel,
  playbackLeaseKey,
  playbackLeaseRenewalMs,
  playbackLeaseTtlMs,
  playbackTakeoverKey,
} from "../../apps/web/src/audio/lease-coordinator.js";

interface ChannelEndpoint {
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
  postMessage(message: unknown): void;
}

class ChannelHub {
  readonly listeners = new Map<number, (event: MessageEvent<unknown>) => void>();
  nextId = 1;

  endpoint(): ChannelEndpoint {
    const id = this.nextId++;
    return {
      addEventListener: (_type, listener) => {
        this.listeners.set(id, listener);
      },
      close: () => {
        this.listeners.delete(id);
      },
      postMessage: (message) => {
        for (const [targetId, listener] of this.listeners) {
          if (targetId !== id) listener(new MessageEvent("message", { data: message }));
        }
      },
    };
  }

  send(message: unknown): void {
    for (const listener of this.listeners.values()) {
      listener(new MessageEvent("message", { data: message }));
    }
  }
}

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const profileId = "00000000-0000-4000-8000-000000000010";

describe("Playback lease coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("elects one owner, renews every two seconds and fences a competing epoch", () => {
    let now = 10_000;
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    const first = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => now,
      onYield: () => Promise.resolve(),
      ownerId: "first",
      storage,
    });
    const second = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => now,
      onYield: () => Promise.resolve(),
      ownerId: "second",
      storage,
    });

    const epoch = first.start(profileId);
    expect(epoch).toBeDefined();
    expect(second.start(profileId)).toBeUndefined();
    expect(first.getState().ownership).toBe("active");
    expect(second.getState().ownership).toBe("passive");

    now += playbackLeaseRenewalMs;
    vi.advanceTimersByTime(playbackLeaseRenewalMs);
    const renewed = JSON.parse(storage.getItem(playbackLeaseKey) ?? "{}") as { expiresAt: number };
    expect(renewed.expiresAt).toBe(now + playbackLeaseTtlMs);

    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({
        ownerId: "second",
        profileId,
        epoch: (epoch ?? 0) + 1,
        expiresAt: now + 5_000,
      }),
    );
    now += playbackLeaseRenewalMs;
    vi.advanceTimersByTime(playbackLeaseRenewalMs);
    expect(first.getState().ownership).toBe("passive");
    first.destroy();
    second.destroy();
  });

  it("saves and releases the original owner before explicit takeover", async () => {
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    const order: string[] = [];
    const first = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => 20_000,
      onYield: () => {
        order.push("saved-and-stopped");
        return Promise.resolve();
      },
      ownerId: "first",
      storage,
    });
    const second = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => 20_000,
      onYield: () => Promise.resolve(),
      ownerId: "second",
      storage,
    });
    first.start(profileId);
    second.start(profileId);

    const epoch = await second.requestTakeover();
    order.push("new-owner");
    expect(order).toEqual(["saved-and-stopped", "new-owner"]);
    expect(second.getState()).toEqual({ ownership: "active", epoch, profileId });
    expect(first.getState().ownership).toBe("passive");
    first.destroy();
    second.destroy();
  });

  it("acquires an expired lease and rejects duplicate or unacknowledged takeover requests", async () => {
    let now = 30_000;
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({ ownerId: "gone", profileId, epoch: 4, expiresAt: now - 1 }),
    );
    const coordinator = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => now,
      onYield: () => Promise.resolve(),
      ownerId: "next",
      storage,
    });
    await expect(coordinator.requestTakeover()).rejects.toThrow("profile is not active");
    expect(coordinator.start(profileId)).toBeGreaterThan(4);
    coordinator.release();

    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({ ownerId: "silent", profileId, epoch: 9, expiresAt: now + 100 }),
    );
    coordinator.start(profileId);
    const pending = coordinator.requestTakeover();
    await expect(coordinator.requestTakeover()).rejects.toThrow("already pending");
    now += 50;
    vi.advanceTimersByTime(playbackLeaseTtlMs + 25);
    await expect(pending).rejects.toThrow("did not release");
    expect(storage.getItem(playbackTakeoverKey)).toBeNull();
    coordinator.destroy();
  });

  it("publishes snapshots only as owner and handles invalid stored leases", () => {
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    storage.setItem(playbackLeaseKey, "not-json");
    const received: unknown[] = [];
    const first = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => 40_000,
      onYield: () => Promise.resolve(),
      ownerId: "first",
      storage,
    });
    const second = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => 40_000,
      onYield: () => Promise.resolve(),
      ownerId: "second",
      storage,
    });
    first.start(profileId);
    second.start(profileId);
    second.subscribeSnapshot((snapshot) => received.push(snapshot));
    const snapshot = {
      profileId,
      programId: "00000000-0000-4000-8000-000000000070",
      timelineItemId: "00000000-0000-4000-8000-000000000073",
      currentIndex: 0,
      itemCount: 1,
      positionMs: 0,
      durationMs: 1_000,
      volume: 1,
      state: "playing" as const,
      leaseEpoch: first.getState().epoch ?? 0,
    };
    first.publishSnapshot(snapshot);
    second.publishSnapshot(snapshot);
    expect(received).toEqual([snapshot]);
    first.fence(snapshot.leaseEpoch);
    expect(first.getState().ownership).toBe("passive");
    expect(storage.getItem(playbackLeaseKey)).toBeNull();
    second.fence(999);
    expect(second.getState().ownership).toBe("passive");
    first.destroy();
    second.destroy();
  });

  it("ignores a delayed storage removal event after the current owner acquires the lease", () => {
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    const coordinator = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => 50_000,
      onYield: () => Promise.resolve(),
      ownerId: "current",
      storage,
    });

    coordinator.start(profileId);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: playbackLeaseKey,
        newValue: null,
      }),
    );

    expect(coordinator.getState().ownership).toBe("active");
    coordinator.destroy();
  });

  it("rejects malformed lease shapes and recovers by acquiring a valid lease", () => {
    const invalidLeases: unknown[] = [
      null,
      {},
      { ownerId: 1, profileId, epoch: 1, expiresAt: 1 },
      { ownerId: "owner", profileId: 1, epoch: 1, expiresAt: 1 },
      { ownerId: "owner", profileId, epoch: "1", expiresAt: 1 },
      { ownerId: "owner", profileId, epoch: 1.5, expiresAt: 1 },
      { ownerId: "owner", profileId, epoch: -1, expiresAt: 1 },
      { ownerId: "owner", profileId, epoch: 1, expiresAt: "1" },
    ];

    for (const [index, invalid] of invalidLeases.entries()) {
      const storage = new MemoryStorage();
      storage.setItem(playbackLeaseKey, JSON.stringify(invalid));
      const coordinator = createPlaybackLeaseCoordinator({
        channel: new ChannelHub().endpoint(),
        now: () => 60_000,
        onYield: () => Promise.resolve(),
        ownerId: `owner-${String(index)}`,
        storage,
      });
      expect(coordinator.start(profileId)).toBeDefined();
      coordinator.destroy();
    }
  });

  it("uses browser defaults and restores an existing owner lease", () => {
    const messages: unknown[] = [];
    class BrowserChannel {
      constructor(readonly name: string) {}
      addEventListener(): void {}
      close(): void {}
      postMessage(message: unknown): void {
        messages.push(message);
      }
    }
    vi.stubGlobal("BroadcastChannel", BrowserChannel);
    vi.stubGlobal("crypto", { randomUUID: () => "browser-owner" });
    window.localStorage.clear();
    const coordinator = createPlaybackLeaseCoordinator({ onYield: () => Promise.resolve() });
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);

    const epoch = coordinator.start(profileId);
    expect(epoch).toBeDefined();
    expect(coordinator.start(profileId)).toBe(epoch);
    window.dispatchEvent(new Event("focus"));
    expect(messages.length).toBeGreaterThan(0);
    expect((coordinator as unknown as { name?: string }).name).toBeUndefined();
    unsubscribe();
    coordinator.release();
    expect(listener).toHaveBeenCalled();
    coordinator.destroy();
    expect(playbackLeaseChannel).toBe("koradio.playback.v1");
  });

  it("handles storage fallback takeover, invalid requests and focus expiry", async () => {
    let now = 70_000;
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    const yielded = vi.fn(() => Promise.resolve());
    const owner = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => now,
      onYield: yielded,
      ownerId: "owner",
      storage,
    });
    owner.start(profileId);
    window.dispatchEvent(new StorageEvent("storage", { key: playbackTakeoverKey, newValue: null }));
    window.dispatchEvent(
      new StorageEvent("storage", { key: playbackTakeoverKey, newValue: "not-json" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: playbackTakeoverKey,
        newValue: JSON.stringify({ requestId: 1, profileId }),
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: playbackTakeoverKey,
        newValue: JSON.stringify({ requestId: "storage-request", profileId }),
      }),
    );
    await Promise.resolve();
    expect(yielded).toHaveBeenCalledTimes(1);

    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({ ownerId: "silent", profileId, epoch: 9, expiresAt: now + 100 }),
    );
    const requester = createPlaybackLeaseCoordinator({
      channel: new ChannelHub().endpoint(),
      now: () => now,
      onYield: () => Promise.resolve(),
      ownerId: "requester",
      storage,
    });
    requester.start(profileId);
    const pending = requester.requestTakeover();
    now += 101;
    window.dispatchEvent(new Event("focus"));
    await expect(pending).resolves.toBeGreaterThan(9);
    owner.destroy();
    requester.destroy();
  });

  it("demotes on canonical lease messages and cleans up snapshot subscriptions", () => {
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    const coordinator = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => 80_000,
      onYield: () => Promise.resolve(),
      ownerId: "owner",
      storage,
    });
    coordinator.start(profileId);
    const snapshotListener = vi.fn();
    const unsubscribe = coordinator.subscribeSnapshot(snapshotListener);
    hub.send({ type: "invalid" });
    hub.send(null);
    hub.send({ type: "playback.snapshot", snapshot: { state: "playing" } });
    expect(snapshotListener).toHaveBeenCalledTimes(1);
    unsubscribe();
    hub.send({ type: "playback.snapshot", snapshot: { state: "paused" } });
    expect(snapshotListener).toHaveBeenCalledTimes(1);

    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({ ownerId: "competitor", profileId, epoch: 99, expiresAt: 90_000 }),
    );
    hub.send({ type: "lease.changed", lease: null });
    expect(coordinator.getState().ownership).toBe("passive");
    coordinator.destroy();
  });

  it("acquires through polling and rejects a pending takeover when destroyed", async () => {
    let now = 90_000;
    const storage = new MemoryStorage();
    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({ ownerId: "silent", profileId, epoch: 12, expiresAt: now + 100 }),
    );
    const coordinator = createPlaybackLeaseCoordinator({
      channel: new ChannelHub().endpoint(),
      now: () => now,
      onYield: () => Promise.resolve(),
      ownerId: "poller",
      storage,
    });
    coordinator.start(profileId);
    const pending = coordinator.requestTakeover();
    now += 101;
    vi.advanceTimersByTime(100);
    await expect(pending).resolves.toBeGreaterThan(12);
    expect(storage.getItem(playbackTakeoverKey)).toBeNull();
    expect(await coordinator.requestTakeover()).toBe(coordinator.getState().epoch);
    coordinator.release();

    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({ ownerId: "silent", profileId, epoch: 20, expiresAt: now + 1_000 }),
    );
    coordinator.start(profileId);
    const abandoned = coordinator.requestTakeover();
    coordinator.destroy();
    await expect(abandoned).rejects.toThrow("destroyed");
    expect(storage.getItem(playbackTakeoverKey)).toBeNull();
  });

  it("keeps takeover pending when the release signal arrives before storage converges", async () => {
    const now = 100_000;
    const storage = new MemoryStorage();
    const hub = new ChannelHub();
    storage.setItem(
      playbackLeaseKey,
      JSON.stringify({ ownerId: "old", profileId, epoch: 30, expiresAt: now + 5_000 }),
    );
    const coordinator = createPlaybackLeaseCoordinator({
      channel: hub.endpoint(),
      now: () => now,
      onYield: () => Promise.resolve(),
      ownerId: "next",
      storage,
    });
    coordinator.start(profileId);
    const pending = coordinator.requestTakeover();
    const request = JSON.parse(storage.getItem(playbackTakeoverKey) ?? "{}") as {
      requestId: string;
    };

    hub.send({ type: "takeover.released", requestId: request.requestId });
    expect(coordinator.getState().ownership).toBe("passive");
    storage.removeItem(playbackLeaseKey);
    window.dispatchEvent(new StorageEvent("storage", { key: playbackLeaseKey, newValue: null }));

    await expect(pending).resolves.toBeGreaterThan(30);
    coordinator.destroy();
  });
});
