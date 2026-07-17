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
  tts_audio_ref: string | null;
  type: "intro" | "segue" | "outro";
}

export interface ProgramRecord {
  djScripts: DjScriptSegment[];
  program: Program;
}

export interface ProgramRepository {
  find(profileId: string, programId: string): ProgramRecord | null;
  has(profileId: string, programId: string): boolean;
  insert(record: ProgramRecord): void;
  list(profileId: string, cursor?: string, limit?: number): ProgramListResponse;
  markCompleted(profileId: string, programId: string): Program | null;
}

function mapSegment(row: DjScriptSegmentRow): DjScriptSegment {
  const parsed = djScriptSegmentSchema.safeParse({
    id: row.id,
    programId: row.program_id,
    type: row.type,
    language: row.language,
    text: row.text,
    displayText: row.display_text,
    estimatedTiming: row.estimated_timing === 1,
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
  const findProgramTracks = client.prepare(`
    SELECT track_id FROM program_track WHERE program_id = ? ORDER BY position ASC
  `);
  const findProgramSegments = client.prepare(`
    SELECT * FROM dj_script_segment WHERE program_id = ? ORDER BY position ASC
  `);
  const insertProgram = client.prepare(`
    INSERT INTO program (id, profile_id, scenario_text, title, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertTrack = client.prepare(`
    INSERT INTO program_track (program_id, position, track_id) VALUES (?, ?, ?)
  `);
  const insertSegment = client.prepare(`
    INSERT INTO dj_script_segment (
      id, program_id, position, type, language, text, display_text,
      estimated_timing, tts_audio_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  };
}
