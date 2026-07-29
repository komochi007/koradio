import { Buffer } from "node:buffer";
import type { DatabaseSync } from "node:sqlite";

import {
  djScriptSegmentSchema,
  programListResponseSchema,
  programSchema,
  type DjScriptSegment,
  type Program,
  type ProgramListResponse,
} from "@koradio/contracts";

export class ProgramDataError extends Error {
  constructor() {
    super("Program data could not be read or written");
    this.name = "ProgramDataError";
  }
}

export class ProgramCursorError extends Error {
  constructor() {
    super("Program cursor is invalid");
    this.name = "ProgramCursorError";
  }
}

interface ProgramRow {
  created_at: string;
  id: string;
  origin_mode: "live" | "mock";
  profile_id: string;
  scenario_text: string;
  status: "ready" | "completed";
  title: string;
}

interface ProgramTrackRow {
  track_id: string;
}

interface DjScriptSegmentRow {
  display_text: string;
  estimated_timing: number;
  id: string;
  language: "zh-CN" | "en-GB";
  program_id: string;
  text: string;
  timing_markers_json: string;
  tts_audio_ref: string | null;
  type: "intro" | "segue" | "outro";
}

export interface ProgramRecord {
  djScripts: DjScriptSegment[];
  program: Program;
}

export interface ProgramRepository {
  current(profileId: string): ProgramRecord | null;
  delete(
    profileId: string,
    programId: string,
    cleanup: PendingCleanupRecord[],
  ): { clearedCurrent: boolean; deleted: boolean };
  find(profileId: string, programId: string): ProgramRecord | null;
  has(profileId: string, programId: string): boolean;
  insert(record: ProgramRecord): void;
  list(profileId: string, cursor?: string, limit?: number): ProgramListResponse;
  markCompleted(profileId: string, programId: string): Program | null;
  setCurrent(profileId: string, programId: string): void;
  ttsReferences(programId: string): string[];
  ttsReferenceUseCount(reference: string): number;
}

export interface PendingCleanupRecord {
  createdAt: string;
  id: string;
  reference: string;
  stagedName: string;
}

function mapSegment(row: DjScriptSegmentRow): DjScriptSegment {
  let markers: unknown;
  try {
    markers = JSON.parse(row.timing_markers_json);
  } catch {
    throw new ProgramDataError();
  }
  const parsed = djScriptSegmentSchema.safeParse({
    id: row.id,
    programId: row.program_id,
    type: row.type,
    language: row.language,
    text: row.text,
    displayText: row.display_text,
    estimatedTiming: row.estimated_timing === 1,
    markers,
    ttsAudioRef: row.tts_audio_ref,
  });
  if (!parsed.success) {
    throw new ProgramDataError();
  }
  return parsed.data;
}

function mapProgram(row: ProgramRow, trackIds: string[]): Program {
  const parsed = programSchema.safeParse({
    id: row.id,
    profileId: row.profile_id,
    scenarioText: row.scenario_text,
    title: row.title,
    status: row.status,
    trackIds,
    originMode: row.origin_mode,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    throw new ProgramDataError();
  }
  return parsed.data;
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
    throw new ProgramCursorError();
  }
  return Number(decoded);
}

export function createProgramRepository(client: DatabaseSync): ProgramRepository {
  const findProgram = client.prepare("SELECT * FROM program WHERE profile_id = ? AND id = ?");
  const findCurrentProgram = client.prepare(`
    SELECT program.*
    FROM current_program
    JOIN program ON program.id = current_program.program_id
    WHERE current_program.profile_id = ?
  `);
  const findProgramTracks = client.prepare(`
    SELECT track_id FROM program_track WHERE program_id = ? ORDER BY position ASC
  `);
  const findProgramSegments = client.prepare(`
    SELECT * FROM dj_script_segment WHERE program_id = ? ORDER BY position ASC
  `);
  const insertProgram = client.prepare(`
    INSERT INTO program (id, profile_id, scenario_text, title, status, origin_mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTrack = client.prepare(`
    INSERT INTO program_track (program_id, position, track_id) VALUES (?, ?, ?)
  `);
  const insertSegment = client.prepare(`
    INSERT INTO dj_script_segment (
      id, program_id, position, type, language, text, display_text,
      estimated_timing, timing_markers_json, tts_audio_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listPrograms = client.prepare(`
    SELECT * FROM program
    WHERE profile_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const updateCompleted = client.prepare(`
    UPDATE program SET status = 'completed' WHERE profile_id = ? AND id = ?
  `);
  const upsertCurrent = client.prepare(`
    INSERT INTO current_program (profile_id, program_id)
    VALUES (?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET program_id = excluded.program_id
  `);
  const listTtsReferences = client.prepare(`
    SELECT DISTINCT tts_audio_ref
    FROM dj_script_segment
    WHERE program_id = ? AND tts_audio_ref IS NOT NULL
  `);
  const countTtsReference = client.prepare(`
    SELECT COUNT(*) AS count FROM dj_script_segment WHERE tts_audio_ref = ?
  `);
  const deleteCheckpoint = client.prepare("DELETE FROM playback_checkpoint WHERE program_id = ?");
  const deleteCurrent = client.prepare(
    "DELETE FROM current_program WHERE profile_id = ? AND program_id = ?",
  );
  const deleteTimeline = client.prepare("DELETE FROM playback_timeline_item WHERE program_id = ?");
  const deleteTracks = client.prepare("DELETE FROM program_track WHERE program_id = ?");
  const deleteSegments = client.prepare("DELETE FROM dj_script_segment WHERE program_id = ?");
  const deleteGeneration = client.prepare(`
    DELETE FROM program_generation_job WHERE profile_id = ? AND program_id = ? AND status = 'succeeded'
  `);
  const deleteProgram = client.prepare("DELETE FROM program WHERE profile_id = ? AND id = ?");
  const insertCleanup = client.prepare(`
    INSERT INTO pending_file_cleanup (id, reference, staged_name, created_at)
    VALUES (?, ?, ?, ?)
  `);

  function readProgram(row: ProgramRow): Program {
    const trackIds = (findProgramTracks.all(row.id) as unknown as ProgramTrackRow[]).map(
      (track) => track.track_id,
    );
    return mapProgram(row, trackIds);
  }

  function readRecord(row: ProgramRow): ProgramRecord {
    const djScripts = (findProgramSegments.all(row.id) as unknown as DjScriptSegmentRow[]).map(
      mapSegment,
    );
    return {
      program: readProgram(row),
      djScripts,
    };
  }

  return {
    current(profileId) {
      const row = findCurrentProgram.get(profileId) as unknown as ProgramRow | undefined;
      return row === undefined ? null : readRecord(row);
    },
    delete(profileId, programId, cleanup) {
      deleteCheckpoint.run(programId);
      const cleared = deleteCurrent.run(profileId, programId).changes > 0;
      deleteTimeline.run(programId);
      deleteTracks.run(programId);
      deleteSegments.run(programId);
      deleteGeneration.run(profileId, programId);
      const result = deleteProgram.run(profileId, programId);
      for (const record of cleanup) {
        insertCleanup.run(record.id, record.reference, record.stagedName, record.createdAt);
      }
      return { clearedCurrent: cleared, deleted: result.changes > 0 };
    },
    find(profileId, programId) {
      const row = findProgram.get(profileId, programId) as unknown as ProgramRow | undefined;
      return row === undefined ? null : readRecord(row);
    },
    has(profileId, programId) {
      return findProgram.get(profileId, programId) !== undefined;
    },
    insert(record) {
      insertProgram.run(
        record.program.id,
        record.program.profileId,
        record.program.scenarioText,
        record.program.title,
        record.program.status,
        record.program.originMode,
        record.program.createdAt,
      );
      for (const [position, trackId] of record.program.trackIds.entries()) {
        insertTrack.run(record.program.id, position, trackId);
      }
      for (const [position, segment] of record.djScripts.entries()) {
        insertSegment.run(
          segment.id,
          segment.programId,
          position,
          segment.type,
          segment.language,
          segment.text,
          segment.displayText,
          segment.estimatedTiming ? 1 : 0,
          JSON.stringify(segment.markers),
          segment.ttsAudioRef,
        );
      }
    },
    list(profileId, cursor, limit = 20) {
      const offset = decodeCursor(cursor);
      const rows = listPrograms.all(profileId, limit + 1, offset) as unknown as ProgramRow[];
      const hasNext = rows.length > limit;
      const items = rows.slice(0, limit).map(readProgram);
      return programListResponseSchema.parse({
        items,
        ...(hasNext ? { nextCursor: encodeCursor(offset + limit) } : {}),
      });
    },
    markCompleted(profileId, programId) {
      updateCompleted.run(profileId, programId);
      const row = findProgram.get(profileId, programId) as unknown as ProgramRow | undefined;
      return row === undefined ? null : readProgram(row);
    },
    setCurrent(profileId, programId) {
      upsertCurrent.run(profileId, programId);
    },
    ttsReferences(programId) {
      return (listTtsReferences.all(programId) as unknown as Array<{ tts_audio_ref: string }>).map(
        (row) => row.tts_audio_ref,
      );
    },
    ttsReferenceUseCount(reference) {
      const row = countTtsReference.get(reference) as unknown as { count: number };
      return row.count;
    },
  };
}
