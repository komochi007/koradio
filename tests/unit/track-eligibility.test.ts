import { musicTrackSchema, type TrackLyrics } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  isPotentiallyEligibleTrack,
  isTrackEligible,
  trackEligibilityFailureReason,
} from "../../apps/server/src/modules/programs/track-eligibility.js";
import { parseProgramListeningIntent } from "../../apps/server/src/modules/programs/listening-intent.js";

const scenarioText = "规划一档欧美流行歌单，不要纯音乐";
const intent = parseProgramListeningIntent(scenarioText);

function track(title: string, artist: string, album = "Fixture") {
  return musicTrackSchema.parse({
    id: `00000000-0000-4000-8000-${String(title.length).padStart(12, "0")}`,
    source: "netease",
    sourceTrackId: title,
    title,
    artist,
    album,
    artworkUrl: null,
    durationMs: 180_000,
    lyricStatus: "available",
    playable: true,
    originMode: "mock",
  });
}

function lyrics(content: string): TrackLyrics {
  return {
    trackId: "00000000-0000-4000-8000-000000000001",
    status: "available",
    content,
    originalContent: content,
  };
}

describe("track eligibility", () => {
  it("keeps western vocal songs and rejects other languages", () => {
    const western = track("Midnight Signal", "English Artist");
    const korean = track("Foreign ~ k o r e a n ~", "DEAN");
    expect(isPotentiallyEligibleTrack(western, intent, scenarioText)).toBe(true);
    expect(
      isTrackEligible(western, intent, scenarioText, lyrics("Only English words are present here")),
    ).toBe(true);
    expect(
      trackEligibilityFailureReason(
        korean,
        intent,
        scenarioText,
        lyrics("이 밤에 너와 함께 걸어가며 마음을 노래해"),
      ),
    ).toBe("region");
  });

  it("rejects instrumental versions even when the title is otherwise suitable", () => {
    const instrumental = track("Midnight Signal (Piano Version)", "English Artist");
    expect(isPotentiallyEligibleTrack(instrumental, intent, scenarioText)).toBe(false);
    expect(trackEligibilityFailureReason(instrumental, intent, scenarioText)).toBe("instrumental");
  });
});
