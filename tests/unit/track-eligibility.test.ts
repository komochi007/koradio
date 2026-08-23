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

function track(title: string, artist: string, album = "Fixture", releaseYear?: number) {
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
    releaseYear: releaseYear ?? null,
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

  it("treats named language requests as vocal-only and rejects credit-only theme tracks", () => {
    const chineseScenario = "规划一档华语歌单";
    const chineseIntent = parseProgramListeningIntent(chineseScenario);
    const theme = track("Merry Christmas Mr. Lawrence Main Theme", "坂本龙一");

    expect(chineseIntent.vocalMode).toBe("vocal-only");
    expect(
      trackEligibilityFailureReason(
        theme,
        chineseIntent,
        chineseScenario,
        lyrics("作曲：坂本龙一\n编曲：坂本龙一\n演奏：坂本龙一"),
      ),
    ).toBe("lyrics");
  });

  it("rejects actual NetEase JSON credits and instrumental notice responses", () => {
    const chineseScenario = "规划一档华语歌单";
    const chineseIntent = parseProgramListeningIntent(chineseScenario);
    const outerWilds = track("Outer Wilds", "Andrew Prahlow", "Original Soundtrack");
    const pureImagination = track("pure imagination", "Rook1e / J'san");

    expect(
      trackEligibilityFailureReason(
        outerWilds,
        chineseIntent,
        chineseScenario,
        lyrics(
          '{"t":0,"c":[{"tx":"作词: "},{"tx":"Andrew Prahlow"}]}\n{"t":1000,"c":[{"tx":"作曲: "},{"tx":"Andrew Prahlow"}]}\n{"t":2000,"c":[{"tx":"编曲: "},{"tx":"Andrew Prahlow"}]}\n[00:05.00]纯音乐，请欣赏',
        ),
      ),
    ).toBe("lyrics");
    expect(
      trackEligibilityFailureReason(
        pureImagination,
        chineseIntent,
        chineseScenario,
        lyrics('{"t":0,"c":[{"tx":"作曲: "},{"tx":"Rook1e"}]}\n[00:05.00]纯音乐，请欣赏'),
      ),
    ).toBe("lyrics");
  });

  it("keeps a soundtrack theme when it has substantive sung lyrics", () => {
    const chineseScenario = "规划一档华语歌单";
    const chineseIntent = parseProgramListeningIntent(chineseScenario);
    const themeSong = track("电影主题曲", "演唱者", "电影原声带");

    expect(
      trackEligibilityFailureReason(
        themeSong,
        chineseIntent,
        chineseScenario,
        lyrics("穿过漫长夜色\n我听见你轻轻呼唤\n让明天在歌声里靠近"),
      ),
    ).toBeNull();
  });

  it("rejects tracks outside an explicitly requested original release period", () => {
    const periodScenario = "规划一档 1990 年代的华语歌单";
    const periodIntent = parseProgramListeningIntent(periodScenario);

    expect(
      trackEligibilityFailureReason(
        track("旧日回声", "测试歌手", "Fixture", 2003),
        periodIntent,
        periodScenario,
        lyrics("在旧街灯下我们慢慢走过漫长的夜晚"),
      ),
    ).toBe("era");
  });
});
