import {
  mergeEffectiveTaste,
  rebuildTasteProjection,
} from "../../apps/server/src/modules/taste/index.js";
import {
  feedbackEventSchema,
  tasteOverridesSchema,
  tasteProjectionSchema,
} from "@koradio/contracts";
import { describe, expect, it } from "vitest";

const profileId = "11111111-1111-4111-8111-111111111111";
const firstTrackId = "22222222-2222-4222-8222-222222222222";
const secondTrackId = "33333333-3333-4333-8333-333333333333";
const programId = "44444444-4444-4444-8444-444444444444";

function feedback(
  id: string,
  type:
    | "track_liked"
    | "track_like_removed"
    | "track_disliked"
    | "track_dislike_removed"
    | "program_favorited"
    | "program_favorite_removed"
    | "track_skipped",
  targetId: string,
  second: number,
) {
  return feedbackEventSchema.parse({
    id,
    profileId,
    targetId,
    type,
    idempotencyKey: `feedback-${String(second)}`,
    createdAt: `2026-07-16T09:00:${String(second).padStart(2, "0")}.000Z`,
  });
}

describe("Taste projection policy", () => {
  it("replays every feedback type in append order and keeps skips as facts only", () => {
    const projection = rebuildTasteProjection(
      profileId,
      [
        feedback("50000000-0000-4000-8000-000000000001", "track_liked", firstTrackId, 1),
        feedback("50000000-0000-4000-8000-000000000002", "track_like_removed", firstTrackId, 2),
        feedback("50000000-0000-4000-8000-000000000003", "track_liked", firstTrackId, 3),
        feedback("50000000-0000-4000-8000-000000000004", "track_disliked", secondTrackId, 4),
        feedback("50000000-0000-4000-8000-000000000005", "track_dislike_removed", secondTrackId, 5),
        feedback("50000000-0000-4000-8000-000000000006", "track_disliked", secondTrackId, 6),
        feedback("50000000-0000-4000-8000-000000000007", "program_favorited", programId, 7),
        feedback("50000000-0000-4000-8000-000000000008", "program_favorite_removed", programId, 8),
        feedback("50000000-0000-4000-8000-000000000009", "program_favorited", programId, 9),
        feedback("50000000-0000-4000-8000-000000000010", "track_skipped", firstTrackId, 10),
      ],
      "2026-07-16T08:00:00.000Z",
    );

    expect(projection).toEqual({
      profileId,
      tags: [],
      affinities: [`program:${programId}`, `track:${firstTrackId}`],
      avoidSignals: [`track:${secondTrackId}`],
      sourceVersion: 10,
      updatedAt: "2026-07-16T09:00:10.000Z",
    });
  });

  it("keeps empty projections stable and lets manual rules win during effective merge", () => {
    expect(rebuildTasteProjection(profileId, [], "2026-07-16T08:00:00.000Z")).toEqual({
      profileId,
      tags: [],
      affinities: [],
      avoidSignals: [],
      sourceVersion: 0,
      updatedAt: "2026-07-16T08:00:00.000Z",
    });

    const projection = tasteProjectionSchema.parse({
      profileId,
      tags: ["Ambient", "shoegaze"],
      affinities: ["track:keep", "SOFT"],
      avoidSignals: ["LOUD", "track:avoid"],
      sourceVersion: 12,
      updatedAt: "2026-07-16T09:00:12.000Z",
    });
    const overrides = tasteOverridesSchema.parse({
      profileId,
      tags: [" loud ", "ambient"],
      avoidRules: ["soft", "manual"],
      sceneRules: ["夜晚写作", "夜晚写作"],
      updatedAt: "2026-07-16T09:01:00.000Z",
    });

    expect(mergeEffectiveTaste(projection, overrides, 3)).toEqual({
      profileId,
      projectionVersion: 12,
      overrideVersion: 3,
      resolvedTaste: {
        tags: ["loud", "ambient", "shoegaze"],
        affinities: ["track:keep"],
        avoidRules: ["soft", "manual", "LOUD", "track:avoid"],
        sceneRules: ["夜晚写作"],
      },
    });
  });
});
