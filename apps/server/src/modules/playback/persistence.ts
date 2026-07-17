import type { DatabaseSync } from "node:sqlite";

import {
  playbackCheckpointSchema,
  playbackTimelineItemSchema,
  type PlaybackCheckpoint,
  type PlaybackTimelineItem,
} from "@koradio/contracts";

export class PlaybackDataError extends Error {
  constructor() {
    super("Playback data could not be read or written");
    this.name = "PlaybackDataError";
  }
}

interface TimelineRow {
  audio_ref: string;
  duration_ms: number;
  id: string;
  kind: "dj" | "track";
  position: number;
  program_id: string;
  segment_id: string | null;
  track_id: string | null;
}

interface CheckpointRow {
  lease_epoch: number;
  position_ms: number;
  profile_id: string;
  program_id: string;
  saved_at: string;
  status: "playing" | "paused" | "completed" | "failed";
  timeline_item_id: string;
  volume: number;
}

export interface StoredCheckpoint {
  checkpoint: PlaybackCheckpoint;
  leaseEpoch: number;
}

export interface PlaybackRepository {
  findCheckpoint(profileId: string): StoredCheckpoint | null;
  findTimelineItem(programId: string, timelineItemId: string): PlaybackTimelineItem | null;
  getTimeline(programId: string): PlaybackTimelineItem[];
  insertTimeline(programId: string, items: PlaybackTimelineItem[]): void;
  saveCheckpoint(checkpoint: PlaybackCheckpoint, leaseEpoch: number): void;
}

function mapTimeline(row: TimelineRow): PlaybackTimelineItem {
  const candidate =
    row.kind === "dj"
      ? {
          id: row.id,
          kind: row.kind,
          position: row.position,
          segmentId: row.segment_id,
          audioRef: row.audio_ref,
          durationMs: row.duration_ms,
        }
      : {
          id: row.id,
          kind: row.kind,
          position: row.position,
          trackId: row.track_id,
          resolvedAudioRef: row.audio_ref,
          durationMs: row.duration_ms,
        };
  const parsed = playbackTimelineItemSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new PlaybackDataError();
  }
  return parsed.data;
}

function mapCheckpoint(row: CheckpointRow): StoredCheckpoint {
  const parsed = playbackCheckpointSchema.safeParse({
    profileId: row.profile_id,
    programId: row.program_id,
    timelineItemId: row.timeline_item_id,
    positionMs: row.position_ms,
    volume: row.volume,
    status: row.status,
    savedAt: row.saved_at,
  });
  if (!parsed.success || !Number.isSafeInteger(row.lease_epoch) || row.lease_epoch < 0) {
    throw new PlaybackDataError();
  }
  return { checkpoint: parsed.data, leaseEpoch: row.lease_epoch };
}

export function createPlaybackRepository(client: DatabaseSync): PlaybackRepository {
  const findCheckpoint = client.prepare("SELECT * FROM playback_checkpoint WHERE profile_id = ?");
  const findTimelineItem = client.prepare(`
    SELECT * FROM playback_timeline_item WHERE program_id = ? AND id = ?
  `);
  const listTimeline = client.prepare(`
    SELECT * FROM playback_timeline_item WHERE program_id = ? ORDER BY position ASC
  `);
  const insertTimelineItem = client.prepare(`
    INSERT INTO playback_timeline_item (
      id, program_id, position, kind, segment_id, track_id, audio_ref, duration_ms
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertCheckpoint = client.prepare(`
    INSERT INTO playback_checkpoint (
      profile_id, program_id, timeline_item_id, position_ms, volume, status, lease_epoch, saved_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      program_id = excluded.program_id,
      timeline_item_id = excluded.timeline_item_id,
      position_ms = excluded.position_ms,
      volume = excluded.volume,
      status = excluded.status,
      lease_epoch = excluded.lease_epoch,
      saved_at = excluded.saved_at
  `);

  return {
    findCheckpoint(profileId) {
      const row = findCheckpoint.get(profileId) as unknown as CheckpointRow | undefined;
      return row === undefined ? null : mapCheckpoint(row);
    },
    findTimelineItem(programId, timelineItemId) {
      const row = findTimelineItem.get(programId, timelineItemId) as unknown as
        TimelineRow | undefined;
      return row === undefined ? null : mapTimeline(row);
    },
    getTimeline(programId) {
      return (listTimeline.all(programId) as unknown as TimelineRow[]).map(mapTimeline);
    },
    insertTimeline(programId, items) {
      for (const item of items) {
        insertTimelineItem.run(
          item.id,
          programId,
          item.position,
          item.kind,
          item.kind === "dj" ? item.segmentId : null,
          item.kind === "track" ? item.trackId : null,
          item.kind === "dj" ? item.audioRef : item.resolvedAudioRef,
          item.durationMs,
        );
      }
    },
    saveCheckpoint(checkpoint, leaseEpoch) {
      upsertCheckpoint.run(
        checkpoint.profileId,
        checkpoint.programId,
        checkpoint.timelineItemId,
        checkpoint.positionMs,
        checkpoint.volume,
        checkpoint.status,
        leaseEpoch,
        checkpoint.savedAt,
      );
    },
  };
}
