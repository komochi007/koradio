import type { DatabaseSync } from "node:sqlite";

import {
  programDetailSchema,
  type DjScriptSegment,
  type MusicTrack,
  type Program,
  type ProgramDetail,
  type ProgramListResponse,
} from "@koradio/contracts";

import type { PlaybackTimelineService } from "../playback/index.js";
import { assertProgramCommit } from "./domain/program.js";
import {
  ProgramDataError,
  type PendingCleanupRecord,
  type ProgramRepository,
} from "./persistence.js";

export class ProgramNotFoundError extends Error {
  constructor() {
    super("Program was not found");
    this.name = "ProgramNotFoundError";
  }
}

export class ProgramWriteError extends Error {
  constructor() {
    super("Program could not be stored");
    this.name = "ProgramWriteError";
  }
}

export interface ProgramTrackReader {
  getTracks(trackIds: string[]): MusicTrack[];
}

export interface CreateProgramServiceOptions {
  client: DatabaseSync;
  repository: ProgramRepository;
  timeline: PlaybackTimelineService;
  tracks: ProgramTrackReader;
}

export interface ProgramService {
  commit(detail: ProgramDetail, finalize?: () => void): ProgramDetail;
  completeProgram(profileId: string, programId: string): boolean;
  current(profileId: string): ProgramDetail | null;
  delete(
    profileId: string,
    programId: string,
    cleanup: PendingCleanupRecord[],
    beforeDelete?: () => void,
  ): { clearedCurrent: boolean };
  findProgram(profileId: string, programId: string): Program | null;
  get(profileId: string, programId: string): ProgramDetail;
  hasProgram(profileId: string, programId: string): boolean;
  list(profileId: string, cursor?: string, limit?: number): ProgramListResponse;
  revealDjScript(profileId: string, programId: string, segmentId: string): DjScriptSegment;
}

export function createProgramService(options: CreateProgramServiceOptions): ProgramService {
  function readDetail(profileId: string, programId: string): ProgramDetail | null {
    const record = options.repository.find(profileId, programId);
    if (record === null) {
      return null;
    }
    try {
      const detail = programDetailSchema.parse({
        program: record.program,
        djScripts: record.djScripts,
        tracks: options.tracks.getTracks(record.program.trackIds),
        timeline: options.timeline.get(programId),
      });
      assertProgramCommit({
        ...detail,
        program: { ...detail.program, status: "ready" },
      });
      return detail;
    } catch (error) {
      if (error instanceof ProgramDataError) {
        throw error;
      }
      throw new ProgramDataError();
    }
  }

  return {
    commit(detail, finalize) {
      const canonical = programDetailSchema.parse({
        ...detail,
        tracks: options.tracks.getTracks(detail.program.trackIds),
      });
      assertProgramCommit(canonical);
      options.client.exec("BEGIN IMMEDIATE");
      try {
        options.repository.insert({
          program: canonical.program,
          djScripts: canonical.djScripts,
        });
        options.timeline.insert(canonical.program.id, canonical.timeline);
        options.repository.setCurrent(canonical.program.profileId, canonical.program.id);
        finalize?.();
        options.client.exec("COMMIT");
        return canonical;
      } catch {
        options.client.exec("ROLLBACK");
        throw new ProgramWriteError();
      }
    },
    completeProgram(profileId, programId) {
      return options.repository.markCompleted(profileId, programId) !== null;
    },
    current(profileId) {
      const record = options.repository.current(profileId);
      return record === null ? null : readDetail(profileId, record.program.id);
    },
    delete(profileId, programId, cleanup, beforeDelete) {
      if (!options.repository.has(profileId, programId)) {
        throw new ProgramNotFoundError();
      }
      options.client.exec("BEGIN IMMEDIATE");
      try {
        beforeDelete?.();
        const result = options.repository.delete(profileId, programId, cleanup);
        if (!result.deleted) {
          throw new ProgramNotFoundError();
        }
        options.client.exec("COMMIT");
        return { clearedCurrent: result.clearedCurrent };
      } catch (error) {
        options.client.exec("ROLLBACK");
        if (error instanceof ProgramNotFoundError) throw error;
        throw new ProgramWriteError();
      }
    },
    findProgram(profileId, programId) {
      return options.repository.find(profileId, programId)?.program ?? null;
    },
    get(profileId, programId) {
      const detail = readDetail(profileId, programId);
      if (detail === null) {
        throw new ProgramNotFoundError();
      }
      return detail;
    },
    hasProgram(profileId, programId) {
      return options.repository.has(profileId, programId);
    },
    list(profileId, cursor, limit) {
      return options.repository.list(profileId, cursor, limit);
    },
    revealDjScript(profileId, programId, segmentId) {
      const segment = options.repository.reveal(
        profileId,
        programId,
        segmentId,
        new Date().toISOString(),
      );
      if (segment === null) {
        throw new ProgramNotFoundError();
      }
      return segment;
    },
  };
}
