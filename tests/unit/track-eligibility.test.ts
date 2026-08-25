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
  it("derives a restrained, focused profile from soft office language", () => {
    const softOffice = parseProgramListeningIntent("下午在咖啡店办公，想听柔和、舒缓一点的歌");

    expect(softOffice).toMatchObject({
      attentionLevel: "focus",
      energyTarget: "low-mid",
      rhythmSalience: "restrained",
      styleAvoids: ["说唱主导", "Trap/Drill", "强鼓点", "强 EDM/drop"],
    });
  });

  it("keeps a negative rap instruction as an avoidance rather than a positive request", () => {
    const softOffice = parseProgramListeningIntent("下午办公想听舒缓的歌，不要说唱");

    expect(softOffice.styleAvoids).toContain("说唱");
    expect(softOffice.styleAvoids).toContain("Trap/Drill");
  });

  it("keeps western vocal songs and rejects other languages", () => {
    const western = track("Midnight Signal", "English Artist");
    const korean = track("Foreign ~ k o r e a n ~", "DEAN");
    expect(isPotentiallyEligibleTrack(western, intent, scenarioText)).toBe(true);
    expect(
      isTrackEligible(
        western,
        intent,
        scenarioText,
        lyrics("Only English words\nKeep the room warm\nStay here tonight"),
      ),
    ).toBe(true);
    expect(
      trackEligibilityFailureReason(
        korean,
        intent,
        scenarioText,
        lyrics("이 밤에 너와 함께 걸어가며\n마음을 노래해\n새벽까지 머물러 줘"),
      ),
    ).toBe("region");
  });

  it("rejects instrumental versions even when the title is otherwise suitable", () => {
    const instrumental = track("Midnight Signal (Piano Version)", "English Artist");
    expect(isPotentiallyEligibleTrack(instrumental, intent, scenarioText)).toBe(false);
    expect(trackEligibilityFailureReason(instrumental, intent, scenarioText)).toBe("instrumental");
  });

  it("accepts marked instrumental works without lyrics and rejects sung material", () => {
    const instrumentalScenario = "规划一档午后办公听的纯音乐歌单";
    const instrumentalIntent = parseProgramListeningIntent(instrumentalScenario);
    const piano = track("Afternoon Window (Piano Version)", "Fixture Artist");

    expect(instrumentalIntent.vocalMode).toBe("instrumental-only");
    expect(isPotentiallyEligibleTrack(piano, instrumentalIntent, instrumentalScenario)).toBe(true);
    expect(
      trackEligibilityFailureReason(piano, instrumentalIntent, instrumentalScenario),
    ).toBeNull();
    expect(
      trackEligibilityFailureReason(
        piano,
        instrumentalIntent,
        instrumentalScenario,
        lyrics(
          "窗边的风吹过午后的光线\n让时间慢慢停在桌面\n我把思绪放进安静的房间\n等下一页轻轻翻开",
        ),
      ),
    ).toBe("instrumental");
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

  it("rejects beat metadata and sparse timed prose that cannot prove a singer", () => {
    const chineseScenario = "规划一档华语歌单";
    const chineseIntent = parseProgramListeningIntent(chineseScenario);
    const typeBeat = track('"雪" - Richnomadic Type Beat', "YKFireVibes");
    const windRises = track("随风起", "武士D");

    expect(
      trackEligibilityFailureReason(
        typeBeat,
        chineseIntent,
        chineseScenario,
        lyrics(
          "风格：嘻哈说唱 Hip Hop/Rap\nBPM：119\nKEY：F Minor\nBeat说明：版权已售罄，仅供交流欣赏",
        ),
      ),
    ).toBe("instrumental");
    expect(
      trackEligibilityFailureReason(
        windRises,
        chineseIntent,
        chineseScenario,
        lyrics(
          "[00:03.459]监制：12k/Shawn\n[00:04.141]刀挂于檐下时，还在等待出鞘的弧光。\n[00:10.029]他盘坐晨昏，手总向左胯探去——那里只剩和服褶皱的重量。\n[00:30.000]风开始携带过去听不见的声音。\n[00:48.000]竹节生长时的崩裂，露水滚落叶片的轨迹。\n[01:07.000]他仍在等待一把未曾存在的刀。\n[01:22.000]暮色从屋檐慢慢流过。\n[01:49.000]风停了。",
        ),
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
        lyrics("穿过漫长夜色\n我听见你轻轻呼唤\n让明天在歌声里靠近\n让心跳成为新的方向"),
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
