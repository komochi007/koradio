import type { DatabaseSync } from "node:sqlite";

import {
  programGenerationSnapshotSchema,
  type ProgramGenerationSnapshot,
  type ProgramGenerationStage,
} from "@koradio/contracts";

export class ProgramGenerationDataError extends Error {
  constructor() {
    super("Program generation data could not be read or written");
    this.name = "ProgramGenerationDataError";
  }
}

export class ProgramGenerationConflictError extends Error {
  constructor() {
    super("Another program generation is already active for this profile");
    this.name = "ProgramGenerationConflictError";
  }
}

interface ProgramGenerationJobRow {
  created_at: string;
  error_code: string | null;
  id: string;
  idempotency_key: string;
  profile_id: string;
  program_id: string | null;
  sequence: number;
  stage: ProgramGenerationStage;
  status: ProgramGenerationSnapshot["status"];
  updated_at: string;
}

export interface CreateProgramGenerationJobResult {
  created: boolean;
  snapshot: ProgramGenerationSnapshot;
}

export interface ProgramGenerationRepository {
  cancelProfile(profileId: string, updatedAt: string): void;
  create(
    jobId: string,
    profileId: string,
    idempotencyKey: string,
    createdAt: string,
  ): CreateProgramGenerationJobResult;
  fail(jobId: string, errorCode: string, updatedAt: string): void;
  get(profileId: string, jobId: string): ProgramGenerationSnapshot | null;
  getById(jobId: string): ProgramGenerationSnapshot | null;
  markRunning(jobId: string, updatedAt: string): void;
  recoverInterrupted(updatedAt: string): void;
  reserveSequence(jobId: string, updatedAt: string): number | null;
  setStage(jobId: string, stage: ProgramGenerationStage, updatedAt: string): void;
  succeed(jobId: string, programId: string, updatedAt: string): void;
}

function mapJob(row: ProgramGenerationJobRow): ProgramGenerationSnapshot {
  const parsed = programGenerationSnapshotSchema.safeParse({
    jobId: row.id,
    profileId: row.profile_id,
    status: row.status,
    stage: row.stage,
    sequence: row.sequence,
    ...(row.program_id === null ? {} : { programId: row.program_id }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
  });
  if (!parsed.success) {
    throw new ProgramGenerationDataError();
  }
  return parsed.data;
}

export function createProgramGenerationRepository(
  client: DatabaseSync,
): ProgramGenerationRepository {
  const findById = client.prepare("SELECT * FROM program_generation_job WHERE id = ?");
  const findByProfileAndId = client.prepare(
    "SELECT * FROM program_generation_job WHERE profile_id = ? AND id = ?",
  );
  const findByKey = client.prepare(
    "SELECT * FROM program_generation_job WHERE profile_id = ? AND idempotency_key = ?",
  );
  const findActive = client.prepare(`
    SELECT * FROM program_generation_job
    WHERE profile_id = ? AND status IN ('queued', 'running')
  `);
  const insert = client.prepare(`
    INSERT INTO program_generation_job (
      id, profile_id, idempotency_key, status, stage, created_at, updated_at
    )
    VALUES (?, ?, ?, 'queued', 'queued', ?, ?)
  `);
  const markRunning = client.prepare(`
    UPDATE program_generation_job
    SET status = 'running', stage = 'planning', updated_at = ?
    WHERE id = ? AND status = 'queued'
  `);
  const setStage = client.prepare(`
    UPDATE program_generation_job
    SET stage = ?, updated_at = ?
    WHERE id = ? AND status = 'running'
  `);
  const reserveSequence = client.prepare(`
    UPDATE program_generation_job
    SET sequence = sequence + 1, updated_at = ?
    WHERE id = ?
  `);
  const succeed = client.prepare(`
    UPDATE program_generation_job
    SET status = 'succeeded', stage = 'completed', program_id = ?, error_code = NULL, updated_at = ?
    WHERE id = ? AND status = 'running'
  `);
  const fail = client.prepare(`
    UPDATE program_generation_job
    SET status = 'failed', error_code = ?, updated_at = ?
    WHERE id = ? AND status IN ('queued', 'running')
  `);
  const cancelProfile = client.prepare(`
    UPDATE program_generation_job
    SET status = 'canceled', error_code = NULL, updated_at = ?
    WHERE profile_id = ? AND status IN ('queued', 'running')
  `);
  const recoverInterrupted = client.prepare(`
    UPDATE program_generation_job
    SET status = 'failed', error_code = 'PROGRAM_GENERATION_INTERRUPTED', updated_at = ?
    WHERE status IN ('queued', 'running')
  `);

  function read(statement: ReturnType<DatabaseSync["prepare"]>, ...values: string[]) {
    const row = statement.get(...values) as ProgramGenerationJobRow | undefined;
    return row === undefined ? null : mapJob(row);
  }

  return {
    cancelProfile(profileId, updatedAt) {
      cancelProfile.run(updatedAt, profileId);
    },
    create(jobId, profileId, idempotencyKey, createdAt) {
      const existing = read(findByKey, profileId, idempotencyKey);
      if (existing !== null) {
        return { created: false, snapshot: existing };
      }
      if (read(findActive, profileId) !== null) {
        throw new ProgramGenerationConflictError();
      }
      try {
        insert.run(jobId, profileId, idempotencyKey, createdAt, createdAt);
      } catch {
        const repeated = read(findByKey, profileId, idempotencyKey);
        if (repeated !== null) {
          return { created: false, snapshot: repeated };
        }
        if (read(findActive, profileId) !== null) {
          throw new ProgramGenerationConflictError();
        }
        throw new ProgramGenerationDataError();
      }
      const snapshot = read(findByProfileAndId, profileId, jobId);
      if (snapshot === null) {
        throw new ProgramGenerationDataError();
      }
      return { created: true, snapshot };
    },
    fail(jobId, errorCode, updatedAt) {
      fail.run(errorCode, updatedAt, jobId);
    },
    get(profileId, jobId) {
      return read(findByProfileAndId, profileId, jobId);
    },
    getById(jobId) {
      return read(findById, jobId);
    },
    markRunning(jobId, updatedAt) {
      if (markRunning.run(updatedAt, jobId).changes !== 1) {
        throw new ProgramGenerationDataError();
      }
    },
    recoverInterrupted(updatedAt) {
      recoverInterrupted.run(updatedAt);
    },
    reserveSequence(jobId, updatedAt) {
      if (reserveSequence.run(updatedAt, jobId).changes !== 1) {
        return null;
      }
      return read(findById, jobId)?.sequence ?? null;
    },
    setStage(jobId, stage, updatedAt) {
      if (setStage.run(stage, updatedAt, jobId).changes !== 1) {
        throw new ProgramGenerationDataError();
      }
    },
    succeed(jobId, programId, updatedAt) {
      if (succeed.run(programId, updatedAt, jobId).changes !== 1) {
        throw new ProgramGenerationDataError();
      }
    },
  };
}
