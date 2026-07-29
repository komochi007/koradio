import type { PlaybackTimelineItem } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  deriveTimedText,
  estimateDjTiming,
  estimateTokenTiming,
  estimateUntimedLyrics,
  parseLrc,
  parseUntimedLyrics,
  programProgress,
  splitDjSentences,
  timedLinesFromMarkers,
  tokenizeTimedText,
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
      parseLrc("[ar:Koradio]\n[00:04.50]Second line\n[00:01.250][00:02.00]First line", 8_000).map(
        ({ endMs, startMs, text }) => ({ endMs, startMs, text }),
      ),
    ).toEqual([
      { startMs: 1_250, endMs: 2_000, text: "First line" },
      { startMs: 2_000, endMs: 4_500, text: "First line" },
      { startMs: 4_500, endMs: 8_000, text: "Second line" },
    ]);
  });

  it("keeps untimed lyrics static and derives exactly one current timed line", () => {
    expect(parseUntimedLyrics("[ar:Koradio]\nSoft light\n\nStay here")).toEqual([
      "Soft light",
      "Stay here",
    ]);
    const displayed = deriveTimedText(
      [
        { startMs: 1_000, endMs: 2_000, text: "One" },
        { startMs: 2_000, endMs: 3_000, text: "Two" },
        { startMs: 3_000, endMs: 4_000, text: "Three" },
      ].map((line) => ({
        ...line,
        tokens: estimateTokenTiming(line.text, line.startMs, line.endMs),
      })),
      2_500,
    );
    expect(displayed.map((line) => line.state)).toEqual(["read", "current", "upcoming"]);
    expect(displayed[1]?.tokens.map((token) => token.state)).toContain("current");
    expect(deriveTimedText(displayed, 500)[0]?.state).toBe("current");
    expect(deriveTimedText(displayed, 9_000)[2]?.state).toBe("current");
  });

  it("tokenizes CJK by grapheme, keeps Latin words together and attaches punctuation", () => {
    expect(tokenizeTimedText("你好， warm groove!")).toEqual(["你", "好，", " warm", " groove!"]);
    const tokens = estimateTokenTiming("你好， warm groove!", 1_000, 5_000);
    expect(tokens[0]).toMatchObject({ text: "你", startMs: 1_000 });
    expect(tokens.at(-1)).toMatchObject({ text: " groove!", endMs: 5_000 });
    expect(tokens.every((token) => token.endMs > token.startMs)).toBe(true);
  });

  it("uses exact markers when available and estimates untimed lyrics across the track", () => {
    const exact = timedLinesFromMarkers(
      "先听。再走。",
      [
        { text: "先", startMs: 0, endMs: 500 },
        { text: "听。", startMs: 500, endMs: 1_000 },
        { text: "再", startMs: 1_000, endMs: 1_500 },
        { text: "走。", startMs: 1_500, endMs: 2_000 },
      ],
      9_000,
    );
    expect(exact).toHaveLength(2);
    expect(exact[0]).toMatchObject({ text: "先听。", startMs: 0, endMs: 1_000 });

    const estimated = estimateUntimedLyrics("Soft light\nStay here", 8_000);
    expect(estimated).toHaveLength(2);
    expect(estimated[0]?.startMs).toBe(0);
    expect(estimated.at(-1)?.endMs).toBe(8_000);
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
