import type { PlaybackTimelineItem } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  deriveTimedText,
  deriveTimedTextUnits,
  estimateDjTiming,
  estimateUntimedLyricsTiming,
  parseLrc,
  parseTimedLyrics,
  parseUntimedLyrics,
  programProgress,
  splitHighlightUnits,
  splitDjSentences,
} from "../../apps/web/src/features/radio/detail-timed-text.js";

describe("Detail timed text", () => {
  it("splits DJ copy and estimates continuous sentence timing by readable length", () => {
    expect(splitDjSentences("先慢下来。\n然后，听见房间呼吸！最后一句")).toEqual([
      "先慢下来。",
      "然后，听见房间呼吸！",
      "最后一句",
    ]);
    const lines = estimateDjTiming("短句。这里是一句更长的串讲。", 9_000);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.startMs).toBe(0);
    expect(lines[0]?.endMs).toBeLessThan(lines[1]?.endMs ?? 0);
    expect(lines[1]?.endMs).toBe(9_000);
    expect(estimateDjTiming("   ", 2_000)).toEqual([]);
  });

  it("parses sorted LRC timestamps, multiple tags and ignores metadata", () => {
    expect(
      parseLrc("[ar:Koradio]\n[00:04.50]Second line\n[00:01.250][00:02.00]First line", 8_000),
    ).toEqual([
      { startMs: 1_250, endMs: 2_000, text: "First line" },
      { startMs: 2_000, endMs: 4_500, text: "First line" },
      { startMs: 4_500, endMs: 8_000, text: "Second line" },
    ]);
  });

  it("segments Chinese by character, English by word and keeps punctuation with the previous unit", () => {
    expect(splitHighlightUnits("今晚写 code, then rest! 好。 ")).toEqual([
      "今",
      "晚",
      "写 ",
      "code, ",
      "then ",
      "rest! ",
      "好。 ",
    ]);
  });

  it("uses NetEase YRC word timestamps without estimating a word progression", () => {
    const [line] = parseTimedLyrics(
      "[1000,2800](1000,900,0)Someway (1900,700,0)baby(2600,1200,0)!",
      10_000,
    );
    expect(line).toMatchObject({ startMs: 1_000, endMs: 3_800, text: "Someway baby!" });
    if (line === undefined) throw new Error("Expected a YRC line");
    const units = deriveTimedTextUnits({ ...line, state: "current" }, 2_200);
    expect(units.map(({ text, state }) => ({ state, text }))).toEqual([
      { state: "played", text: "Someway " },
      { state: "current", text: "baby" },
      { state: "upcoming", text: "!" },
    ]);
    expect(units[1]?.progress).toBeGreaterThan(0);
    expect(units[1]?.progress).toBeLessThan(1);
  });

  it("keeps the provider's absolute word timestamps for a real NetEase YRC line", () => {
    const [line] = parseTimedLyrics(
      "[40570,2220](40570,570,0)Apart (41140,240,0)from (41380,1230,0)me(42610,150,0).",
      50_000,
    );
    if (line === undefined) throw new Error("Expected a YRC line");
    const units = deriveTimedTextUnits({ ...line, state: "current" }, 42_000);
    expect(units.map(({ text, state }) => ({ state, text }))).toEqual([
      { state: "played", text: "Apart " },
      { state: "played", text: "from " },
      { state: "current", text: "me" },
      { state: "upcoming", text: "." },
    ]);
    expect(units[2]?.progress).toBeGreaterThan(0);
    expect(units[2]?.progress).toBeLessThan(1);
  });

  it("estimates word progress inside the active line by readable length", () => {
    const line = deriveTimedText(
      [{ startMs: 1_000, endMs: 5_000, text: "听 music now!" }],
      3_000,
    )[0];
    expect(line).toBeDefined();
    if (line === undefined) throw new Error("Expected a current timed line");
    expect(deriveTimedTextUnits(line, 3_000).map((unit) => [unit.text, unit.state])).toEqual([
      ["听 ", "played"],
      ["music ", "current"],
      ["now!", "upcoming"],
    ]);
    const early = deriveTimedTextUnits(line, 2_000);
    const late = deriveTimedTextUnits(line, 3_000);
    expect(early[1]?.progress).toBeGreaterThan(0);
    expect(late[1]?.progress).toBeGreaterThan(early[1]?.progress ?? 0);
    expect(late[1]?.progress).toBeLessThan(1);
    expect(late[0]?.progress).toBe(1);
  });

  it("distributes untimed lyric lines across the track before estimating words", () => {
    expect(estimateUntimedLyricsTiming("短句\nThis is longer", 9_000)).toEqual([
      { startMs: 0, endMs: 1_286, text: "短句" },
      { startMs: 1_286, endMs: 9_000, text: "This is longer" },
    ]);
  });

  it("parses untimed lyrics and derives exactly one current timed line", () => {
    expect(parseUntimedLyrics("[ar:Koradio]\nSoft light\n\nStay here")).toEqual([
      "Soft light",
      "Stay here",
    ]);
    const displayed = deriveTimedText(
      [
        { startMs: 1_000, endMs: 2_000, text: "One" },
        { startMs: 2_000, endMs: 3_000, text: "Two" },
        { startMs: 3_000, endMs: 4_000, text: "Three" },
      ],
      2_500,
    );
    expect(displayed.map((line) => line.state)).toEqual(["read", "current", "upcoming"]);
    expect(deriveTimedText(displayed, 500)[0]?.state).toBe("current");
    expect(deriveTimedText(displayed, 9_000).map((line) => line.state)).toEqual([
      "read",
      "read",
      "read",
    ]);
  });

  it("derives clamped whole-program progress from the canonical timeline", () => {
    const timeline: PlaybackTimelineItem[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        kind: "track",
        position: 0,
        trackId: "00000000-0000-4000-8000-000000000002",
        resolvedAudioRef: "https://media.example.test/one.mp3",
        durationMs: 10_000,
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        kind: "dj",
        position: 1,
        segmentId: "00000000-0000-4000-8000-000000000004",
        audioRef: "tts/segment.wav",
        durationMs: 5_000,
      },
      {
        id: "00000000-0000-4000-8000-000000000005",
        kind: "track",
        position: 2,
        trackId: "00000000-0000-4000-8000-000000000006",
        resolvedAudioRef: "https://media.example.test/two.mp3",
        durationMs: 15_000,
      },
    ];
    expect(programProgress(timeline, 1, 2_500)).toBeCloseTo(12_500 / 30_000);
    expect(programProgress(timeline, 99, 99_000)).toBe(1);
    expect(programProgress([], 0, 0)).toBe(0);
  });
});
