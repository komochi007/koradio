import type { PlaybackTimelineItem } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  deriveTimedText,
  estimateDjTiming,
  parseLrc,
  parseUntimedLyrics,
  programProgress,
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
      ],
      2_500,
    );
    expect(displayed.map((line) => line.state)).toEqual(["read", "current", "upcoming"]);
    expect(deriveTimedText(displayed, 500)[0]?.state).toBe("current");
    expect(deriveTimedText(displayed, 9_000)[2]?.state).toBe("current");
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
