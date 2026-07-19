import type { TasteResponse } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  isFeedbackActive,
  toggleFeedbackCommand,
} from "../../apps/web/src/features/feedback/index.js";

const trackId = "00000000-0000-4000-8000-000000000071";
const programId = "00000000-0000-4000-8000-000000000070";

const taste: TasteResponse = {
  projection: {
    profileId: "00000000-0000-4000-8000-000000000010",
    tags: [],
    affinities: [`track:${trackId}`, `program:${programId}`],
    avoidSignals: [`track:${trackId}`],
    sourceVersion: 3,
    updatedAt: "2026-07-19T08:00:00.000Z",
  },
  overrides: {
    profileId: "00000000-0000-4000-8000-000000000010",
    tags: [],
    avoidRules: [],
    sceneRules: [],
    updatedAt: "2026-07-19T08:00:00.000Z",
  },
  effective: {
    profileId: "00000000-0000-4000-8000-000000000010",
    projectionVersion: 3,
    overrideVersion: 0,
    resolvedTaste: {
      tags: [],
      affinities: [`track:${trackId}`, `program:${programId}`],
      avoidRules: [`track:${trackId}`],
      sceneRules: [],
    },
  },
};

describe("feedback frontend state", () => {
  it("restores independent track and program states from TasteProjection", () => {
    expect(isFeedbackActive(taste, "track_like", trackId)).toBe(true);
    expect(isFeedbackActive(taste, "track_dislike", trackId)).toBe(true);
    expect(isFeedbackActive(taste, "program_favorite", programId)).toBe(true);
    expect(isFeedbackActive(taste, "track_like", "00000000-0000-4000-8000-000000000099")).toBe(
      false,
    );
  });

  it("derives all six toggle commands without rewriting prior events", () => {
    expect(toggleFeedbackCommand("track_like", trackId, false)).toEqual({
      type: "track_liked",
      targetId: trackId,
    });
    expect(toggleFeedbackCommand("track_like", trackId, true)).toEqual({
      type: "track_like_removed",
      targetId: trackId,
    });
    expect(toggleFeedbackCommand("track_dislike", trackId, false)).toEqual({
      type: "track_disliked",
      targetId: trackId,
    });
    expect(toggleFeedbackCommand("track_dislike", trackId, true)).toEqual({
      type: "track_dislike_removed",
      targetId: trackId,
    });
    expect(toggleFeedbackCommand("program_favorite", programId, false)).toEqual({
      type: "program_favorited",
      targetId: programId,
    });
    expect(toggleFeedbackCommand("program_favorite", programId, true)).toEqual({
      type: "program_favorite_removed",
      targetId: programId,
    });
  });
});
