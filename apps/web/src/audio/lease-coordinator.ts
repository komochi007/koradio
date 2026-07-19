import type { LeasePlaybackSnapshot } from "./types.js";

export const playbackLeaseKey = "koradio.playback.lease.v1";
export const playbackTakeoverKey = "koradio.playback.takeover.v1";
export const playbackLeaseChannel = "koradio.playback.v1";
export const playbackLeaseRenewalMs = 2_000;
export const playbackLeaseTtlMs = 5_000;

export interface PlaybackLease {
  ownerId: string;
  profileId: string;
  epoch: number;
  expiresAt: number;
}

type LeaseMessage =
  | { type: "lease.changed"; lease: PlaybackLease | null }
  | { type: "takeover.requested"; requestId: string; profileId: string }
  | { type: "takeover.released"; requestId: string }
  | { type: "playback.snapshot"; snapshot: LeasePlaybackSnapshot };

interface BroadcastChannelLike {
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
  postMessage(message: LeaseMessage): void;
}

interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface PlaybackLeaseState {
  ownership: "active" | "passive";
  epoch?: number;
  profileId?: string;
}

export interface PlaybackLeaseCoordinator {
  destroy(): void;
  fence(epoch: number): void;
  getState(): PlaybackLeaseState;
  publishSnapshot(snapshot: LeasePlaybackSnapshot): void;
  release(): void;
  requestTakeover(): Promise<number>;
  start(profileId: string): number | undefined;
  subscribe(listener: (state: PlaybackLeaseState) => void): () => void;
  subscribeSnapshot(listener: (snapshot: LeasePlaybackSnapshot) => void): () => void;
}

interface CreatePlaybackLeaseCoordinatorOptions {
  channel?: BroadcastChannelLike;
  now?: () => number;
  onYield: () => Promise<void>;
  ownerId?: string;
  storage?: StorageLike;
}

function parseLease(value: string | null): PlaybackLease | null {
  if (value === null) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("ownerId" in candidate) ||
      !("profileId" in candidate) ||
      !("epoch" in candidate) ||
      !("expiresAt" in candidate) ||
      typeof candidate.ownerId !== "string" ||
      typeof candidate.profileId !== "string" ||
      typeof candidate.epoch !== "number" ||
      !Number.isSafeInteger(candidate.epoch) ||
      candidate.epoch < 0 ||
      typeof candidate.expiresAt !== "number" ||
      !Number.isFinite(candidate.expiresAt)
    ) {
      return null;
    }
    return candidate as PlaybackLease;
  } catch {
    return null;
  }
}

function createChannel(): BroadcastChannelLike {
  return new BroadcastChannel(playbackLeaseChannel);
}

export function createPlaybackLeaseCoordinator(
  options: CreatePlaybackLeaseCoordinatorOptions,
): PlaybackLeaseCoordinator {
  const channel = options.channel ?? createChannel();
  const storage = options.storage ?? window.localStorage;
  const now = options.now ?? Date.now;
  const ownerId = options.ownerId ?? crypto.randomUUID();
  const listeners = new Set<(state: PlaybackLeaseState) => void>();
  const snapshotListeners = new Set<(snapshot: LeasePlaybackSnapshot) => void>();
  let profileId: string | undefined;
  let state: PlaybackLeaseState = { ownership: "passive" };
  let renewalTimer: number | undefined;
  let yieldingRequestId: string | undefined;
  let takeoverPollTimer: number | undefined;
  let takeover:
    | { requestId: string; resolve: (epoch: number) => void; reject: (error: Error) => void }
    | undefined;

  function read(): PlaybackLease | null {
    return parseLease(storage.getItem(playbackLeaseKey));
  }

  function notify(): void {
    for (const listener of listeners) listener(state);
  }

  function setState(next: PlaybackLeaseState): void {
    if (
      state.ownership === next.ownership &&
      state.epoch === next.epoch &&
      state.profileId === next.profileId
    ) {
      return;
    }
    state = next;
    notify();
  }

  function clearRenewal(): void {
    if (renewalTimer !== undefined) {
      window.clearInterval(renewalTimer);
      renewalTimer = undefined;
    }
  }

  function demote(): void {
    clearRenewal();
    setState(
      profileId === undefined ? { ownership: "passive" } : { ownership: "passive", profileId },
    );
  }

  function renew(): void {
    if (state.ownership !== "active" || state.epoch === undefined || profileId === undefined) {
      return;
    }
    const current = read();
    if (current?.ownerId !== ownerId || current.epoch !== state.epoch) {
      demote();
      return;
    }
    const lease: PlaybackLease = { ...current, expiresAt: now() + playbackLeaseTtlMs };
    storage.setItem(playbackLeaseKey, JSON.stringify(lease));
    channel.postMessage({ type: "lease.changed", lease });
  }

  function beginRenewal(): void {
    clearRenewal();
    renewalTimer = window.setInterval(renew, playbackLeaseRenewalMs);
  }

  function synchronizeOwnedLease(current = read()): number | undefined {
    if (profileId === undefined || current?.ownerId !== ownerId || current.expiresAt <= now()) {
      return undefined;
    }
    if (state.ownership === "active" && state.epoch === current.epoch) notify();
    else setState({ ownership: "active", epoch: current.epoch, profileId });
    beginRenewal();
    return current.epoch;
  }

  function acquire(): number | undefined {
    if (profileId === undefined) return undefined;
    const current = read();
    if (current !== null && current.expiresAt > now() && current.ownerId !== ownerId) {
      demote();
      return undefined;
    }
    const epoch = Math.max(current?.epoch ?? 0, now()) + 1;
    const lease: PlaybackLease = {
      ownerId,
      profileId,
      epoch,
      expiresAt: now() + playbackLeaseTtlMs,
    };
    storage.setItem(playbackLeaseKey, JSON.stringify(lease));
    const written = read();
    if (written?.ownerId !== ownerId || written.epoch !== epoch) {
      demote();
      return undefined;
    }
    setState({ ownership: "active", epoch, profileId });
    beginRenewal();
    channel.postMessage({ type: "lease.changed", lease });
    return epoch;
  }

  function release(): void {
    const current = read();
    if (
      state.ownership === "active" &&
      state.epoch !== undefined &&
      current?.ownerId === ownerId &&
      current.epoch === state.epoch
    ) {
      storage.removeItem(playbackLeaseKey);
      channel.postMessage({ type: "lease.changed", lease: null });
    }
    demote();
  }

  function clearTakeoverPoll(): void {
    if (takeoverPollTimer !== undefined) {
      window.clearInterval(takeoverPollTimer);
      takeoverPollTimer = undefined;
    }
  }

  function clearStoredTakeover(requestId: string): void {
    const value = storage.getItem(playbackTakeoverKey);
    if (value === null) return;
    try {
      const request: unknown = JSON.parse(value);
      if (
        typeof request === "object" &&
        request !== null &&
        "requestId" in request &&
        request.requestId === requestId
      ) {
        storage.removeItem(playbackTakeoverKey);
      }
    } catch {
      return;
    }
  }

  function finishTakeover(): void {
    const pending = takeover;
    if (pending === undefined) return;
    const epoch = acquire();
    if (epoch === undefined) return;
    takeover = undefined;
    clearTakeoverPoll();
    clearStoredTakeover(pending.requestId);
    pending.resolve(epoch);
  }

  function handleTakeoverRequest(requestId: string, requestedProfileId: string): void {
    if (
      state.ownership !== "active" ||
      yieldingRequestId !== undefined ||
      requestedProfileId.length === 0
    ) {
      return;
    }
    yieldingRequestId = requestId;
    void options.onYield().finally(() => {
      release();
      yieldingRequestId = undefined;
      clearStoredTakeover(requestId);
      channel.postMessage({ type: "takeover.released", requestId });
    });
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key === playbackLeaseKey) {
      const changed = read();
      if (
        state.ownership === "active" &&
        (changed?.ownerId !== ownerId || changed.epoch !== state.epoch)
      ) {
        demote();
      } else if (state.ownership === "passive" && takeover !== undefined && changed === null) {
        finishTakeover();
      }
      return;
    }
    if (event.key !== playbackTakeoverKey) return;
    if (event.newValue === null) {
      if (state.ownership === "passive" && takeover !== undefined && read() === null) {
        finishTakeover();
      }
      return;
    }
    try {
      const request: unknown = JSON.parse(event.newValue);
      if (
        typeof request === "object" &&
        request !== null &&
        "requestId" in request &&
        "profileId" in request &&
        typeof request.requestId === "string" &&
        typeof request.profileId === "string"
      ) {
        handleTakeoverRequest(request.requestId, request.profileId);
      }
    } catch {
      return;
    }
  };
  const onFocus = (): void => {
    if (synchronizeOwnedLease() !== undefined) return;
    if (
      state.ownership === "passive" &&
      takeover !== undefined &&
      (read()?.expiresAt ?? 0) <= now()
    ) {
      finishTakeover();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onFocus);

  channel.addEventListener("message", (event) => {
    const message = event.data;
    if (typeof message !== "object" || message === null || !("type" in message)) return;
    if (message.type === "lease.changed" && "lease" in message) {
      const lease = read();
      if (
        state.ownership === "active" &&
        (lease === null || lease.ownerId !== ownerId || lease.epoch !== state.epoch)
      ) {
        demote();
      } else if (state.ownership === "passive" && takeover !== undefined && lease === null) {
        finishTakeover();
      }
      return;
    }
    if (
      message.type === "takeover.requested" &&
      "requestId" in message &&
      "profileId" in message &&
      typeof message.requestId === "string" &&
      typeof message.profileId === "string" &&
      state.ownership === "active"
    ) {
      handleTakeoverRequest(message.requestId, message.profileId);
      return;
    }
    if (
      message.type === "takeover.released" &&
      "requestId" in message &&
      takeover?.requestId === message.requestId
    ) {
      finishTakeover();
      return;
    }
    if (message.type === "playback.snapshot" && "snapshot" in message) {
      const snapshot = message.snapshot as LeasePlaybackSnapshot;
      for (const listener of snapshotListeners) listener(snapshot);
    }
  });

  return {
    destroy() {
      clearRenewal();
      clearTakeoverPoll();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      if (takeover !== undefined) clearStoredTakeover(takeover.requestId);
      takeover?.reject(new Error("Playback lease coordinator was destroyed"));
      takeover = undefined;
      release();
      channel.close();
      listeners.clear();
      snapshotListeners.clear();
    },
    fence(epoch) {
      if (state.epoch === epoch) release();
    },
    getState: () => state,
    publishSnapshot(snapshot) {
      if (state.ownership === "active" && state.epoch === snapshot.leaseEpoch) {
        channel.postMessage({ type: "playback.snapshot", snapshot });
      }
    },
    release,
    requestTakeover() {
      if (state.ownership === "active" && state.epoch !== undefined) {
        return Promise.resolve(state.epoch);
      }
      if (profileId === undefined) {
        return Promise.reject(new Error("Playback profile is not active"));
      }
      const current = read();
      const ownedEpoch = synchronizeOwnedLease(current);
      if (ownedEpoch !== undefined) return Promise.resolve(ownedEpoch);
      if (current === null || current.expiresAt <= now()) {
        const epoch = acquire();
        return epoch === undefined
          ? Promise.reject(new Error("Playback lease could not be acquired"))
          : Promise.resolve(epoch);
      }
      if (takeover !== undefined) {
        return Promise.reject(new Error("Playback takeover is already pending"));
      }
      const requestId = crypto.randomUUID();
      const takeoverProfileId = profileId;
      return new Promise<number>((resolve, reject) => {
        takeover = { requestId, resolve, reject };
        storage.setItem(
          playbackTakeoverKey,
          JSON.stringify({ requestId, profileId: takeoverProfileId, requestedAt: now() }),
        );
        channel.postMessage({
          type: "takeover.requested",
          requestId,
          profileId: takeoverProfileId,
        });
        takeoverPollTimer = window.setInterval(() => {
          if (takeover?.requestId === requestId && (read()?.expiresAt ?? 0) <= now()) {
            finishTakeover();
          }
        }, 100);
        window.setTimeout(() => {
          if (takeover?.requestId !== requestId) return;
          if ((read()?.expiresAt ?? 0) <= now()) finishTakeover();
          else {
            takeover = undefined;
            clearTakeoverPoll();
            clearStoredTakeover(requestId);
            reject(new Error("Playback owner did not release the lease"));
          }
        }, playbackLeaseTtlMs + 25);
      });
    },
    start(nextProfileId) {
      if (profileId !== nextProfileId) {
        release();
        profileId = nextProfileId;
      }
      const current = read();
      const ownedEpoch = synchronizeOwnedLease(current);
      if (ownedEpoch !== undefined) return ownedEpoch;
      return acquire();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
  };
}
