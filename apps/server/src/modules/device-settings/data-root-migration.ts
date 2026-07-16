import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, chmod, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  dataRootMigrationStageChangedEventSchema,
  type CreateDataRootMigrationCommand,
  type DataRootMigrationStage,
  type DataRootMigrationStageChangedEvent,
  type DataRootMigrationStatus,
} from "@koradio/contracts";

import { bootstrapDatabase } from "../../platform/db/database.js";
import { writeActiveDataRoot } from "../../platform/db/data-root.js";
import {
  createDeviceSettingsService,
  type DataRootMigrationRecord,
  type DeviceSettingsService,
} from "./index.js";

const transientDatabaseFiles = new Set(["koradio.sqlite-shm", "koradio.sqlite-wal"]);

interface ManifestEntry {
  path: string;
  sha256: string;
  size: number;
}

export interface DataRootMigrationRuntimeCoordinator {
  checkpointPlayback: () => Promise<void>;
  pauseGenerationAndPlayback: () => Promise<void>;
}

export interface DataRootRestartRequest {
  bootstrapPath: string;
  jobId: string;
  previousDataRoot: string;
  targetDataRoot: string;
}

export interface CreateDataRootMigrationServiceOptions {
  bootstrapPath: string;
  checkpointDatabase?: () => Promise<void>;
  deviceSettings: DeviceSettingsService;
  now?: () => Date;
  publish: (event: DataRootMigrationStageChangedEvent) => void;
  requestRestart?: (request: DataRootRestartRequest) => Promise<void>;
  runtimeCoordinator?: DataRootMigrationRuntimeCoordinator;
  sourceDataRoot: string;
}

export interface DataRootMigrationService {
  create(
    command: CreateDataRootMigrationCommand,
    idempotencyKey: string,
  ): {
    created: boolean;
    jobId: string;
  };
}

export async function recordDataRootRestartFailure(request: DataRootRestartRequest): Promise<void> {
  for (const dataRoot of [request.previousDataRoot, request.targetDataRoot]) {
    try {
      const database = await bootstrapDatabase({ dataRoot });

      try {
        const settings = createDeviceSettingsService({
          client: database.client,
          dataRoot,
        });
        settings.initialize();
        settings.updateDataRoot(request.previousDataRoot);
        settings.updateMigration(request.jobId, {
          stage: "rolling_back",
          status: "rolled_back",
          errorCode: "SERVICE_RESTART_FAILED",
        });
      } finally {
        database.close();
      }
    } catch {
      // Both preserved roots remain available even if one status record cannot be updated.
    }
  }
}

export class DataRootMigrationConflictError extends Error {
  constructor(readonly jobId: string) {
    super("Another data root migration is already running");
    this.name = "DataRootMigrationConflictError";
  }
}

class MigrationFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MigrationFailure";
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new MigrationFailure("DATA_ROOT_READ_FAILED", "Data root file could not be read");
    }

    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function createManifest(root: string): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];

  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });

    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      if (transientDatabaseFiles.has(child.name)) {
        continue;
      }

      const path = join(directory, child.name);

      if (child.isSymbolicLink()) {
        throw new MigrationFailure(
          "DATA_ROOT_UNSAFE_ENTRY",
          "Data root migration does not copy symbolic links",
        );
      }

      if (child.isDirectory()) {
        await visit(path);
        continue;
      }

      if (!child.isFile()) {
        throw new MigrationFailure(
          "DATA_ROOT_UNSAFE_ENTRY",
          "Data root migration only copies regular files",
        );
      }

      const metadata = await stat(path);
      entries.push({
        path: relative(root, path),
        sha256: await hashFile(path),
        size: metadata.size,
      });
    }
  }

  await visit(root);
  return entries;
}

async function copyDirectory(
  source: string,
  destination: string,
  options: { destinationExists?: boolean } = {},
): Promise<void> {
  if (options.destinationExists !== true) {
    await mkdir(destination, { mode: 0o700 });
  }
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    if (transientDatabaseFiles.has(entry.name)) {
      continue;
    }

    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);

    if (entry.isSymbolicLink()) {
      throw new MigrationFailure(
        "DATA_ROOT_UNSAFE_ENTRY",
        "Data root migration does not copy symbolic links",
      );
    }

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }

    if (!entry.isFile()) {
      throw new MigrationFailure(
        "DATA_ROOT_UNSAFE_ENTRY",
        "Data root migration only copies regular files",
      );
    }

    await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
    if (process.platform !== "win32") {
      await chmod(destinationPath, (await stat(sourcePath)).mode & 0o777);
    }
  }
}

async function copyAndVerify(
  source: string,
  destination: string,
  options: { destinationExists?: boolean } = {},
): Promise<void> {
  const sourceManifest = await createManifest(source);
  await copyDirectory(source, destination, options);
  const destinationManifest = await createManifest(destination);

  if (JSON.stringify(destinationManifest) !== JSON.stringify(sourceManifest)) {
    throw new MigrationFailure(
      "COPY_VERIFICATION_FAILED",
      "Copied data root did not match the source manifest",
    );
  }
}

async function validateTarget(sourceDataRoot: string, targetDataRoot: string): Promise<string> {
  if (!isAbsolute(targetDataRoot)) {
    throw new MigrationFailure(
      "TARGET_DATA_ROOT_INVALID",
      "Target data root must be an absolute path",
    );
  }

  const resolvedSource = resolve(sourceDataRoot);
  const resolvedTarget = resolve(targetDataRoot);
  const targetRelativePath = relative(resolvedSource, resolvedTarget);

  if (
    resolvedTarget === resolvedSource ||
    (targetRelativePath !== ".." && !targetRelativePath.startsWith(`..${sep}`))
  ) {
    throw new MigrationFailure(
      "TARGET_DATA_ROOT_INVALID",
      "Target data root must be outside the current data root",
    );
  }

  const metadata = await stat(resolvedTarget);
  if (!metadata.isDirectory()) {
    throw new MigrationFailure("TARGET_DATA_ROOT_INVALID", "Target data root must be a directory");
  }

  await access(resolvedTarget, constants.R_OK | constants.W_OK);
  if ((await readdir(resolvedTarget)).length > 0) {
    throw new MigrationFailure("TARGET_DATA_ROOT_NOT_EMPTY", "Target data root must be empty");
  }

  return resolvedTarget;
}

function resolveFailureCode(error: unknown): string {
  if (error instanceof MigrationFailure) {
    return error.code;
  }

  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    if (error.code === "EEXIST") {
      return "MIGRATION_DESTINATION_EXISTS";
    }
    if (error.code === "EACCES" || error.code === "EPERM") {
      return "DATA_ROOT_PERMISSION_DENIED";
    }
  }

  return "DATA_ROOT_MIGRATION_FAILED";
}

export function createDataRootMigrationService(
  options: CreateDataRootMigrationServiceOptions,
): DataRootMigrationService {
  const now = options.now ?? (() => new Date());
  const runtimeCoordinator = options.runtimeCoordinator ?? {
    checkpointPlayback: () => Promise.resolve(),
    pauseGenerationAndPlayback: () => Promise.resolve(),
  };
  const requestRestart = options.requestRestart ?? (() => Promise.resolve());
  const checkpointDatabase = options.checkpointDatabase ?? (() => Promise.resolve());
  const runningJobs = new Set<string>();
  let sequence = 0;

  function publish(
    record: DataRootMigrationRecord,
    stage: DataRootMigrationStage,
    status: DataRootMigrationStatus,
    errorCode?: string,
  ): void {
    options.publish(
      dataRootMigrationStageChangedEventSchema.parse({
        eventId: randomUUID(),
        eventType: "data_root_migration.stage_changed",
        version: 1,
        correlationId: record.jobId,
        sequence,
        occurredAt: now().toISOString(),
        payload: {
          jobId: record.jobId,
          stage,
          status,
          ...(errorCode === undefined ? {} : { errorCode }),
        },
      }),
    );
    sequence += 1;
  }

  function updateSource(
    record: DataRootMigrationRecord,
    stage: DataRootMigrationStage,
    status: DataRootMigrationStatus,
    errorCode?: string,
  ): DataRootMigrationRecord {
    const updated = options.deviceSettings.updateMigration(record.jobId, {
      stage,
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
    publish(updated, stage, status, errorCode);
    return updated;
  }

  async function updateTarget(
    targetDataRoot: string,
    record: DataRootMigrationRecord,
    stage: DataRootMigrationStage,
    status: DataRootMigrationStatus,
    errorCode?: string,
  ): Promise<void> {
    const targetDatabase = await bootstrapDatabase({ dataRoot: targetDataRoot });

    try {
      const targetSettings = createDeviceSettingsService({
        client: targetDatabase.client,
        dataRoot: targetDataRoot,
        now,
      });
      targetSettings.initialize();
      targetSettings.updateDataRoot(targetDataRoot);
      targetSettings.updateMigration(record.jobId, {
        stage,
        status,
        ...(errorCode === undefined ? {} : { errorCode }),
      });
    } finally {
      targetDatabase.close();
    }
  }

  async function rollback(
    record: DataRootMigrationRecord,
    targetDataRoot: string | undefined,
    errorCode: string,
  ): Promise<void> {
    updateSource(record, "rolling_back", "running", errorCode);
    await writeActiveDataRoot(options.bootstrapPath, options.sourceDataRoot);
    options.deviceSettings.updateDataRoot(options.sourceDataRoot);

    if (targetDataRoot !== undefined) {
      try {
        await updateTarget(targetDataRoot, record, "rolling_back", "rolled_back", errorCode);
      } catch {
        // The preserved partial target remains available for manual inspection.
      }
    }

    updateSource(record, "rolling_back", "rolled_back", errorCode);
  }

  async function run(record: DataRootMigrationRecord): Promise<void> {
    let targetDataRoot: string | undefined;

    try {
      let current = updateSource(record, "validating", "running");
      targetDataRoot = await validateTarget(options.sourceDataRoot, record.targetDataRoot);

      current = updateSource(current, "pausing", "running");
      await runtimeCoordinator.pauseGenerationAndPlayback();

      current = updateSource(current, "checkpointing", "running");
      await runtimeCoordinator.checkpointPlayback();

      current = updateSource(current, "backing_up", "running");
      await checkpointDatabase();
      await copyAndVerify(options.sourceDataRoot, record.backupDataRoot);

      current = updateSource(current, "copying", "running");
      await checkpointDatabase();
      await copyAndVerify(options.sourceDataRoot, targetDataRoot, {
        destinationExists: true,
      });

      current = updateSource(current, "verifying", "running");
      const targetDatabase = await bootstrapDatabase({ dataRoot: targetDataRoot });
      targetDatabase.close();

      current = updateSource(current, "switching", "running");
      options.deviceSettings.updateDataRoot(targetDataRoot);
      await updateTarget(targetDataRoot, current, "switching", "running");
      await writeActiveDataRoot(options.bootstrapPath, targetDataRoot);

      current = updateSource(current, "restarting", "running");
      await updateTarget(targetDataRoot, current, "restarting", "running");
      current = updateSource(current, "completed", "succeeded");
      await updateTarget(targetDataRoot, current, "completed", "succeeded");
      await requestRestart({
        bootstrapPath: options.bootstrapPath,
        jobId: current.jobId,
        previousDataRoot: options.sourceDataRoot,
        targetDataRoot,
      });
    } catch (error) {
      await rollback(record, targetDataRoot, resolveFailureCode(error));
    } finally {
      runningJobs.delete(record.jobId);
    }
  }

  return {
    create(command, idempotencyKey) {
      const existing = options.deviceSettings.getMigrationByIdempotencyKey(idempotencyKey);
      if (existing !== undefined) {
        return {
          created: false,
          jobId: existing.jobId,
        };
      }

      const active = options.deviceSettings.getActiveMigration();
      if (active !== undefined) {
        throw new DataRootMigrationConflictError(active.jobId);
      }

      const targetDataRoot = command.targetDataRoot;
      const jobId = randomUUID();
      const backupDataRoot = join(
        dirname(options.sourceDataRoot),
        `${basename(options.sourceDataRoot)}.backup-${jobId}`,
      );
      const result = options.deviceSettings.createMigration({
        backupDataRoot,
        idempotencyKey,
        jobId,
        targetDataRoot,
      });

      if (result.created && !runningJobs.has(result.record.jobId)) {
        runningJobs.add(result.record.jobId);
        void run(result.record);
      }

      return {
        created: result.created,
        jobId: result.record.jobId,
      };
    },
  };
}
