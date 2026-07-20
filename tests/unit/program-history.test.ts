import type { Program, ProgramDetail } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  formatClockDuration,
  formatProgramDuration,
  programDurationMs,
  programHistorySummary,
} from "../../apps/web/src/features/programs/program-history.js";

const profileId = "00000000-0000-4000-8000-000000000010";

function program(id: string, createdAt: string, trackIds: string[]): Program {
  return {
    id,
    profileId,
    scenarioText: "夜晚写作",
    title: "After Hours",
    status: "ready",
    trackIds,
    createdAt,
  };
}

function detail(value: Program, durations: number[]): ProgramDetail {
  return {
    program: value,
    djScripts: [
      {
        id: "00000000-0000-4000-8000-000000000090",
        programId: value.id,
        type: "intro",
        language: "zh-CN",
        text: "慢一点开始。",
        displayText: "慢一点开始。",
        estimatedTiming: true,
        ttsAudioRef: null,
      },
    ],
    tracks: [],
    timeline: durations.map((durationMs, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      kind: "track" as const,
      position: index,
      trackId: value.trackIds[index] ?? value.trackIds[0] ?? "00000000-0000-4000-8000-000000000001",
      resolvedAudioRef: `https://media.example.test/${String(index)}.mp3`,
      durationMs,
    })),
  };
}

describe("S5-03 program history presentation", () => {
  it("formats timeline durations consistently", () => {
    const value = program("00000000-0000-4000-8000-000000000020", "2026-07-20T08:00:00.000Z", [
      "00000000-0000-4000-8000-000000000030",
    ]);
    const snapshot = detail(value, [90_000, 30_000]);
    expect(programDurationMs(snapshot)).toBe(120_000);
    expect(formatProgramDuration(120_000)).toBe("2 MIN");
    expect(formatProgramDuration(3_900_000)).toBe("1 HR 5 MIN");
    expect(formatClockDuration(125_000)).toBe("02:05");
  });

  it("summarizes the loaded seven-day window without counting older programs", () => {
    const recent = program("00000000-0000-4000-8000-000000000020", "2026-07-20T08:00:00.000Z", [
      "00000000-0000-4000-8000-000000000030",
      "00000000-0000-4000-8000-000000000031",
    ]);
    const yesterday = program("00000000-0000-4000-8000-000000000021", "2026-07-19T08:00:00.000Z", [
      "00000000-0000-4000-8000-000000000030",
    ]);
    const older = program("00000000-0000-4000-8000-000000000022", "2026-07-01T08:00:00.000Z", [
      "00000000-0000-4000-8000-000000000032",
    ]);
    const details = new Map([
      [recent.id, detail(recent, [60_000, 120_000])],
      [yesterday.id, detail(yesterday, [90_000])],
      [older.id, detail(older, [900_000])],
    ]);
    expect(
      programHistorySummary([recent, yesterday, older], details, new Date("2026-07-20T12:00:00")),
    ).toEqual({
      dayCounts: [0, 0, 0, 0, 0, 1, 1],
      durationMs: 270_000,
      programCount: 2,
      trackCount: 2,
    });
  });
});
