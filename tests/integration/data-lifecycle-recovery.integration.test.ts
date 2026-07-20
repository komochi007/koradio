import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  copyDataRootForMigration,
  createDataRootMigrationService,
  defaultDataRootMigrationOperations,
  recordDataRootRestartFailure,
  verifyDataRootCopy,
  type CreateDataRootMigrationServiceOptions,
  type DataRootMigrationOperations,
  type DataRootRestartRequest,
} from "../../apps/server/src/modules/device-settings/data-root-migration.js";
import {
  createDeviceSettingsService,
  type DeviceSettingsService,
} from "../../apps/server/src/modules/device-settings/index.js";
import {
  bootstrapDatabase,
  type DatabaseContext,
} from "../../apps/server/src/platform/db/database.js";
import {
  readActiveDataRoot,
  readCurrentProfileId,
  writeActiveDataRoot,
  writeCurrentProfileId,
} from "../../apps/server/src/platform/db/data-root.js";
import { s6LegacyData } from "../fixtures/data-lifecycle.js";
import { seedS6LegacyData } from "../helpers/data-lifecycle.js";

type InjectedStage =
  | "backing_up"
  | "checkpointing"
  | "copying"
  | "pausing"
  | "restarting"
  | "switching"
  | "validating"
  | "verifying";

interface MigrationHarness {
  backupDataRoot(idempotencyKey: string): string;
  bootstrapPath: string;
  database: DatabaseContext;
  events: Array<{ stage: string; status: string }>;
  idempotencyKey: string;
  markerPath(root: string): string;
  service: ReturnType<typeof createDataRootMigrationService>;
  settings: DeviceSettingsService;
  sourceDataRoot: string;
  targetDataRoot: string;
}

async function waitForMigration(
  settings: DeviceSettingsService,
  idempotencyKey: string,
  status: "rolled_back" | "succeeded",
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const record = settings.getMigrationByIdempotencyKey(idempotencyKey);
    if (record?.status === status) {
      return record;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error(`Migration ${idempotencyKey} did not reach ${status}`);
}

async function createMigrationHarness(
  configure: (context: {
    operations: Partial<DataRootMigrationOperations>;
    runtimeCoordinator: NonNullable<CreateDataRootMigrationServiceOptions["runtimeCoordinator"]>;
    setRequestRestart: (
      requestRestart: NonNullable<CreateDataRootMigrationServiceOptions["requestRestart"]>,
    ) => void;
    sourceDataRoot: string;
    targetDataRoot: string;
  }) => Promise<void> = () => Promise.resolve(),
): Promise<MigrationHarness> {
  const parent = await mkdtemp(join(tmpdir(), "koradio-s6-data-lifecycle-"));
  const sourceDataRoot = join(parent, "source");
  const targetDataRoot = join(parent, "target");
  const bootstrapPath = join(parent, "bootstrap.json");
  await Promise.all([
    mkdir(sourceDataRoot, { mode: 0o700 }),
    mkdir(targetDataRoot, { mode: 0o700 }),
  ]);
  const database = await bootstrapDatabase({ dataRoot: sourceDataRoot });
  const settings = createDeviceSettingsService({
    client: database.client,
    dataRoot: sourceDataRoot,
  });
  settings.initialize();
  await writeFile(join(sourceDataRoot, "preserved.txt"), "source-data-must-remain");

  const operations: Partial<DataRootMigrationOperations> = {};
  const runtimeCoordinator = {
    checkpointPlayback: () => Promise.resolve(),
    pauseGenerationAndPlayback: () => Promise.resolve(),
  };
  let requestRestart: NonNullable<CreateDataRootMigrationServiceOptions["requestRestart"]> = () =>
    Promise.resolve();
  await configure({
    operations,
    runtimeCoordinator,
    setRequestRestart(value) {
      requestRestart = value;
    },
    sourceDataRoot,
    targetDataRoot,
  });

  const events: Array<{ stage: string; status: string }> = [];
  const idempotencyKey = `s6-data-lifecycle-${randomUUID()}`;
  const service = createDataRootMigrationService({
    bootstrapPath,
    checkpointDatabase: () => {
      database.client.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      return Promise.resolve();
    },
    deviceSettings: settings,
    operations,
    publish(event) {
      events.push({ stage: event.payload.stage, status: event.payload.status });
    },
    requestRestart,
    runtimeCoordinator,
    sourceDataRoot,
  });

  return {
    backupDataRoot(key) {
      const record = settings.getMigrationByIdempotencyKey(key);
      if (record === undefined) {
        throw new Error(`Migration ${key} does not exist`);
      }
      return record.backupDataRoot;
    },
    bootstrapPath,
    database,
    events,
    idempotencyKey,
    markerPath(root) {
      return join(root, "preserved.txt");
    },
    service,
    settings,
    sourceDataRoot,
    targetDataRoot,
  };
}

async function createStageFailureHarness(stage: InjectedStage): Promise<MigrationHarness> {
  let copyCalls = 0;
  let switchFailed = false;

  return createMigrationHarness(async (context) => {
    if (stage === "validating") {
      await writeFile(join(context.targetDataRoot, "existing.txt"), "do-not-remove");
    }
    if (stage === "pausing") {
      context.runtimeCoordinator.pauseGenerationAndPlayback = () =>
        Promise.reject(new Error("S6 pausing failure"));
    }
    if (stage === "checkpointing") {
      context.runtimeCoordinator.checkpointPlayback = () =>
        Promise.reject(new Error("S6 checkpoint failure"));
    }
    if (stage === "backing_up" || stage === "copying") {
      context.operations.copyAndVerify = async (source, destination, options) => {
        copyCalls += 1;
        if (
          (stage === "backing_up" && copyCalls === 1) ||
          (stage === "copying" && copyCalls === 2)
        ) {
          throw new Error(`S6 ${stage} failure`);
        }
        await defaultDataRootMigrationOperations.copyAndVerify(source, destination, options);
      };
    }
    if (stage === "verifying") {
      context.operations.verifyTargetDatabase = () =>
        Promise.reject(new Error("S6 verifying failure"));
    }
    if (stage === "switching") {
      context.operations.writeActiveDataRoot = async (bootstrapPath, dataRoot) => {
        if (dataRoot === context.targetDataRoot && !switchFailed) {
          switchFailed = true;
          throw new Error("S6 switching failure");
        }
        await defaultDataRootMigrationOperations.writeActiveDataRoot(bootstrapPath, dataRoot);
      };
    }
    if (stage === "restarting") {
      context.setRequestRestart(() => Promise.reject(new Error("S6 restarting failure")));
    }
  });
}

function readLegacySnapshot(client: DatabaseSync) {
  return {
    checkpoint: client
      .prepare(
        `
          SELECT position_ms, lease_epoch, status
          FROM playback_checkpoint
          WHERE profile_id = ?
        `,
      )
      .get(s6LegacyData.profileId),
    profile: client
      .prepare(
        `
          SELECT radio_name, nickname, avatar_ref
          FROM profile
          WHERE id = ?
        `,
      )
      .get(s6LegacyData.profileId),
    program: client
      .prepare("SELECT title, scenario_text FROM program WHERE id = ?")
      .get(s6LegacyData.programId),
  };
}

describe("S6-02 data lifecycle, migration and recovery matrix", () => {
  it.each<InjectedStage>([
    "validating",
    "pausing",
    "checkpointing",
    "backing_up",
    "copying",
    "verifying",
    "switching",
    "restarting",
  ])("rolls back %s failures without deleting preserved roots", async (stage) => {
    const harness = await createStageFailureHarness(stage);
    const started = harness.service.create(
      { targetDataRoot: harness.targetDataRoot },
      harness.idempotencyKey,
    );
    const record = await waitForMigration(harness.settings, harness.idempotencyKey, "rolled_back");

    expect(started.created).toBe(true);
    expect(record).toMatchObject({
      jobId: started.jobId,
      stage: "rolling_back",
      status: "rolled_back",
    });
    expect(harness.events).toContainEqual({ stage, status: "running" });
    expect(harness.events.at(-1)).toEqual({ stage: "rolling_back", status: "rolled_back" });
    expect(await readActiveDataRoot(harness.sourceDataRoot, harness.bootstrapPath)).toBe(
      harness.sourceDataRoot,
    );
    expect(await readFile(harness.markerPath(harness.sourceDataRoot), "utf8")).toBe(
      "source-data-must-remain",
    );
    expect((await stat(harness.targetDataRoot)).isDirectory()).toBe(true);

    if (["copying", "verifying", "switching", "restarting"].includes(stage)) {
      const backupDataRoot = harness.backupDataRoot(harness.idempotencyKey);
      expect(await readFile(harness.markerPath(backupDataRoot), "utf8")).toBe(
        "source-data-must-remain",
      );
    }
    if (["verifying", "switching", "restarting"].includes(stage)) {
      expect(await readFile(harness.markerPath(harness.targetDataRoot), "utf8")).toBe(
        "source-data-must-remain",
      );
    }
    if (stage === "validating") {
      expect(await readFile(join(harness.targetDataRoot, "existing.txt"), "utf8")).toBe(
        "do-not-remove",
      );
    }

    harness.database.close();
  });

  it("detects a real SHA-256 backup mismatch and preserves the corrupted backup", async () => {
    let copyCalls = 0;
    const harness = await createMigrationHarness((context) => {
      context.operations.copyAndVerify = async (source, destination, options) => {
        copyCalls += 1;
        await copyDataRootForMigration(source, destination, options);
        if (copyCalls === 1) {
          await writeFile(join(destination, "preserved.txt"), "tampered-after-copy");
        }
        await verifyDataRootCopy(source, destination);
      };
      return Promise.resolve();
    });
    harness.service.create({ targetDataRoot: harness.targetDataRoot }, harness.idempotencyKey);
    const record = await waitForMigration(harness.settings, harness.idempotencyKey, "rolled_back");
    const backupDataRoot = harness.backupDataRoot(harness.idempotencyKey);

    expect(record.errorCode).toBe("COPY_VERIFICATION_FAILED");
    expect(await readActiveDataRoot(harness.sourceDataRoot, harness.bootstrapPath)).toBe(
      harness.sourceDataRoot,
    );
    expect(await readFile(harness.markerPath(harness.sourceDataRoot), "utf8")).toBe(
      "source-data-must-remain",
    );
    expect(await readFile(harness.markerPath(backupDataRoot), "utf8")).toBe("tampered-after-copy");
    expect((await stat(backupDataRoot)).isDirectory()).toBe(true);
    harness.database.close();
  });

  it("restarts from the migrated root and returns the same job for a repeated command", async () => {
    let resolveRestart: ((request: DataRootRestartRequest) => void) | undefined;
    const restartRequested = new Promise<DataRootRestartRequest>((resolve) => {
      resolveRestart = resolve;
    });
    const harness = await createMigrationHarness((context) => {
      context.setRequestRestart((request) => {
        resolveRestart?.(request);
        return Promise.resolve();
      });
      return Promise.resolve();
    });
    await seedS6LegacyData(harness.database.client, harness.sourceDataRoot);
    await writeCurrentProfileId(
      harness.bootstrapPath,
      harness.sourceDataRoot,
      s6LegacyData.profileId,
    );

    const first = harness.service.create(
      { targetDataRoot: harness.targetDataRoot },
      harness.idempotencyKey,
    );
    await waitForMigration(harness.settings, harness.idempotencyKey, "succeeded");
    const restartRequest = await restartRequested;
    const repeated = harness.service.create(
      { targetDataRoot: harness.targetDataRoot },
      harness.idempotencyKey,
    );
    const backupDataRoot = harness.backupDataRoot(harness.idempotencyKey);
    harness.database.close();

    expect(repeated).toEqual({ created: false, jobId: first.jobId });
    expect(restartRequest).toMatchObject({
      jobId: first.jobId,
      previousDataRoot: harness.sourceDataRoot,
      targetDataRoot: harness.targetDataRoot,
    });
    expect(await readActiveDataRoot(harness.sourceDataRoot, harness.bootstrapPath)).toBe(
      harness.targetDataRoot,
    );
    expect(await readCurrentProfileId(harness.sourceDataRoot, harness.bootstrapPath)).toBe(
      s6LegacyData.profileId,
    );

    const restarted = await bootstrapDatabase({
      dataRoot: await readActiveDataRoot(harness.sourceDataRoot, harness.bootstrapPath),
    });
    try {
      expect(readLegacySnapshot(restarted.client)).toEqual({
        checkpoint: { position_ms: 12_345, lease_epoch: 4, status: "paused" },
        profile: {
          radio_name: "Legacy Signals",
          nickname: "Legacy",
          avatar_ref: s6LegacyData.avatarRef,
        },
        program: { title: "Legacy Session", scenario_text: "旧版本恢复场景" },
      });
      expect(
        await readFile(
          join(restarted.dataRoot, "files", ...s6LegacyData.avatarRef.split("/")),
          "utf8",
        ),
      ).toBe("s6-legacy-avatar-bytes");
    } finally {
      restarted.close();
    }
    expect((await stat(harness.sourceDataRoot)).isDirectory()).toBe(true);
    expect((await stat(backupDataRoot)).isDirectory()).toBe(true);
  });

  it("recovers the original root when the post-switch service restart fails", async () => {
    let resolveRestart: ((request: DataRootRestartRequest) => void) | undefined;
    const restartRequested = new Promise<DataRootRestartRequest>((resolve) => {
      resolveRestart = resolve;
    });
    const harness = await createMigrationHarness((context) => {
      context.setRequestRestart((request) => {
        resolveRestart?.(request);
        return Promise.resolve();
      });
      return Promise.resolve();
    });
    await seedS6LegacyData(harness.database.client, harness.sourceDataRoot);
    await writeCurrentProfileId(
      harness.bootstrapPath,
      harness.sourceDataRoot,
      s6LegacyData.profileId,
    );
    harness.service.create({ targetDataRoot: harness.targetDataRoot }, harness.idempotencyKey);
    await waitForMigration(harness.settings, harness.idempotencyKey, "succeeded");
    const restartRequest = await restartRequested;
    const backupDataRoot = harness.backupDataRoot(harness.idempotencyKey);
    harness.database.close();

    await writeActiveDataRoot(harness.bootstrapPath, harness.sourceDataRoot);
    await recordDataRootRestartFailure(restartRequest);

    expect(await readActiveDataRoot(harness.sourceDataRoot, harness.bootstrapPath)).toBe(
      harness.sourceDataRoot,
    );
    expect(await readCurrentProfileId(harness.sourceDataRoot, harness.bootstrapPath)).toBe(
      s6LegacyData.profileId,
    );
    const recovered = await bootstrapDatabase({ dataRoot: harness.sourceDataRoot });
    try {
      expect(readLegacySnapshot(recovered.client).profile).toEqual({
        radio_name: "Legacy Signals",
        nickname: "Legacy",
        avatar_ref: s6LegacyData.avatarRef,
      });
      expect(
        recovered.client
          .prepare(
            "SELECT status, stage, error_code FROM data_root_migration WHERE idempotency_key = ?",
          )
          .get(harness.idempotencyKey),
      ).toEqual({
        status: "rolled_back",
        stage: "rolling_back",
        error_code: "SERVICE_RESTART_FAILED",
      });
    } finally {
      recovered.close();
    }
    expect((await stat(harness.targetDataRoot)).isDirectory()).toBe(true);
    expect((await stat(backupDataRoot)).isDirectory()).toBe(true);
    expect(
      await readFile(join(backupDataRoot, "files", ...s6LegacyData.avatarRef.split("/")), "utf8"),
    ).toBe("s6-legacy-avatar-bytes");
  });
});
