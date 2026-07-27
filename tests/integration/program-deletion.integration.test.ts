import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import {
  createProgramDeletionService,
  type ProgramRepository,
  type ProgramService,
} from "../../apps/server/src/modules/programs/index.js";
import { FileStoreError, type LocalFileStore } from "../../apps/server/src/platform/files/index.js";

function database(): DatabaseSync {
  const client = new DatabaseSync(":memory:");
  client.exec(`
    CREATE TABLE pending_file_cleanup (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      staged_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )
  `);
  return client;
}

describe("Program deletion orchestration", () => {
  it("restores every staged audio file when later staging fails", async () => {
    const client = database();
    const staged: string[] = [];
    const restored: string[] = [];
    const fileStore = {
      stageDelete: vi.fn((reference: string) => {
        if (reference.endsWith("2.wav")) {
          return Promise.reject(new FileStoreError("storage_unavailable"));
        }
        staged.push(reference);
        return Promise.resolve("00000000-0000-4000-8000-000000000099");
      }),
      restoreDelete: vi.fn((reference: string) => {
        restored.push(reference);
        return Promise.resolve();
      }),
    } as unknown as LocalFileStore;
    const repository = {
      has: () => true,
      ttsReferences: () => [
        "tts/00000000-0000-4000-8000-000000000001.wav",
        "tts/00000000-0000-4000-8000-000000000002.wav",
      ],
      ttsReferenceUseCount: () => 1,
    } as unknown as ProgramRepository;
    const deleteProgram = vi.fn();
    const programs = { delete: deleteProgram } as unknown as ProgramService;
    const service = createProgramDeletionService({ client, fileStore, programs, repository });

    await expect(
      service.delete(
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000020",
      ),
    ).rejects.toThrow("Program could not be deleted");
    expect(staged).toHaveLength(1);
    expect(restored).toEqual(staged);
    expect(deleteProgram).not.toHaveBeenCalled();
    client.close();
  });

  it("restores staged audio when the database transaction rolls back", async () => {
    const client = database();
    const restoreDelete = vi.fn(() => Promise.resolve());
    const fileStore = {
      stageDelete: () => Promise.resolve("00000000-0000-4000-8000-000000000099"),
      restoreDelete,
    } as unknown as LocalFileStore;
    const reference = "tts/00000000-0000-4000-8000-000000000001.wav";
    const repository = {
      has: () => true,
      ttsReferences: () => [reference],
      ttsReferenceUseCount: () => 1,
    } as unknown as ProgramRepository;
    const programs = {
      delete: () => {
        throw new Error("database rollback");
      },
    } as unknown as ProgramService;
    const service = createProgramDeletionService({ client, fileStore, programs, repository });

    await expect(
      service.delete(
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000020",
      ),
    ).rejects.toThrow("Program could not be deleted");
    expect(restoreDelete).toHaveBeenCalledWith(reference, "00000000-0000-4000-8000-000000000099");
    client.close();
  });

  it("records final cleanup failures and retries them on startup", async () => {
    const client = database();
    let finalizationFails = true;
    const finalizeDelete = vi.fn(() =>
      finalizationFails
        ? Promise.reject(new FileStoreError("storage_unavailable"))
        : Promise.resolve(),
    );
    const fileStore = {
      stageDelete: () => Promise.resolve("00000000-0000-4000-8000-000000000099"),
      finalizeDelete,
    } as unknown as LocalFileStore;
    const reference = "tts/00000000-0000-4000-8000-000000000001.wav";
    const repository = {
      has: () => true,
      ttsReferences: () => [reference],
      ttsReferenceUseCount: () => 1,
    } as unknown as ProgramRepository;
    const programs = {
      delete: (
        _profileId: string,
        _programId: string,
        cleanup: Array<{
          createdAt: string;
          id: string;
          reference: string;
          stagedName: string;
        }>,
      ) => {
        for (const record of cleanup) {
          client
            .prepare(
              "INSERT INTO pending_file_cleanup (id, reference, staged_name, created_at) VALUES (?, ?, ?, ?)",
            )
            .run(record.id, record.reference, record.stagedName, record.createdAt);
        }
        return { clearedCurrent: true };
      },
    } as unknown as ProgramService;
    const service = createProgramDeletionService({ client, fileStore, programs, repository });

    await expect(
      service.delete(
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000020",
      ),
    ).resolves.toMatchObject({ pendingCleanupCount: 1, deletedAudioCount: 0 });
    expect(client.prepare("SELECT COUNT(*) AS count FROM pending_file_cleanup").get()).toEqual({
      count: 1,
    });

    finalizationFails = false;
    await service.retryPendingCleanup();
    expect(client.prepare("SELECT COUNT(*) AS count FROM pending_file_cleanup").get()).toEqual({
      count: 0,
    });
    expect(finalizeDelete).toHaveBeenCalledTimes(2);
    client.close();
  });
});
