import type { DatabaseSync } from "node:sqlite";

import {
  dailyMixDetailSchema,
  dailyMixGenerationSnapshotSchema,
  dailyMixListResponseSchema,
  dailyMixSchema,
  dailyMixPlaybackCheckpointSchema,
  playbackSourceSessionSchema,
  type DailyMix,
  type DailyMixDetail,
  type DailyMixGenerationSnapshot,
  type DailyMixListResponse,
  type DailyMixPlaybackCheckpoint,
  type PlaybackSourceSession,
  type DailyMixTrackBucket,
  type MusicTrack,
} from "@koradio/contracts";

interface DailyMixRow {
  id: string;
  profile_id: string;
  local_date: string;
  status: DailyMixGenerationSnapshot["status"];
  stage: DailyMixGenerationSnapshot["stage"];
  attempt_count: number;
  error_code: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyMixTrackRow {
  position: number;
  track_id: string;
  bucket: DailyMixTrackBucket;
}

export class DailyMixDataError extends Error {}
export class DailyMixNotFoundError extends Error {}

export interface DailyMixTrackReader {
  getTracks(trackIds: string[]): MusicTrack[];
}

export interface DailyMixRepository {
  commit(
    id: string,
    tracks: Array<{ trackId: string; bucket: DailyMixTrackBucket }>,
    now: string,
  ): void;
  create(id: string, profileId: string, localDate: string, now: string): DailyMixGenerationSnapshot;
  fail(id: string, code: string, now: string): void;
  find(profileId: string, id: string): DailyMixRow | null;
  findToday(profileId: string, localDate: string): DailyMixRow | null;
  findCheckpoint(
    profileId: string,
  ): { checkpoint: DailyMixPlaybackCheckpoint; leaseEpoch: number } | null;
  findSourceSession(profileId: string): PlaybackSourceSession | null;
  getSnapshot(profileId: string, id: string): DailyMixGenerationSnapshot | null;
  list(profileId: string, minimumDate: string): DailyMixListResponse;
  markRunning(id: string, now: string): void;
  prune(profileId: string, minimumDate: string): void;
  recentTrackIds(profileId: string, minimumDate: string): string[];
  recoverInterrupted(now: string): void;
  resetForRetry(id: string, now: string): DailyMixGenerationSnapshot;
  saveCheckpoint(checkpoint: DailyMixPlaybackCheckpoint, leaseEpoch: number): void;
  setStage(id: string, stage: DailyMixGenerationSnapshot["stage"], now: string): void;
  tracks(id: string): DailyMixTrackRow[];
  upsertSourceSession(
    profileId: string,
    activeKind: "program" | "daily",
    programId: string | null,
    dailyMixId: string | null,
    now: string,
  ): PlaybackSourceSession;
}

function mapSnapshot(row: DailyMixRow): DailyMixGenerationSnapshot {
  return dailyMixGenerationSnapshotSchema.parse({
    jobId: row.id,
    profileId: row.profile_id,
    localDate: row.local_date,
    status: row.status,
    stage: row.stage,
    attemptCount: row.attempt_count,
    ...(row.status === "succeeded" ? { dailyMixId: row.id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
  });
}

function mapMix(row: DailyMixRow, trackIds: string[]): DailyMix {
  return dailyMixSchema.parse({
    id: row.id,
    profileId: row.profile_id,
    localDate: row.local_date,
    trackIds,
    generatedAt: row.generated_at,
  });
}

export function createDailyMixRepository(client: DatabaseSync): DailyMixRepository {
  const byId = client.prepare("SELECT * FROM daily_mix WHERE profile_id = ? AND id = ?");
  const byDate = client.prepare("SELECT * FROM daily_mix WHERE profile_id = ? AND local_date = ?");
  const insert = client.prepare(`
    INSERT INTO daily_mix (
      id, profile_id, local_date, status, stage, attempt_count, created_at, updated_at
    ) VALUES (?, ?, ?, 'queued', 'queued', 1, ?, ?)
  `);
  const markRunning = client.prepare(`
    UPDATE daily_mix SET status = 'running', stage = 'planning', error_code = NULL, updated_at = ?
    WHERE id = ? AND status = 'queued'
  `);
  const setStage = client.prepare(`
    UPDATE daily_mix SET stage = ?, updated_at = ? WHERE id = ? AND status = 'running'
  `);
  const insertTrack = client.prepare(`
    INSERT INTO daily_mix_track (daily_mix_id, position, track_id, bucket) VALUES (?, ?, ?, ?)
  `);
  const succeed = client.prepare(`
    UPDATE daily_mix SET status = 'succeeded', stage = 'completed', error_code = NULL,
      generated_at = ?, updated_at = ? WHERE id = ? AND status = 'running'
  `);
  const fail = client.prepare(`
    UPDATE daily_mix SET status = 'failed', error_code = ?, updated_at = ?
    WHERE id = ? AND status IN ('queued', 'running')
  `);
  const retry = client.prepare(`
    UPDATE daily_mix SET status = 'queued', stage = 'queued', attempt_count = attempt_count + 1,
      error_code = NULL, generated_at = NULL, updated_at = ? WHERE id = ? AND status = 'failed'
  `);
  const rows = client.prepare(`
    SELECT * FROM daily_mix
    WHERE profile_id = ? AND status = 'succeeded' AND local_date >= ?
    ORDER BY local_date DESC, id DESC
  `);
  const trackRows = client.prepare(`
    SELECT position, track_id, bucket FROM daily_mix_track
    WHERE daily_mix_id = ? ORDER BY position ASC
  `);
  const recentTracks = client.prepare(`
    SELECT DISTINCT dmt.track_id
    FROM daily_mix dm
    JOIN daily_mix_track dmt ON dmt.daily_mix_id = dm.id
    WHERE dm.profile_id = ? AND dm.status = 'succeeded' AND dm.local_date >= ?
  `);
  const oldIds = client.prepare("SELECT id FROM daily_mix WHERE profile_id = ? AND local_date < ?");
  const deleteCheckpoint = client.prepare(
    "DELETE FROM daily_mix_checkpoint WHERE daily_mix_id = ?",
  );
  const clearSession = client.prepare(`
    UPDATE playback_source_session SET daily_mix_id = NULL, active_kind = 'program'
    WHERE daily_mix_id = ? AND program_id IS NOT NULL
  `);
  const deleteSession = client.prepare(`
    DELETE FROM playback_source_session WHERE daily_mix_id = ? AND program_id IS NULL
  `);
  const deleteTracks = client.prepare("DELETE FROM daily_mix_track WHERE daily_mix_id = ?");
  const deleteMix = client.prepare("DELETE FROM daily_mix WHERE id = ?");
  const recover = client.prepare(`
    UPDATE daily_mix SET status = 'failed', error_code = 'DAILY_MIX_GENERATION_INTERRUPTED', updated_at = ?
    WHERE status IN ('queued', 'running')
  `);
  const findCheckpoint = client.prepare("SELECT * FROM daily_mix_checkpoint WHERE profile_id = ?");
  const upsertCheckpoint = client.prepare(`
    INSERT INTO daily_mix_checkpoint (
      profile_id, daily_mix_id, track_id, position, position_ms, volume, status, lease_epoch, saved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      daily_mix_id = excluded.daily_mix_id,
      track_id = excluded.track_id,
      position = excluded.position,
      position_ms = excluded.position_ms,
      volume = excluded.volume,
      status = excluded.status,
      lease_epoch = excluded.lease_epoch,
      saved_at = excluded.saved_at
  `);
  const findSourceSession = client.prepare(
    "SELECT * FROM playback_source_session WHERE profile_id = ?",
  );
  const upsertSourceSession = client.prepare(`
    INSERT INTO playback_source_session (
      profile_id, active_kind, program_id, daily_mix_id, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      active_kind = excluded.active_kind,
      program_id = excluded.program_id,
      daily_mix_id = excluded.daily_mix_id,
      updated_at = excluded.updated_at
  `);

  const read = (value: unknown): DailyMixRow | null =>
    value === undefined ? null : (value as DailyMixRow);

  return {
    commit(id, tracks, now) {
      if (tracks.length !== 20) throw new DailyMixDataError();
      tracks.forEach((track, position) =>
        insertTrack.run(id, position, track.trackId, track.bucket),
      );
      if (succeed.run(now, now, id).changes !== 1) throw new DailyMixDataError();
    },
    create(id, profileId, localDate, now) {
      insert.run(id, profileId, localDate, now, now);
      const row = read(byId.get(profileId, id));
      if (row === null) throw new DailyMixDataError();
      return mapSnapshot(row);
    },
    fail(id, code, now) {
      fail.run(code, now, id);
    },
    find(profileId, id) {
      return read(byId.get(profileId, id));
    },
    findToday(profileId, localDate) {
      return read(byDate.get(profileId, localDate));
    },
    findCheckpoint(profileId) {
      const row = findCheckpoint.get(profileId) as
        | {
            daily_mix_id: string;
            lease_epoch: number;
            position: number;
            position_ms: number;
            profile_id: string;
            saved_at: string;
            status: DailyMixPlaybackCheckpoint["status"];
            track_id: string;
            volume: number;
          }
        | undefined;
      if (row === undefined) return null;
      return {
        checkpoint: dailyMixPlaybackCheckpointSchema.parse({
          profileId: row.profile_id,
          dailyMixId: row.daily_mix_id,
          trackId: row.track_id,
          position: row.position,
          positionMs: row.position_ms,
          volume: row.volume,
          status: row.status,
          savedAt: row.saved_at,
        }),
        leaseEpoch: row.lease_epoch,
      };
    },
    findSourceSession(profileId) {
      const row = findSourceSession.get(profileId) as
        | {
            active_kind: "program" | "daily";
            daily_mix_id: string | null;
            profile_id: string;
            program_id: string | null;
            updated_at: string;
          }
        | undefined;
      return row === undefined
        ? null
        : playbackSourceSessionSchema.parse({
            profileId: row.profile_id,
            activeKind: row.active_kind,
            programId: row.program_id,
            dailyMixId: row.daily_mix_id,
            updatedAt: row.updated_at,
          });
    },
    getSnapshot(profileId, id) {
      const row = read(byId.get(profileId, id));
      return row === null ? null : mapSnapshot(row);
    },
    list(profileId, minimumDate) {
      const items = (rows.all(profileId, minimumDate) as unknown as DailyMixRow[]).map((row) =>
        mapMix(
          row,
          (trackRows.all(row.id) as unknown as DailyMixTrackRow[]).map((track) => track.track_id),
        ),
      );
      return dailyMixListResponseSchema.parse({ items });
    },
    markRunning(id, now) {
      if (markRunning.run(now, id).changes !== 1) throw new DailyMixDataError();
    },
    prune(profileId, minimumDate) {
      for (const { id } of oldIds.all(profileId, minimumDate) as Array<{ id: string }>) {
        deleteCheckpoint.run(id);
        clearSession.run(id);
        deleteSession.run(id);
        deleteTracks.run(id);
        deleteMix.run(id);
      }
    },
    recentTrackIds(profileId, minimumDate) {
      return (recentTracks.all(profileId, minimumDate) as Array<{ track_id: string }>).map(
        (row) => row.track_id,
      );
    },
    recoverInterrupted(now) {
      recover.run(now);
    },
    resetForRetry(id, now) {
      if (retry.run(now, id).changes !== 1) throw new DailyMixDataError();
      const row = client.prepare("SELECT * FROM daily_mix WHERE id = ?").get(id) as
        DailyMixRow | undefined;
      if (row === undefined) throw new DailyMixDataError();
      return mapSnapshot(row);
    },
    saveCheckpoint(checkpoint, leaseEpoch) {
      upsertCheckpoint.run(
        checkpoint.profileId,
        checkpoint.dailyMixId,
        checkpoint.trackId,
        checkpoint.position,
        checkpoint.positionMs,
        checkpoint.volume,
        checkpoint.status,
        leaseEpoch,
        checkpoint.savedAt,
      );
    },
    setStage(id, stage, now) {
      if (setStage.run(stage, now, id).changes !== 1) throw new DailyMixDataError();
    },
    tracks(id) {
      return trackRows.all(id) as unknown as DailyMixTrackRow[];
    },
    upsertSourceSession(profileId, activeKind, programId, dailyMixId, now) {
      upsertSourceSession.run(profileId, activeKind, programId, dailyMixId, now);
      const session = findSourceSession.get(profileId);
      if (session === undefined) throw new DailyMixDataError();
      const row = session as {
        active_kind: "program" | "daily";
        daily_mix_id: string | null;
        profile_id: string;
        program_id: string | null;
        updated_at: string;
      };
      return playbackSourceSessionSchema.parse({
        profileId: row.profile_id,
        activeKind: row.active_kind,
        programId: row.program_id,
        dailyMixId: row.daily_mix_id,
        updatedAt: row.updated_at,
      });
    },
  };
}

export function readDailyMixDetail(
  repository: DailyMixRepository,
  tracks: DailyMixTrackReader,
  profileId: string,
  id: string,
): DailyMixDetail {
  const row = repository.find(profileId, id);
  if (row === null || row.status !== "succeeded") throw new DailyMixNotFoundError();
  const relations = repository.tracks(id);
  const trackMap = new Map(
    tracks.getTracks(relations.map((item) => item.track_id)).map((track) => [track.id, track]),
  );
  return dailyMixDetailSchema.parse({
    mix: mapMix(
      row,
      relations.map((item) => item.track_id),
    ),
    tracks: relations.map((item) => ({
      position: item.position,
      bucket: item.bucket,
      track: trackMap.get(item.track_id),
    })),
  });
}
