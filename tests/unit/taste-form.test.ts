import type { TasteResponse } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  createTasteDraft,
  isTasteEmpty,
  moveTasteValue,
  normalizeTasteDraft,
  validateTasteDraft,
} from "../../apps/web/src/features/taste/taste-form.js";

const emptyTaste: TasteResponse = {
  projection: {
    profileId: "00000000-0000-4000-8000-000000000010",
    tags: [],
    affinities: [],
    avoidSignals: [],
    sourceVersion: 0,
    updatedAt: "2026-07-20T08:00:00.000Z",
  },
  overrides: {
    profileId: "00000000-0000-4000-8000-000000000010",
    tags: [],
    avoidRules: [],
    sceneRules: [],
    updatedAt: "2026-07-20T08:00:00.000Z",
  },
  effective: {
    profileId: "00000000-0000-4000-8000-000000000010",
    projectionVersion: 0,
    overrideVersion: 0,
    resolvedTaste: { tags: [], affinities: [], avoidRules: [], sceneRules: [] },
  },
};

describe("Taste form rules", () => {
  it("copies overrides and identifies a truly empty Taste", () => {
    expect(createTasteDraft(emptyTaste)).toEqual({ tags: [], avoidRules: [], sceneRules: [] });
    expect(isTasteEmpty(emptyTaste)).toBe(true);
    expect(
      isTasteEmpty({
        ...emptyTaste,
        projection: { ...emptyTaste.projection, sourceVersion: 1 },
      }),
    ).toBe(false);
  });

  it("normalizes duplicate tags while preserving manual rule order", () => {
    expect(
      normalizeTasteDraft({
        tags: [" Ambient ", "ambient", "Dream Pop"],
        avoidRules: [" 刺耳人声 ", "强烈鼓点"],
        sceneRules: [" 夜晚写作 "],
      }),
    ).toEqual({
      tags: ["Ambient", "Dream Pop"],
      avoidRules: ["刺耳人声", "强烈鼓点"],
      sceneRules: ["夜晚写作"],
    });
  });

  it("validates blank and overlong values against the public field limits", () => {
    expect(
      validateTasteDraft({
        tags: ["x".repeat(25)],
        avoidRules: ["   ", "x".repeat(121)],
        sceneRules: ["   ", "x".repeat(161)],
      }),
    ).toEqual([
      { field: "tags", index: 0, message: "每个标签需在 24 个字符内" },
      { field: "avoidRules", index: 0, message: "避雷规则不能为空" },
      { field: "avoidRules", index: 1, message: "避雷规则不能超过 120 个字符" },
      { field: "sceneRules", index: 0, message: "场景规则不能为空" },
      { field: "sceneRules", index: 1, message: "场景规则不能超过 160 个字符" },
    ]);
  });

  it("moves values deterministically without crossing list boundaries", () => {
    expect(moveTasteValue(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
    expect(moveTasteValue(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
    expect(moveTasteValue(["a", "b"], 0, "up")).toEqual(["a", "b"]);
  });
});
