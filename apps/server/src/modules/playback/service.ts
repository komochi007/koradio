import type { DatabaseSync } from "node:sqlite";

import {
  playbackCheckpointSchema,
  type PlaybackCheckpoint,
  type PlaybackTimelineItem,
  type Program,
  type SavePlaybackCheckpointCommand,
} from "@koradio/contracts";

import { PlaybackPolicyError, assertCheckpointWrite } from "./domain/checkpoint.js";
import type { PlaybackRepository } from "./persistence.js";

export class PlaybackTargetNotFoundError extends Error {
  constructor() {
    super("Playback target was not found");
    this.name = "PlaybackTargetNotFoundError";
  }
}

export class PlaybackWriteError extends Error {
  constructor() {
    super("Playback checkpoint could not be stored");
    this.name = "PlaybackWriteError";
  }
}

export interface PlaybackProgramOwner {
  completeProgram(profileId: string, programId: string): boolean;
  findProgram(profileId: string, programId: string): Program | null;
}

export interface PlaybackTimelineService {
  get(programId: string): PlaybackTimelineItem[];
  insert(programId: string, items: PlaybackTimelineItem[]): void;
}

export interface PlaybackCheckpointService {
  get(profileId: string): PlaybackCheckpoint | null;
  save(profileId: string, command: SavePlaybackCheckpointCommand): PlaybackCheckpoint;
}

export function createPlaybackTimelineService(
  repository: PlaybackRepository,
): PlaybackTimelineService {
  return {
    get(programId) {
      return repository.getTimeline(programId);
    },
    insert(programId, items) {
      repository.insertTimeline(programId, items);
    },
  };
}

export interface CreatePlaybackCheckpointServiceOptions {
  client: DatabaseSync;
  now?: () => Date;
  programs: PlaybackProgramOwner;
  repository: PlaybackRepository;
}

export function createPlaybackCheckpointService(
  options: CreatePlaybackCheckpointServiceOptions,
): PlaybackCheckpointService {
  const now = options.now ?? (() => new Date());

  return {
    get(profileId) {
      return options.repository.findCheckpoint(profileId)?.checkpoint ?? null;
    },
    save(profileId, command) {
      options.client.exec("BEGIN IMMEDIATE");
      try {
        const program = options.programs.findProgram(profileId, command.programId);
        const timeline = options.repository.getTimeline(command.programId);
        const timelineItem = options.repository.findTimelineItem(
          command.programId,
          command.timelineItemId,
        );
        const lastTimelineItem = timeline.at(-1);
        if (program === null || timelineItem === null || lastTimelineItem === undefined) {
          throw new PlaybackTargetNotFoundError();
        }
        const existing = options.repository.findCheckpoint(profileId);
        assertCheckpointWrite({
          command,
          lastTimelineItemId: lastTimelineItem.id,
          latestLeaseEpoch: existing?.leaseEpoch ?? null,
          profileId,
          programId: program.id,
          timelineItem,
        });
        const checkpoint = playbackCheckpointSchema.parse({
          profileId,
          programId: command.programId,
          timelineItemId: command.timelineItemId,
          positionMs: command.positionMs,
          volume: command.volume,
          status: command.status,
          savedAt: now().toISOString(),
        });
        options.repository.saveCheckpoint(checkpoint, command.leaseEpoch);
        if (
          command.status === "completed" &&
          !options.programs.completeProgram(profileId, command.programId)
        ) {
          throw new PlaybackTargetNotFoundError();
        }
        options.client.exec("COMMIT");
        return checkpoint;
      } catch (error) {
        options.client.exec("ROLLBACK");
        if (error instanceof PlaybackPolicyError || error instanceof PlaybackTargetNotFoundError) {
          throw error;
        }
        throw new PlaybackWriteError();
      }
    },
  };
}
