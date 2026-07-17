import type { PlaybackTimelineItem, SavePlaybackCheckpointCommand } from "@koradio/contracts";

export type PlaybackPolicyErrorCode =
  | "PLAYBACK_CHECKPOINT_COMPLETION_INVALID"
  | "PLAYBACK_CHECKPOINT_POSITION_INVALID"
  | "PLAYBACK_CHECKPOINT_TARGET_INVALID"
  | "PLAYBACK_LEASE_STALE";

export class PlaybackPolicyError extends Error {
  readonly code: PlaybackPolicyErrorCode;

  constructor(code: PlaybackPolicyErrorCode) {
    super(code);
    this.name = "PlaybackPolicyError";
    this.code = code;
  }
}

export interface CheckpointPolicyInput {
  command: SavePlaybackCheckpointCommand;
  lastTimelineItemId: string;
  latestLeaseEpoch: number | null;
  profileId: string;
  programId: string;
  timelineItem: PlaybackTimelineItem;
}

export function assertCheckpointWrite(input: CheckpointPolicyInput): void {
  if (
    input.command.profileId !== input.profileId ||
    input.command.programId !== input.programId ||
    input.command.timelineItemId !== input.timelineItem.id
  ) {
    throw new PlaybackPolicyError("PLAYBACK_CHECKPOINT_TARGET_INVALID");
  }
  if (input.command.positionMs > input.timelineItem.durationMs) {
    throw new PlaybackPolicyError("PLAYBACK_CHECKPOINT_POSITION_INVALID");
  }
  if (input.latestLeaseEpoch !== null && input.command.leaseEpoch < input.latestLeaseEpoch) {
    throw new PlaybackPolicyError("PLAYBACK_LEASE_STALE");
  }
  if (
    input.command.status === "completed" &&
    (input.timelineItem.id !== input.lastTimelineItemId ||
      input.command.positionMs !== input.timelineItem.durationMs)
  ) {
    throw new PlaybackPolicyError("PLAYBACK_CHECKPOINT_COMPLETION_INVALID");
  }
}
