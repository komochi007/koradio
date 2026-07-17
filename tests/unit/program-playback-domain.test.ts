import { programDetailSchema } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  ProgramPolicyError,
  assertProgramCommit,
  resolveProgramStatus,
} from "../../apps/server/src/modules/programs/domain/program.js";
import {
  PlaybackPolicyError,
  assertCheckpointWrite,
} from "../../apps/server/src/modules/playback/domain/checkpoint.js";
import {
  checkpoint,
  ids,
  programDetail,
  trackTimelineItem,
} from "../contract/v1-contract-fixtures.js";

const validProgramDetail = programDetailSchema.parse(programDetail);
const introSegment = validProgramDetail.djScripts[0];
const introTimelineItem = validProgramDetail.timeline[0];
const trackTimeline = validProgramDetail.timeline[1];
if (introSegment === undefined || introTimelineItem === undefined || trackTimeline === undefined) {
  throw new Error("Program fixture is incomplete");
}

describe("Programs domain policy", () => {
  it("accepts an ordered program and rejects text-only DJ timeline items", () => {
    expect(() => {
      assertProgramCommit(validProgramDetail);
    }).not.toThrow();

    expect(() => {
      assertProgramCommit({
        ...validProgramDetail,
        djScripts: [{ ...introSegment, ttsAudioRef: null }],
      });
    }).toThrow(ProgramPolicyError);
  });

  it("requires an intro and exact track/timeline order", () => {
    expect(() => {
      assertProgramCommit({
        ...validProgramDetail,
        djScripts: [{ ...introSegment, type: "segue" }],
      });
    }).toThrow("PROGRAM_DJ_SEGMENTS_INVALID");

    expect(() => {
      assertProgramCommit({
        ...validProgramDetail,
        program: { ...validProgramDetail.program, trackIds: [ids.trackTwo] },
      });
    }).toThrow("PROGRAM_TRACKS_INVALID");

    expect(() => {
      assertProgramCommit({
        ...validProgramDetail,
        timeline: [
          { ...trackTimeline, position: 0 },
          { ...introTimelineItem, position: 2 },
        ],
      });
    }).toThrow("PROGRAM_TIMELINE_INVALID");
  });

  it("only advances ready programs to completed", () => {
    expect(resolveProgramStatus("ready", "paused")).toBe("ready");
    expect(resolveProgramStatus("ready", "completed")).toBe("completed");
    expect(resolveProgramStatus("completed", "playing")).toBe("completed");
  });
});

describe("Playback checkpoint policy", () => {
  const command = {
    profileId: checkpoint.profileId,
    programId: checkpoint.programId,
    timelineItemId: checkpoint.timelineItemId,
    positionMs: checkpoint.positionMs,
    volume: checkpoint.volume,
    status: checkpoint.status,
    leaseEpoch: 4,
  };

  it("accepts bounded checkpoints and fences stale lease epochs", () => {
    expect(() => {
      assertCheckpointWrite({
        command,
        lastTimelineItemId: ids.timelineTrack,
        latestLeaseEpoch: 4,
        profileId: ids.profile,
        programId: ids.program,
        timelineItem: trackTimelineItem,
      });
    }).not.toThrow();

    expect(() => {
      assertCheckpointWrite({
        command: { ...command, leaseEpoch: 3 },
        lastTimelineItemId: ids.timelineTrack,
        latestLeaseEpoch: 4,
        profileId: ids.profile,
        programId: ids.program,
        timelineItem: trackTimelineItem,
      });
    }).toThrow("PLAYBACK_LEASE_STALE");
  });

  it("rejects ownership, position and premature completion mismatches", () => {
    const base = {
      command,
      lastTimelineItemId: ids.timelineTrack,
      latestLeaseEpoch: null,
      profileId: ids.profile,
      programId: ids.program,
      timelineItem: trackTimelineItem,
    };

    expect(() => {
      assertCheckpointWrite({
        ...base,
        command: { ...command, profileId: "99999999-9999-4999-8999-999999999999" },
      });
    }).toThrow(PlaybackPolicyError);
    expect(() => {
      assertCheckpointWrite({
        ...base,
        command: { ...command, positionMs: trackTimelineItem.durationMs + 1 },
      });
    }).toThrow("PLAYBACK_CHECKPOINT_POSITION_INVALID");
    expect(() => {
      assertCheckpointWrite({
        ...base,
        command: {
          ...command,
          status: "completed",
          positionMs: trackTimelineItem.durationMs - 1,
        },
      });
    }).toThrow("PLAYBACK_CHECKPOINT_COMPLETION_INVALID");
  });

  it("only accepts completion at the end of the final timeline item", () => {
    expect(() => {
      assertCheckpointWrite({
        command: {
          ...command,
          status: "completed",
          positionMs: trackTimelineItem.durationMs,
        },
        lastTimelineItemId: ids.timelineTrack,
        latestLeaseEpoch: 4,
        profileId: ids.profile,
        programId: ids.program,
        timelineItem: trackTimelineItem,
      });
    }).not.toThrow();
  });
});
