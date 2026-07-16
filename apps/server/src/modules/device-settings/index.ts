import {
  dataRootMigrationSnapshotSchema,
  deviceSettingsSchema,
  type DataRootMigrationSnapshot,
  type DataRootMigrationStage,
  type DataRootMigrationStatus,
  type DeviceSettings,
  type UpdateDeviceSettingsCommand,
} from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";

interface DeviceSettingsRow {
  data_root: string;
  codex_command: string | null;
  updated_at: string;
}

export interface DataRootMigrationRecord extends DataRootMigrationSnapshot {
  backupDataRoot: string;
  createdAt: string;
  idempotencyKey: string;
  targetDataRoot: string;
}

interface DataRootMigrationRow {
  job_id: string;
  idempotency_key: string;
  target_data_root: string;
  backup_data_root: string;
  stage: string;
  status: string;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDeviceSettingsServiceOptions {
  client: DatabaseSync;
  dataRoot: string;
  now?: () => Date;
}

export interface CreateDataRootMigrationRecord {
  backupDataRoot: string;
  idempotencyKey: string;
  jobId: string;
  targetDataRoot: string;
}

export interface UpdateDataRootMigrationRecord {
  errorCode?: string;
  stage: DataRootMigrationStage;
  status: DataRootMigrationStatus;
}

export interface DeviceSettingsService {
  createMigration(record: CreateDataRootMigrationRecord): {
    created: boolean;
    record: DataRootMigrationRecord;
  };
  get(): DeviceSettings;
  getActiveMigration(): DataRootMigrationRecord | undefined;
  getMigrationByIdempotencyKey(idempotencyKey: string): DataRootMigrationRecord | undefined;
  initialize(): DeviceSettings;
  update(command: UpdateDeviceSettingsCommand): DeviceSettings;
  updateDataRoot(dataRoot: string): DeviceSettings;
  updateMigration(jobId: string, update: UpdateDataRootMigrationRecord): DataRootMigrationRecord;
}

function mapSettingsRow(row: DeviceSettingsRow): DeviceSettings {
  return deviceSettingsSchema.parse({
    dataRoot: row.data_root,
    codexCommand: row.codex_command,
    updatedAt: row.updated_at,
  });
}

function mapMigrationRow(row: DataRootMigrationRow): DataRootMigrationRecord {
  const snapshot = dataRootMigrationSnapshotSchema.parse({
    jobId: row.job_id,
    stage: row.stage,
    status: row.status,
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    updatedAt: row.updated_at,
  });

  return {
    ...snapshot,
    backupDataRoot: row.backup_data_root,
    createdAt: row.created_at,
    idempotencyKey: row.idempotency_key,
    targetDataRoot: row.target_data_root,
  };
}

export function createDeviceSettingsService(
  options: CreateDeviceSettingsServiceOptions,
): DeviceSettingsService {
  const now = options.now ?? (() => new Date());
  const insertDefaults = options.client.prepare(`
    INSERT INTO device_settings (id, data_root, codex_command, updated_at)
    VALUES (1, ?, NULL, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const selectSettings = options.client.prepare(`
    SELECT data_root, codex_command, updated_at
    FROM device_settings
    WHERE id = 1
  `);
  const updateCodexCommand = options.client.prepare(`
    UPDATE device_settings
    SET codex_command = ?, updated_at = ?
    WHERE id = 1
  `);
  const updateDataRoot = options.client.prepare(`
    UPDATE device_settings
    SET data_root = ?, updated_at = ?
    WHERE id = 1
  `);
  const insertMigration = options.client.prepare(`
    INSERT INTO data_root_migration (
      job_id,
      idempotency_key,
      target_data_root,
      backup_data_root,
      stage,
      status,
      error_code,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'validating', 'queued', NULL, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `);
  const selectMigrationByIdempotencyKey = options.client.prepare(`
    SELECT
      job_id,
      idempotency_key,
      target_data_root,
      backup_data_root,
      stage,
      status,
      error_code,
      created_at,
      updated_at
    FROM data_root_migration
    WHERE idempotency_key = ?
  `);
  const selectMigrationByJobId = options.client.prepare(`
    SELECT
      job_id,
      idempotency_key,
      target_data_root,
      backup_data_root,
      stage,
      status,
      error_code,
      created_at,
      updated_at
    FROM data_root_migration
    WHERE job_id = ?
  `);
  const selectActiveMigration = options.client.prepare(`
    SELECT
      job_id,
      idempotency_key,
      target_data_root,
      backup_data_root,
      stage,
      status,
      error_code,
      created_at,
      updated_at
    FROM data_root_migration
    WHERE status IN ('queued', 'running')
    ORDER BY created_at
    LIMIT 1
  `);
  const updateMigration = options.client.prepare(`
    UPDATE data_root_migration
    SET stage = ?, status = ?, error_code = ?, updated_at = ?
    WHERE job_id = ?
  `);

  function initialize(): DeviceSettings {
    insertDefaults.run(options.dataRoot, now().toISOString());
    return get();
  }

  function get(): DeviceSettings {
    const row = selectSettings.get() as DeviceSettingsRow | undefined;

    if (row === undefined) {
      throw new Error("Device settings have not been initialized");
    }

    return mapSettingsRow(row);
  }

  function getMigrationByIdempotencyKey(
    idempotencyKey: string,
  ): DataRootMigrationRecord | undefined {
    const row = selectMigrationByIdempotencyKey.get(idempotencyKey) as
      DataRootMigrationRow | undefined;
    return row === undefined ? undefined : mapMigrationRow(row);
  }

  return {
    createMigration(record) {
      const timestamp = now().toISOString();
      const result = insertMigration.run(
        record.jobId,
        record.idempotencyKey,
        record.targetDataRoot,
        record.backupDataRoot,
        timestamp,
        timestamp,
      );
      const stored = getMigrationByIdempotencyKey(record.idempotencyKey);

      if (stored === undefined) {
        throw new Error("Data root migration could not be created");
      }

      return {
        created: result.changes === 1,
        record: stored,
      };
    },
    get,
    getActiveMigration() {
      const row = selectActiveMigration.get() as DataRootMigrationRow | undefined;
      return row === undefined ? undefined : mapMigrationRow(row);
    },
    getMigrationByIdempotencyKey,
    initialize,
    update(command) {
      if (command.codexCommand === undefined) {
        throw new Error("Codex command is required");
      }

      updateCodexCommand.run(command.codexCommand, now().toISOString());
      return get();
    },
    updateDataRoot(dataRoot) {
      updateDataRoot.run(dataRoot, now().toISOString());
      return get();
    },
    updateMigration(jobId, update) {
      updateMigration.run(
        update.stage,
        update.status,
        update.errorCode ?? null,
        now().toISOString(),
        jobId,
      );
      const row = selectMigrationByJobId.get(jobId) as DataRootMigrationRow | undefined;

      if (row === undefined) {
        throw new Error("Data root migration does not exist");
      }

      return mapMigrationRow(row);
    },
  };
}
