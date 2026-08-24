import { describe, expect, it } from "vitest";

import {
  hasInstrumentalMarker,
  hasNonCanonicalVersionMarker,
  isCanonicalOriginalCandidate,
  isNonCanonicalVersion,
  matchesRequestedTrackQuery,
  sortCanonicalCandidates,
} from "../../apps/server/src/modules/library/track-version.js";

describe("track version selection", () => {
  const original = {
    title: "Space Song",
    artist: "Beach House",
    album: "Depression Cherry",
  };

  it("keeps canonical originals that match the requested primary artist", () => {
    expect(isCanonicalOriginalCandidate(original, "Space Song Beach House")).toBe(true);
  });

  it("rejects cover and all speed-altered variants", () => {
    expect(
      isNonCanonicalVersion({ ...original, title: "Space Song (Cover)", artist: "Other Artist" }),
    ).toBe(true);
    expect(isNonCanonicalVersion({ ...original, title: "Space Song (Sped Up)" })).toBe(true);
    expect(isNonCanonicalVersion({ ...original, title: "Space Song（加速版）" })).toBe(true);
    expect(isNonCanonicalVersion({ ...original, title: "Space Song (Slowed + Reverb)" })).toBe(
      true,
    );
  });

  it("rejects a result whose singer does not match the requested original artist", () => {
    expect(
      isCanonicalOriginalCandidate(
        { ...original, artist: "Cover Singer", album: "Beach House Tribute" },
        "Space Song Beach House",
      ),
    ).toBe(false);
  });

  it("requires both the requested title and primary artist before considering a fallback", () => {
    expect(matchesRequestedTrackQuery(original, "Space Song Beach House")).toBe(true);
    expect(
      matchesRequestedTrackQuery({ ...original, title: "Myth" }, "Space Song Beach House"),
    ).toBe(false);
  });

  it("recognizes an explicitly named non-canonical version", () => {
    expect(hasNonCanonicalVersionMarker("播放 Space Song 的加速版")).toBe(true);
    expect(hasNonCanonicalVersionMarker("Like A Star (Piano Version)")).toBe(true);
  });

  it("recognizes beat production tracks as instrumental", () => {
    expect(hasInstrumentalMarker('"雪" - Richnomadic Type Beat')).toBe(true);
    expect(hasInstrumentalMarker("Beat Maker Session")).toBe(true);
  });

  it("prefers the plain canonical title when a source appends release metadata", () => {
    const candidates = [
      { ...original, title: '半句再见 (From "At Café 6" / Main Theme Song)' },
      { ...original, title: "半句再见" },
    ];
    expect(sortCanonicalCandidates(candidates, "半句再见")[0]?.title).toBe("半句再见");
  });
});
