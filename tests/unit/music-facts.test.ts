import type { MusicTrack } from "@koradio/contracts";
import { describe, expect, it, vi } from "vitest";

import { createMusicBrainzFactProvider } from "../../apps/server/src/modules/programs/music-facts.js";

const track: MusicTrack = {
  id: "00000000-0000-4000-8000-000000000071",
  source: "netease",
  sourceTrackId: "fixture-track",
  title: "Example Song",
  artist: "Example Artist",
  album: "Example Album",
  artworkUrl: null,
  durationMs: 180_000,
  lyricStatus: "available",
  playable: true,
  originMode: "mock",
};

describe("UX-11 sourced music facts", () => {
  it("combines MusicBrainz and Wikimedia attribution and caches the result", async () => {
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("musicbrainz.org")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              recordings: [
                {
                  id: "00000000-0000-4000-8000-000000000081",
                  title: track.title,
                  "first-release-date": "2020-01-02",
                },
              ],
            }),
          ),
        );
      }
      if (url.includes("w/api.php")) {
        return Promise.resolve(
          new Response(JSON.stringify({ query: { search: [{ title: "Example Song" }] } })),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            title: "Example Song",
            description: "song by Example Artist",
            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Example_Song" } },
          }),
        ),
      );
    });
    const provider = createMusicBrainzFactProvider({ fetcher });

    const first = await provider.lookup(track);
    const second = await provider.lookup(track);

    expect(first.map((fact) => fact.provider)).toEqual(["musicbrainz", "wikimedia"]);
    expect(first[0]?.fact).toContain("2020-01-02");
    expect(first[1]?.url).toBe("https://en.wikipedia.org/wiki/Example_Song");
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
