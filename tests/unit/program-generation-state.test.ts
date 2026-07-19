import type { ProgramDetail, V1Event } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  initialProgramGenerationState,
  reduceProgramGeneration,
} from "../../apps/web/src/features/programs/generation-state.js";

const profileId = "00000000-0000-4000-8000-000000000101";
const jobId = "00000000-0000-4000-8000-000000000102";

function program(id: string, title: string): ProgramDetail {
  const trackId = "00000000-0000-4000-8000-000000000104";
  return {
    program: {
      id,
      profileId,
      scenarioText: "夜晚写作",
      title,
      status: "ready",
      trackIds: [trackId],
      createdAt: "2026-07-19T12:00:00.000Z",
    },
    djScripts: [
      {
        id: "00000000-0000-4000-8000-000000000105",
        programId: id,
        type: "intro",
        language: "zh-CN",
        text: "先让房间慢下来。",
        displayText: "先让房间慢下来。",
        estimatedTiming: true,
        ttsAudioRef: null,
      },
    ],
    tracks: [
      {
        id: trackId,
        source: "netease",
        sourceTrackId: "fixture-track",
        title: "If",
        artist: "Bread",
        album: "Manna",
        durationMs: 155_000,
        lyricStatus: "available",
      },
    ],
    timeline: [
      {
        id: "00000000-0000-4000-8000-000000000106",
        kind: "track",
        position: 0,
        trackId,
        resolvedAudioRef: "https://media.example.test/if.mp3",
        durationMs: 155_000,
      },
    ],
  };
}

function event(
  eventType: "generation.planned" | "generation.tracks-resolved",
  sequence: number,
): V1Event {
  const envelope = {
    eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    eventType,
    version: 1 as const,
    profileId,
    correlationId: jobId,
    sequence,
    occurredAt: "2026-07-19T12:00:00.000Z",
  };
  return eventType === "generation.planned"
    ? { ...envelope, eventType, payload: { jobId } }
    : { ...envelope, eventType, payload: { jobId, trackCount: 4 } };
}

describe("Radio program generation state", () => {
  it("preserves the old program while generating and after a failed snapshot", () => {
    const oldProgram = program("00000000-0000-4000-8000-000000000103", "Old Session");
    let state = reduceProgramGeneration(initialProgramGenerationState, {
      type: "program.loaded",
      program: oldProgram,
    });
    state = reduceProgramGeneration(state, {
      type: "generation.accepted",
      jobId,
      scenarioText: "雨夜读书",
    });
    expect(state.program).toBe(oldProgram);

    const runningSnapshot = {
      jobId,
      profileId,
      status: "running" as const,
      stage: "planning" as const,
      sequence: 2,
      createdAt: "2026-07-19T12:00:00.000Z",
      updatedAt: "2026-07-19T12:00:01.000Z",
    };
    state = reduceProgramGeneration(state, {
      type: "generation.snapshot",
      snapshot: runningSnapshot,
    });
    expect(
      reduceProgramGeneration(state, {
        type: "generation.snapshot",
        snapshot: runningSnapshot,
      }),
    ).toBe(state);

    state = reduceProgramGeneration(state, {
      type: "generation.snapshot",
      snapshot: {
        jobId,
        profileId,
        status: "failed",
        stage: "planning",
        sequence: 3,
        errorCode: "PROGRAM_GENERATION_PLAN_INVALID",
        createdAt: "2026-07-19T12:00:00.000Z",
        updatedAt: "2026-07-19T12:00:01.000Z",
      },
    });

    expect(state.program).toBe(oldProgram);
    expect(state.active).toBeUndefined();
    expect(state.failure).toEqual({
      code: "PROGRAM_GENERATION_PLAN_INVALID",
      scenarioText: "雨夜读书",
    });
  });

  it("drops out-of-order events and atomically swaps only on program.committed", () => {
    const oldProgram = program("00000000-0000-4000-8000-000000000103", "Old Session");
    const newProgram = program("00000000-0000-4000-8000-000000000107", "New Session");
    let state = reduceProgramGeneration(
      { active: undefined, failure: undefined, program: oldProgram },
      { type: "generation.accepted", jobId, scenarioText: "清晨慢跑" },
    );
    state = reduceProgramGeneration(state, {
      type: "generation.event",
      event: event("generation.tracks-resolved", 3),
      profileId,
    });
    state = reduceProgramGeneration(state, {
      type: "generation.event",
      event: event("generation.planned", 2),
      profileId,
    });
    expect(state.active?.stage).toBe("resolving_tracks");
    expect(state.active?.sequence).toBe(3);
    expect(state.program).toBe(oldProgram);

    state = reduceProgramGeneration(state, {
      type: "generation.event",
      profileId,
      event: {
        eventId: "00000000-0000-4000-8000-000000000108",
        eventType: "program.committed",
        version: 1,
        profileId,
        correlationId: jobId,
        sequence: 5,
        occurredAt: "2026-07-19T12:00:03.000Z",
        payload: newProgram,
      },
    });

    expect(state.active).toBeUndefined();
    expect(state.program).toBe(newProgram);
  });
});
