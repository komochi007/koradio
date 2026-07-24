import { Buffer } from "node:buffer";
import type { DatabaseSync } from "node:sqlite";

import {
  libraryItemSchema,
  libraryListResponseSchema,
  musicTrackSchema,
  playlistImportSnapshotSchema,
  playlistSourceSchema,
  type LibraryItem,
  type LibraryListResponse,
  type MusicTrack,
  type PlaylistImportSnapshot,
  type PlaylistSource,
} from "@koradio/contracts";
import { z } from "zod";

interface MusicTrackRow {
  id: string;
  source: "netease";
  source_track_id: string;
  title: string;
  artist: string;
  album: string;
  artwork_url: string | null;
  duration_ms: number;
  lyric_status: "available" | "untimed" | "unavailable";
  playable: number;
}

interface LibraryItemRow extends MusicTrackRow {
  added_at: string;
  playlist_source_id: string | null;
}

interface PlaylistSourceRow {
  id: string;
  source: "netease";
  source_playlist_id: string;
  title: string;
  available_track_count: number;
  unavailable_track_count: number;
  imported_at: string;
}

interface PlaylistImportJobRow {
  id: string;
  profile_id: string;
  playlist_ref: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  total_count: number;
  processed_count: number;
  imported_count: number;
  unavailable_count: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  playlist_source_id: string | null;
}

export class LibraryDataError extends Error {
  constructor() {
    super("Library data could not be read");
    this.name = "LibraryDataError";
  }
}

export class LibraryCursorError extends Error {
  constructor() {
    super("Library cursor is invalid");
    this.name = "LibraryCursorError";
  }
}

export interface CreatePlaylistImportJobResult {
  created: boolean;
  snapshot: PlaylistImportSnapshot;
}

export interface LibraryRepository {
  addItem(
    profileId: string,
    trackId: string,
    idempotencyKey: string,
    addedAt: string,
  ): LibraryItem | null;
  completeImport(
    jobId: string,
    playlistSource: PlaylistSource,
    tracks: MusicTrack[],
  ): PlaylistImportSnapshot;
  createImportJob(
    jobId: string,
    profileId: string,
    idempotencyKey: string,
    playlistRef: string,
    createdAt: string,
  ): CreatePlaylistImportJobResult;
  failImport(jobId: string, errorCode: string, updatedAt: string): void;
  findTrack(trackId: string): MusicTrack | null;
  getImport(profileId: string, jobId: string): PlaylistImportSnapshot | null;
  list(profileId: string, cursor?: string, limit?: number): LibraryListResponse;
  markImportRunning(jobId: string, updatedAt: string): void;
  recoverInterruptedImports(updatedAt: string): void;
  upsertTrack(track: MusicTrack, updatedAt: string): void;
}

function parseStored<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new LibraryDataError();
  }
  return parsed.data;
}

function mapTrack(row: MusicTrackRow): MusicTrack {
  return parseStored(musicTrackSchema, {
    id: row.id,
    source: row.source,
    sourceTrackId: row.source_track_id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    artworkUrl: row.artwork_url,
    durationMs: row.duration_ms,
    lyricStatus: row.lyric_status,
    playable: row.playable === 1,
  });
}

function mapLibraryItem(row: LibraryItemRow): LibraryItem {
  return parseStored(libraryItemSchema, {
    track: mapTrack(row),
    addedAt: row.added_at,
    playlistSourceId: row.playlist_source_id,
  });
}

function mapPlaylistSource(row: PlaylistSourceRow): PlaylistSource {
  return parseStored(playlistSourceSchema, {
    id: row.id,
    source: row.source,
    sourcePlaylistId: row.source_playlist_id,
    title: row.title,
    importedAt: row.imported_at,
    availableTrackCount: row.available_track_count,
    unavailableTrackCount: row.unavailable_track_count,
  });
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (!/^(?:0|[1-9]\d*)$/.test(decoded)) {
    throw new LibraryCursorError();
  }
  return Number(decoded);
}

export function createLibraryRepository(client: DatabaseSync): LibraryRepository {
  const trackColumns = `
    id, source, source_track_id, title, artist, album, artwork_url, duration_ms, lyric_status, playable
  `;
  const findTrack = client.prepare(`SELECT ${trackColumns} FROM music_track WHERE id = ?`);
  const upsertTrack = client.prepare(`
    INSERT INTO music_track (
      id, source, source_track_id, title, artist, album, artwork_url, duration_ms, lyric_status, playable, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_track_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      artwork_url = excluded.artwork_url,
      duration_ms = excluded.duration_ms,
      lyric_status = excluded.lyric_status,
      playable = excluded.playable,
      updated_at = excluded.updated_at
  `);
  const findItemByIdempotency = client.prepare(`
    SELECT ${trackColumns}, library_item.added_at, library_item.playlist_source_id
    FROM library_item
    JOIN music_track ON music_track.id = library_item.track_id
    WHERE library_item.profile_id = ? AND library_item.creation_idempotency_key = ?
  `);
  const findItemByTrack = client.prepare(`
    SELECT ${trackColumns}, library_item.added_at, library_item.playlist_source_id
    FROM library_item
    JOIN music_track ON music_track.id = library_item.track_id
    WHERE library_item.profile_id = ? AND library_item.track_id = ?
  `);
  const insertItem = client.prepare(`
    INSERT INTO library_item (
      profile_id, track_id, playlist_source_id, creation_idempotency_key, added_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, track_id) DO NOTHING
  `);
  const listItems = client.prepare(`
    SELECT ${trackColumns}, library_item.added_at, library_item.playlist_source_id
    FROM library_item
    JOIN music_track ON music_track.id = library_item.track_id
    WHERE library_item.profile_id = ?
    ORDER BY library_item.added_at DESC, library_item.track_id ASC
    LIMIT ? OFFSET ?
  `);
  const findImportByKey = client.prepare(`
    SELECT *
    FROM playlist_import_job
    WHERE profile_id = ? AND idempotency_key = ?
  `);
  const findImportById = client.prepare(`
    SELECT *
    FROM playlist_import_job
    WHERE profile_id = ? AND id = ?
  `);
  const findImportByJobId = client.prepare(`
    SELECT *
    FROM playlist_import_job
    WHERE id = ?
  `);
  const insertImport = client.prepare(`
    INSERT INTO playlist_import_job (
      id, profile_id, idempotency_key, playlist_ref, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'queued', ?, ?)
  `);
  const markImportRunning = client.prepare(`
    UPDATE playlist_import_job
    SET status = 'running', updated_at = ?
    WHERE id = ? AND status = 'queued'
  `);
  const failImport = client.prepare(`
    UPDATE playlist_import_job
    SET status = 'failed', error_code = ?, updated_at = ?
    WHERE id = ? AND status IN ('queued', 'running')
  `);
  const recoverInterrupted = client.prepare(`
    UPDATE playlist_import_job
    SET status = 'failed', error_code = 'LIBRARY_IMPORT_INTERRUPTED', updated_at = ?
    WHERE status IN ('queued', 'running')
  `);
  const findPlaylistSource = client.prepare(`
    SELECT *
    FROM playlist_source
    WHERE profile_id = ? AND source = ? AND source_playlist_id = ?
  `);
  const insertPlaylistSource = client.prepare(`
    INSERT INTO playlist_source (
      id, profile_id, source, source_playlist_id, title,
      available_track_count, unavailable_track_count, imported_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updatePlaylistSource = client.prepare(`
    UPDATE playlist_source
    SET
      title = ?,
      available_track_count = ?,
      unavailable_track_count = ?,
      imported_at = ?
    WHERE id = ?
  `);
  const completeImport = client.prepare(`
    UPDATE playlist_import_job
    SET
      status = 'succeeded',
      total_count = ?,
      processed_count = ?,
      imported_count = ?,
      unavailable_count = ?,
      playlist_source_id = ?,
      error_code = NULL,
      updated_at = ?
    WHERE id = ?
  `);
  const attachImportedItem = client.prepare(`
    INSERT INTO library_item (
      profile_id, track_id, playlist_source_id, creation_idempotency_key, added_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, track_id) DO UPDATE SET
      playlist_source_id = COALESCE(library_item.playlist_source_id, excluded.playlist_source_id)
  `);

  function readPlaylistSource(id: string | null): PlaylistSource | null {
    if (id === null) {
      return null;
    }
    const row = client.prepare("SELECT * FROM playlist_source WHERE id = ?").get(id) as
      PlaylistSourceRow | undefined;
    return row === undefined ? null : mapPlaylistSource(row);
  }

  function mapImport(row: PlaylistImportJobRow): PlaylistImportSnapshot {
    return parseStored(playlistImportSnapshotSchema, {
      jobId: row.id,
      profileId: row.profile_id,
      status: row.status,
      playlistRef: row.playlist_ref,
      progress: {
        total: row.total_count,
        processed: row.processed_count,
        imported: row.imported_count,
        unavailable: row.unavailable_count,
      },
      playlistSource: readPlaylistSource(row.playlist_source_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    });
  }

  function readImport(statement: ReturnType<DatabaseSync["prepare"]>, ...values: string[]) {
    const row = statement.get(...values) as PlaylistImportJobRow | undefined;
    return row === undefined ? null : mapImport(row);
  }

  function writeTrack(track: MusicTrack, updatedAt: string): void {
    upsertTrack.run(
      track.id,
      track.source,
      track.sourceTrackId,
      track.title,
      track.artist,
      track.album,
      track.artworkUrl,
      track.durationMs,
      track.lyricStatus,
      track.playable ? 1 : 0,
      updatedAt,
      updatedAt,
    );
  }

  return {
    addItem(profileId, trackId, idempotencyKey, addedAt) {
      const repeated = findItemByIdempotency.get(profileId, idempotencyKey) as
        LibraryItemRow | undefined;
      if (repeated !== undefined) {
        return mapLibraryItem(repeated);
      }
      if (findTrack.get(trackId) === undefined) {
        return null;
      }

      insertItem.run(profileId, trackId, null, idempotencyKey, addedAt);
      const row = findItemByTrack.get(profileId, trackId) as LibraryItemRow | undefined;
      return row === undefined ? null : mapLibraryItem(row);
    },
    completeImport(jobId, candidateSource, tracks) {
      const job = findImportByJobId.get(jobId) as PlaylistImportJobRow | undefined;
      if (job === undefined) {
        throw new LibraryDataError();
      }

      client.exec("BEGIN IMMEDIATE");
      try {
        const existingSource = findPlaylistSource.get(
          job.profile_id,
          candidateSource.source,
          candidateSource.sourcePlaylistId,
        ) as PlaylistSourceRow | undefined;
        const source =
          existingSource === undefined ? candidateSource : mapPlaylistSource(existingSource);

        if (existingSource === undefined) {
          insertPlaylistSource.run(
            source.id,
            job.profile_id,
            source.source,
            source.sourcePlaylistId,
            source.title,
            source.availableTrackCount,
            source.unavailableTrackCount,
            source.importedAt,
          );
        } else {
          updatePlaylistSource.run(
            candidateSource.title,
            candidateSource.availableTrackCount,
            candidateSource.unavailableTrackCount,
            candidateSource.importedAt,
            source.id,
          );
        }

        for (const track of tracks) {
          writeTrack(track, candidateSource.importedAt);
          attachImportedItem.run(
            job.profile_id,
            track.id,
            source.id,
            `playlist:${jobId}:${track.id}`,
            candidateSource.importedAt,
          );
        }

        const total = candidateSource.availableTrackCount + candidateSource.unavailableTrackCount;
        completeImport.run(
          total,
          total,
          tracks.length,
          candidateSource.unavailableTrackCount,
          source.id,
          candidateSource.importedAt,
          jobId,
        );
        client.exec("COMMIT");
      } catch (error) {
        client.exec("ROLLBACK");
        throw error;
      }

      const completed = readImport(findImportByJobId, jobId);
      if (completed === null) {
        throw new LibraryDataError();
      }
      return completed;
    },
    createImportJob(jobId, profileId, idempotencyKey, playlistRef, createdAt) {
      const existing = readImport(findImportByKey, profileId, idempotencyKey);
      if (existing !== null) {
        return { created: false, snapshot: existing };
      }
      insertImport.run(jobId, profileId, idempotencyKey, playlistRef, createdAt, createdAt);
      const snapshot = readImport(findImportById, profileId, jobId);
      if (snapshot === null) {
        throw new LibraryDataError();
      }
      return { created: true, snapshot };
    },
    failImport(jobId, errorCode, updatedAt) {
      failImport.run(errorCode, updatedAt, jobId);
    },
    findTrack(trackId) {
      const row = findTrack.get(trackId) as MusicTrackRow | undefined;
      if (row === undefined) {
        return null;
      }
      return mapTrack(row);
    },
    getImport(profileId, jobId) {
      return readImport(findImportById, profileId, jobId);
    },
    list(profileId, cursor, requestedLimit) {
      const offset = decodeCursor(cursor);
      const limit = requestedLimit ?? 50;
      const rows = listItems.all(profileId, limit + 1, offset) as unknown as LibraryItemRow[];
      const hasNextPage = rows.length > limit;
      return parseStored(libraryListResponseSchema, {
        items: rows.slice(0, limit).map(mapLibraryItem),
        ...(hasNextPage ? { nextCursor: encodeCursor(offset + limit) } : {}),
      });
    },
    markImportRunning(jobId, updatedAt) {
      markImportRunning.run(updatedAt, jobId);
    },
    recoverInterruptedImports(updatedAt) {
      recoverInterrupted.run(updatedAt);
    },
    upsertTrack(track, updatedAt) {
      writeTrack(track, updatedAt);
    },
  };
}
