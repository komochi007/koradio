import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { deleteProgramResponseSchema, type DeleteProgramResponse } from "@koradio/contracts";

import { FileStoreError, type LocalFileStore } from "../../platform/files/index.js";
import type { ProgramRepository } from "./persistence.js";
import type { ProgramService } from "./service.js";

export class ProgramDeletionError extends Error {
  constructor() {
    super("Program could not be deleted");
    this.name = "ProgramDeletionError";
  }
}

interface StagedAudio {
  id: string;
  reference: string;
  stagedName: string;
}

export interface ProgramDeletionService {
  delete(
    profileId: string,
    programId: string,
    beforeDelete?: () => void,
  ): Promise<DeleteProgramResponse>;
  retryPendingCleanup(): Promise<void>;
}

export function createProgramDeletionService(options: {
  client: DatabaseSync;
  fileStore: LocalFileStore;
  programs: ProgramService;
  repository: ProgramRepository;
}): ProgramDeletionService {
  const listPending = options.client.prepare(
    "SELECT id, reference, staged_name AS stagedName FROM pending_file_cleanup ORDER BY created_at ASC",
  );
  const deletePending = options.client.prepare("DELETE FROM pending_file_cleanup WHERE id = ?");
  const failPending = options.client.prepare(`
    UPDATE pending_file_cleanup
    SET attempts = attempts + 1, last_error = 'storage_unavailable'
    WHERE id = ?
  `);

  async function restore(staged: StagedAudio[]): Promise<void> {
    await Promise.allSettled(
      staged.map((audio) => options.fileStore.restoreDelete(audio.reference, audio.stagedName)),
    );
  }

  return {
    async delete(profileId, programId, beforeDelete) {
      if (!options.repository.has(profileId, programId)) {
        return Promise.reject(new ProgramDeletionError());
      }
      const references = options.repository.ttsReferences(programId);
      const retainedAudioCount = references.filter(
        (reference) => options.repository.ttsReferenceUseCount(reference) > 1,
      ).length;
      const exclusive = references.filter(
        (reference) => options.repository.ttsReferenceUseCount(reference) === 1,
      );
      const staged: StagedAudio[] = [];
      let alreadyMissing = 0;
      try {
        for (const reference of exclusive) {
          try {
            staged.push({
              id: randomUUID(),
              reference,
              stagedName: await options.fileStore.stageDelete(reference),
            });
          } catch (error) {
            if (error instanceof FileStoreError && error.code === "file_not_found") {
              alreadyMissing += 1;
              continue;
            }
            throw error;
          }
        }
      } catch {
        await restore(staged);
        throw new ProgramDeletionError();
      }

      let clearedCurrent = false;
      try {
        clearedCurrent = options.programs.delete(
          profileId,
          programId,
          staged.map((audio) => ({
            ...audio,
            createdAt: new Date().toISOString(),
          })),
          beforeDelete,
        ).clearedCurrent;
      } catch {
        await restore(staged);
        throw new ProgramDeletionError();
      }

      let deletedAudioCount = alreadyMissing;
      let pendingCleanupCount = 0;
      for (const audio of staged) {
        try {
          await options.fileStore.finalizeDelete(audio.stagedName);
          deletePending.run(audio.id);
          deletedAudioCount += 1;
        } catch {
          failPending.run(audio.id);
          pendingCleanupCount += 1;
        }
      }
      return deleteProgramResponseSchema.parse({
        programId,
        clearedCurrentSession: clearedCurrent,
        deletedAudioCount,
        retainedAudioCount,
        pendingCleanupCount,
      });
    },
    async retryPendingCleanup() {
      const pending = listPending.all() as unknown as StagedAudio[];
      for (const audio of pending) {
        try {
          await options.fileStore.finalizeDelete(audio.stagedName);
          deletePending.run(audio.id);
        } catch {
          failPending.run(audio.id);
        }
      }
    },
  };
}
