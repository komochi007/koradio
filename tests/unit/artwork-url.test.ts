import { describe, expect, it } from "vitest";

import { normalizeArtworkUrl } from "../../apps/server/src/modules/library/artwork-url.js";

describe("Artwork URL normalization", () => {
  it("upgrades NetEase artwork to HTTPS and preserves HTTPS URLs", () => {
    expect(normalizeArtworkUrl("http://p1.music.126.net/cover.jpg")).toBe(
      "https://p1.music.126.net/cover.jpg",
    );
    expect(normalizeArtworkUrl("https://cdn.example.test/cover.jpg")).toBe(
      "https://cdn.example.test/cover.jpg",
    );
  });

  it("rejects empty, malformed and non-HTTPS artwork URLs", () => {
    expect(normalizeArtworkUrl(null)).toBeNull();
    expect(normalizeArtworkUrl(" ")).toBeNull();
    expect(normalizeArtworkUrl("not a URL")).toBeNull();
    expect(normalizeArtworkUrl("http://cdn.example.test/cover.jpg")).toBeNull();
  });
});
