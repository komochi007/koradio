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
import { z } from "zod";

import { parseSqliteRow, parseSqliteRows } from "../../platform/db/rows.js";

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
  playback_mode: "sequential" | "voice-overlay";
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
  revealed_at: string | null;
  text: string;
  tts_audio_ref: string | null;
  type: "intro" | "segue" | "outro";
}

const programRowSchema: z.ZodType<ProgramRow> = z.object({
  created_at: z.string(),
  id: z.string(),
  origin_mode: z.enum(["live", "mock"]),
  playback_mode: z.enum(["sequential", "voice-overlay"]),
  profile_id: z.string(),
  scenario_text: z.string(),
  status: z.enum(["ready", "completed"]),
  title: z.string(),
});
const programTrackRowSchema: z.ZodType<ProgramTrackRow> = z.object({
  track_id: z.string(),
});
const djScriptSegmentRowSchema: z.ZodType<DjScriptSegmentRow> = z.object({
  display_text: z.string(),
  estimated_timing: z.number(),
  id: z.string(),
  language: z.enum(["zh-CN", "en-GB"]),
  program_id: z.string(),
  revealed_at: z.string().nullable(),
  text: z.string(),
  tts_audio_ref: z.string().nullable(),
  type: z.enum(["intro", "segue", "outro"]),
});
const ttsReferenceRowSchema = z.object({ tts_audio_ref: z.string() });
const countRowSchema = z.object({ count: z.number() });
const citationRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  provider: z.enum(["musicbrainz", "wikimedia"]),
});

export interface ProgramRecord {
  djScripts: DjScriptSegment[];
  program: Program;
}

export interface ProgramRepository {
  activateHandoff(profileId: string, programId: string): ProgramRecord | null;
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
  pendingHandoff(profileId: string): ProgramRecord | null;
  reveal(
    profileId: string,
    programId: string,
    segmentId: string,
    revealedAt: string,
  ): DjScriptSegment | null;
  setCurrent(profileId: string, programId: string): void;
  setHandoff(profileId: string, programId: string, createdAt: string): void;
  ttsReferences(programId: string): string[];
  ttsReferenceUseCount(reference: string): number;
}

export interface PendingCleanupRecord {
  createdAt: string;
  id: string;
  reference: string;
  stagedName: string;
}

function mapSegment(
  row: DjScriptSegmentRow,
  citations: Array<z.infer<typeof citationRowSchema>>,
): DjScriptSegment {
  const parsed = djScriptSegmentSchema.safeParse({
    id: row.id,
    programId: row.program_id,
    type: row.type,
    language: row.language,
    text: row.text,
    displayText: row.display_text,
    estimatedTiming: row.estimated_timing === 1,
    ...(row.revealed_at === null ? {} : { revealedAt: row.revealed_at }),
    ttsAudioRef: row.tts_audio_ref,
    ...(citations.length === 0 ? {} : { citations }),
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
    ...(row.playback_mode === "sequential" ? {} : { playbackMode: row.playback_mode }),
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
  const findPendingProgram = client.prepare(`
    SELECT program.*
    FROM program_handoff
    JOIN program ON program.id = program_handoff.program_id
    WHERE program_handoff.profile_id = ?
  `);
  const findProgramTracks = client.prepare(`
    SELECT track_id FROM program_track WHERE program_id = ? ORDER BY position ASC
  `);
  const findProgramSegments = client.prepare(`
    SELECT * FROM dj_script_segment WHERE program_id = ? ORDER BY position ASC
  `);
  const insertProgram = client.prepare(`
    INSERT INTO program (
      id, profile_id, scenario_text, title, status, origin_mode, playback_mode, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTrack = client.prepare(`
    INSERT INTO program_track (program_id, position, track_id) VALUES (?, ?, ?)
  `);
  const insertSegment = client.prepare(`
    INSERT INTO dj_script_segment (
      id, program_id, position, type, language, text, display_text,
      estimated_timing, tts_audio_ref, revealed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findCitations = client.prepare(
    "SELECT id, title, url, provider FROM dj_citation WHERE segment_id = ? ORDER BY position ASC",
  );
  const insertCitation = client.prepare(`
    INSERT INTO dj_citation (id, segment_id, position, title, url, provider)
    VALUES (?, ?, ?, ?, ?, ?)
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
  const revealSegment = client.prepare(`
    UPDATE dj_script_segment
    SET revealed_at = COALESCE(revealed_at, ?)
    WHERE id = ?
      AND program_id = ?
      AND EXISTS (SELECT 1 FROM program WHERE id = ? AND profile_id = ?)
  `);
  const findSegment = client.prepare(`
    SELECT dj_script_segment.*
    FROM dj_script_segment
    INNER JOIN program ON program.id = dj_script_segment.program_id
    WHERE dj_script_segment.id = ?
      AND dj_script_segment.program_id = ?
      AND program.profile_id = ?
  `);
  const upsertCurrent = client.prepare(`
    INSERT INTO current_program (profile_id, program_id)
    VALUES (?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET program_id = excluded.program_id
  `);
  const upsertHandoff = client.prepare(`
    INSERT INTO program_handoff (profile_id, program_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET program_id = excluded.program_id, created_at = excluded.created_at
  `);
  const deleteHandoff = client.prepare(
    "DELETE FROM program_handoff WHERE profile_id = ? AND program_id = ?",
  );
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
  const deleteCitations = client.prepare(`
    DELETE FROM dj_citation WHERE segment_id IN (
      SELECT id FROM dj_script_segment WHERE program_id = ?
    )
  `);
  const deleteGeneration = client.prepare(`
    DELETE FROM program_generation_job WHERE profile_id = ? AND program_id = ? AND status = 'succeeded'
  `);
  const deleteProgram = client.prepare("DELETE FROM program WHERE profile_id = ? AND id = ?");
  const insertCleanup = client.prepare(`
    INSERT INTO pending_file_cleanup (id, reference, staged_name, created_at)
    VALUES (?, ?, ?, ?)
  `);

  function readProgram(row: ProgramRow): Program {
    const trackIds = parseSqliteRows(programTrackRowSchema, findProgramTracks.all(row.id)).map(
      (track) => track.track_id,
    );
    return mapProgram(row, trackIds);
  }

  function readRecord(row: ProgramRow): ProgramRecord {
    const djScripts = parseSqliteRows(
      djScriptSegmentRowSchema,
      findProgramSegments.all(row.id),
    ).map((segment) =>
      mapSegment(segment, parseSqliteRows(citationRowSchema, findCitations.all(segment.id))),
    );
    return {
      program: readProgram(row),
      djScripts,
    };
  }

  return {
    activateHandoff(profileId, programId) {
      const value = findPendingProgram.get(profileId);
      const row = value === undefined ? undefined : parseSqliteRow(programRowSchema, value);
      if (row === undefined || row.id !== programId) return null;
      upsertCurrent.run(profileId, programId);
      deleteHandoff.run(profileId, programId);
      return readRecord(row);
    },
    current(profileId) {
      const value = findCurrentProgram.get(profileId);
      const row = value === undefined ? undefined : parseSqliteRow(programRowSchema, value);
      return row === undefined ? null : readRecord(row);
    },
    delete(profileId, programId, cleanup) {
      deleteCheckpoint.run(programId);
      const cleared = deleteCurrent.run(profileId, programId).changes > 0;
      deleteHandoff.run(profileId, programId);
      deleteTimeline.run(programId);
      deleteTracks.run(programId);
      deleteCitations.run(programId);
      deleteSegments.run(programId);
      deleteGeneration.run(profileId, programId);
      const result = deleteProgram.run(profileId, programId);
      for (const record of cleanup) {
        insertCleanup.run(record.id, record.reference, record.stagedName, record.createdAt);
      }
      return { clearedCurrent: cleared, deleted: result.changes > 0 };
    },
    find(profileId, programId) {
      const value = findProgram.get(profileId, programId);
      const row = value === undefined ? undefined : parseSqliteRow(programRowSchema, value);
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
        record.program.playbackMode ?? "sequential",
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
          segment.ttsAudioRef,
          segment.revealedAt ?? null,
        );
        for (const [citationPosition, citation] of (segment.citations ?? []).entries()) {
          insertCitation.run(
            citation.id,
            segment.id,
            citationPosition,
            citation.title,
            citation.url,
            citation.provider,
          );
        }
      }
    },
    list(profileId, cursor, limit = 20) {
      const offset = decodeCursor(cursor);
      const rows = parseSqliteRows(
        programRowSchema,
        listPrograms.all(profileId, limit + 1, offset),
      );
      const hasNext = rows.length > limit;
      const items = rows.slice(0, limit).map(readProgram);
      return programListResponseSchema.parse({
        items,
        ...(hasNext ? { nextCursor: encodeCursor(offset + limit) } : {}),
      });
    },
    pendingHandoff(profileId) {
      const value = findPendingProgram.get(profileId);
      const row = value === undefined ? undefined : parseSqliteRow(programRowSchema, value);
      return row === undefined ? null : readRecord(row);
    },
    markCompleted(profileId, programId) {
      updateCompleted.run(profileId, programId);
      const value = findProgram.get(profileId, programId);
      const row = value === undefined ? undefined : parseSqliteRow(programRowSchema, value);
      return row === undefined ? null : readProgram(row);
    },
    reveal(profileId, programId, segmentId, revealedAt) {
      revealSegment.run(revealedAt, segmentId, programId, programId, profileId);
      const value = findSegment.get(segmentId, programId, profileId);
      if (value === undefined) return null;
      const segment = parseSqliteRow(djScriptSegmentRowSchema, value);
      return mapSegment(segment, parseSqliteRows(citationRowSchema, findCitations.all(segment.id)));
    },
    setCurrent(profileId, programId) {
      upsertCurrent.run(profileId, programId);
    },
    setHandoff(profileId, programId, createdAt) {
      upsertHandoff.run(profileId, programId, createdAt);
    },
    ttsReferences(programId) {
      return parseSqliteRows(ttsReferenceRowSchema, listTtsReferences.all(programId)).map(
        (row) => row.tts_audio_ref,
      );
    },
    ttsReferenceUseCount(reference) {
      const row = parseSqliteRow(countRowSchema, countTtsReference.get(reference));
      return row.count;
    },
  };
}
