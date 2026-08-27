import {
  activatePlaybackSourceCommandSchema,
  dailyMixDetailSchema,
  dailyMixGenerationSnapshotSchema,
  dailyMixListResponseSchema,
  dailyMixPlaybackCheckpointSchema,
  dailyMixTodayResponseSchema,
  ensureDailyMixCommandSchema,
  saveDailyMixCheckpointCommandSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

const profileId = "00000000-0000-4000-8000-000000000010";
const dailyMixId = "00000000-0000-4000-8000-000000000020";
const jobId = "00000000-0000-4000-8000-000000000030";
const now = "2026-08-27T01:00:00.000Z";
const trackIds = Array.from(
  { length: 20 },
  (_, index) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
);
const mix = {
  id: dailyMixId,
  profileId,
  localDate: "2026-08-27",
  trackIds,
  generatedAt: now,
};
const tracks = trackIds.map((id, position) => ({
  position,
  bucket: position < 2 ? ("library" as const) : ("close" as const),
  track: {
    id,
    source: "netease" as const,
    sourceTrackId: `daily-${String(position)}`,
    title: `Daily ${String(position + 1)}`,
    artist: `Artist ${String(position + 1)}`,
    album: "Daily",
    artworkUrl: null,
    durationMs: 30_000,
    lyricStatus: "unavailable" as const,
    playable: true,
    originMode: "mock" as const,
  },
}));

describe("Daily Mix contracts", () => {
  it("accepts complete Daily Mix resources and command defaults", () => {
    const detail = dailyMixDetailSchema.parse({ mix, tracks });
    expect(detail.tracks).toHaveLength(20);
    expect(
      dailyMixTodayResponseSchema.parse({ localDate: mix.localDate, generation: null, mix: detail })
        .mix,
    ).toEqual(detail);
    expect(dailyMixListResponseSchema.parse({ items: [mix] }).items).toEqual([mix]);
    expect(ensureDailyMixCommandSchema.parse({})).toEqual({ retry: false });
    expect(ensureDailyMixCommandSchema.parse({ retry: true })).toEqual({ retry: true });
  });

  it("enforces generation terminal consistency", () => {
    const base = {
      jobId,
      profileId,
      localDate: mix.localDate,
      attemptCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    expect(
      dailyMixGenerationSnapshotSchema.parse({
        ...base,
        status: "succeeded",
        stage: "completed",
        dailyMixId,
      }).dailyMixId,
    ).toBe(dailyMixId);
    expect(
      dailyMixGenerationSnapshotSchema.parse({
        ...base,
        status: "running",
        stage: "resolving_tracks",
      }).status,
    ).toBe("running");
    expect(
      dailyMixGenerationSnapshotSchema.safeParse({
        ...base,
        status: "succeeded",
        stage: "resolving_tracks",
      }).success,
    ).toBe(false);
    expect(
      dailyMixGenerationSnapshotSchema.safeParse({
        ...base,
        status: "failed",
        stage: "planning",
        dailyMixId,
        errorCode: "DAILY_MIX_GENERATION_FAILED",
      }).success,
    ).toBe(false);
  });

  it("accepts Daily checkpoints and both source activation commands", () => {
    const checkpoint = {
      profileId,
      dailyMixId,
      trackId: trackIds[3],
      position: 3,
      positionMs: 2400,
      volume: 0.7,
      status: "paused" as const,
      savedAt: now,
    };
    expect(dailyMixPlaybackCheckpointSchema.parse(checkpoint)).toEqual(checkpoint);
    expect(
      saveDailyMixCheckpointCommandSchema.parse({
        profileId: checkpoint.profileId,
        dailyMixId: checkpoint.dailyMixId,
        trackId: checkpoint.trackId,
        position: checkpoint.position,
        positionMs: checkpoint.positionMs,
        volume: checkpoint.volume,
        status: checkpoint.status,
        leaseEpoch: 3,
      }),
    ).toMatchObject({ leaseEpoch: 3 });
    expect(activatePlaybackSourceCommandSchema.parse({ kind: "program", sourceId: jobId })).toEqual(
      { kind: "program", sourceId: jobId },
    );
    expect(
      activatePlaybackSourceCommandSchema.parse({ kind: "daily", sourceId: dailyMixId }),
    ).toEqual({ kind: "daily", sourceId: dailyMixId });
  });

  it("rejects malformed dates, partial lists, and invalid checkpoint bounds", () => {
    expect(dailyMixDetailSchema.safeParse({ mix, tracks: tracks.slice(0, 19) }).success).toBe(
      false,
    );
    expect(
      dailyMixListResponseSchema.safeParse({ items: [{ ...mix, localDate: "08/27" }] }).success,
    ).toBe(false);
    expect(
      dailyMixPlaybackCheckpointSchema.safeParse({
        profileId,
        dailyMixId,
        trackId: trackIds[0],
        position: 20,
        positionMs: 0,
        volume: 1,
        status: "paused",
        savedAt: now,
      }).success,
    ).toBe(false);
  });
});
