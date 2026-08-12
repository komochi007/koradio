import { describe, expect, it } from "vitest";

import { transcriptIsPinnedToEnd } from "../../apps/web/src/features/radio/radio-experience.js";

describe("Radio transcript scrolling", () => {
  it("only follows new messages while the listener remains at the end", () => {
    expect(transcriptIsPinnedToEnd(300, 1_200, 900)).toBe(true);
    expect(transcriptIsPinnedToEnd(300, 1_200, 876)).toBe(true);
    expect(transcriptIsPinnedToEnd(300, 1_200, 875)).toBe(false);
  });
});
