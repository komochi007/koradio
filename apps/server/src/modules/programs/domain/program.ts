import type { PlaybackCheckpoint, Program, ProgramDetail } from "@koradio/contracts";

export type ProgramPolicyErrorCode =
  | "PROGRAM_DJ_SEGMENTS_INVALID"
  | "PROGRAM_STATUS_INVALID"
  | "PROGRAM_TIMELINE_INVALID"
  | "PROGRAM_TRACKS_INVALID";

export class ProgramPolicyError extends Error {
  readonly code: ProgramPolicyErrorCode;

  constructor(code: ProgramPolicyErrorCode) {
    super(code);
    this.name = "ProgramPolicyError";
    this.code = code;
  }
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function assertProgramCommit(detail: ProgramDetail): void {
  if (detail.program.status !== "ready") {
    throw new ProgramPolicyError("PROGRAM_STATUS_INVALID");
  }

  const segmentIds = new Set<string>();
  const segmentsById = new Map(detail.djScripts.map((segment) => [segment.id, segment]));
  for (const segment of detail.djScripts) {
    if (segment.programId !== detail.program.id || segmentIds.has(segment.id)) {
      throw new ProgramPolicyError("PROGRAM_DJ_SEGMENTS_INVALID");
    }
    segmentIds.add(segment.id);
  }
  if (!detail.djScripts.some((segment) => segment.type === "intro")) {
    throw new ProgramPolicyError("PROGRAM_DJ_SEGMENTS_INVALID");
  }

  if (
    !arraysEqual(
      detail.program.trackIds,
      detail.tracks.map((track) => track.id),
    )
  ) {
    throw new ProgramPolicyError("PROGRAM_TRACKS_INVALID");
  }

  const timelineIds = new Set<string>();
  const audioSegmentIds: string[] = [];
  const timelineTrackIds: string[] = [];
  for (const [index, item] of detail.timeline.entries()) {
    if (item.position !== index || timelineIds.has(item.id)) {
      throw new ProgramPolicyError("PROGRAM_TIMELINE_INVALID");
    }
    timelineIds.add(item.id);

    if (item.kind === "track") {
      timelineTrackIds.push(item.trackId);
      continue;
    }

    const segment = segmentsById.get(item.segmentId);
    if (segment?.ttsAudioRef === null || segment?.ttsAudioRef !== item.audioRef) {
      throw new ProgramPolicyError("PROGRAM_TIMELINE_INVALID");
    }
    audioSegmentIds.push(item.segmentId);
  }

  if (!arraysEqual(detail.program.trackIds, timelineTrackIds)) {
    throw new ProgramPolicyError("PROGRAM_TIMELINE_INVALID");
  }

  const expectedAudioSegmentIds = detail.djScripts
    .filter((segment) => segment.ttsAudioRef !== null)
    .map((segment) => segment.id);
  if (
    expectedAudioSegmentIds.length !== audioSegmentIds.length ||
    expectedAudioSegmentIds.some((segmentId) => !audioSegmentIds.includes(segmentId))
  ) {
    throw new ProgramPolicyError("PROGRAM_TIMELINE_INVALID");
  }
}

export function resolveProgramStatus(
  current: Program["status"],
  checkpointStatus: PlaybackCheckpoint["status"],
): Program["status"] {
  return current === "completed" || checkpointStatus === "completed" ? "completed" : "ready";
}
