import { describe, expect, it } from "vitest";

import {
  activatePlaybackSource,
  getDailyMixCheckpoint,
  getPlaybackCheckpoint,
  getPlaybackSourceSession,
  saveDailyMixCheckpoint,
  savePlaybackCheckpoint,
} from "../../apps/web/src/audio/api.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";

const profileId = "00000000-0000-4000-8000-000000000010";
const programId = "00000000-0000-4000-8000-000000000020";
const dailyMixId = "00000000-0000-4000-8000-000000000030";
const trackId = "00000000-0000-4000-8000-000000000040";
const timelineItemId = "00000000-0000-4000-8000-000000000050";
const savedAt = "2026-08-27T01:00:00.000Z";

function errorEnvelope(code: string): string {
  return JSON.stringify({
    code,
    message: code,
    retryable: false,
    correlationId: "00000000-0000-4000-8000-000000000099",
  });
}

function createTransport(
  handler: (path: string, init?: RequestInit) => Response,
): ServiceTransport & { requests: Array<{ path: string; init?: RequestInit }> } {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  return {
    requests,
    clearSession() {},
    connectEvents: () => Promise.reject(new Error("unused")),
    fetchHealth: () => Promise.reject(new Error("unused")),
    request(path, init) {
      requests.push({ path, ...(init === undefined ? {} : { init }) });
      return Promise.resolve(handler(path, init));
    },
  };
}

describe("playback API", () => {
  it("reads and saves Program and Daily checkpoints", async () => {
    const transport = createTransport((path) => {
      if (path.includes("daily-mix-playback")) {
        return new Response(
          JSON.stringify({
            profileId,
            dailyMixId,
            trackId,
            position: 3,
            positionMs: 2400,
            volume: 0.7,
            status: "paused",
            savedAt,
          }),
        );
      }
      return new Response(
        JSON.stringify({
          profileId,
          programId,
          timelineItemId,
          positionMs: 1800,
          volume: 0.8,
          status: "playing",
          savedAt,
        }),
      );
    });

    await expect(getPlaybackCheckpoint(transport, profileId)).resolves.toMatchObject({ programId });
    await expect(getDailyMixCheckpoint(transport, profileId)).resolves.toMatchObject({
      dailyMixId,
    });
    await expect(
      savePlaybackCheckpoint(transport, {
        profileId,
        programId,
        timelineItemId,
        positionMs: 1800,
        volume: 0.8,
        status: "playing",
        leaseEpoch: 2,
      }),
    ).resolves.toMatchObject({ programId });
    await expect(
      saveDailyMixCheckpoint(transport, {
        profileId,
        dailyMixId,
        trackId,
        position: 3,
        positionMs: 2400,
        volume: 0.7,
        status: "paused",
        leaseEpoch: 2,
      }),
    ).resolves.toMatchObject({ dailyMixId });
    expect(transport.requests.filter(({ init }) => init?.method === "PUT")).toHaveLength(2);
  });

  it("activates and restores a playback source session", async () => {
    const transport = createTransport(
      () =>
        new Response(
          JSON.stringify({
            profileId,
            activeKind: "daily",
            programId,
            dailyMixId,
            updatedAt: savedAt,
          }),
        ),
    );

    await expect(getPlaybackSourceSession(transport, profileId)).resolves.toMatchObject({
      activeKind: "daily",
    });
    await expect(
      activatePlaybackSource(transport, profileId, { kind: "daily", sourceId: dailyMixId }),
    ).resolves.toMatchObject({ dailyMixId });
    expect(transport.requests[1]?.init?.method).toBe("PUT");
  });

  it("maps missing snapshots to null and propagates other failures", async () => {
    const missing = createTransport(
      () => new Response(errorEnvelope("PLAYBACK_SNAPSHOT_NOT_FOUND"), { status: 404 }),
    );
    await expect(getPlaybackCheckpoint(missing, profileId)).resolves.toBeNull();
    await expect(getDailyMixCheckpoint(missing, profileId)).resolves.toBeNull();
    await expect(getPlaybackSourceSession(missing, profileId)).resolves.toBeNull();

    const failed = createTransport(
      () => new Response(errorEnvelope("INTERNAL_ERROR"), { status: 500 }),
    );
    await expect(getPlaybackCheckpoint(failed, profileId)).rejects.toMatchObject({ status: 500 });
    await expect(getDailyMixCheckpoint(failed, profileId)).rejects.toMatchObject({ status: 500 });
    await expect(getPlaybackSourceSession(failed, profileId)).rejects.toMatchObject({
      status: 500,
    });
  });
});
