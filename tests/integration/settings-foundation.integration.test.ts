import {
  deviceSettingsSchema,
  errorEnvelopeSchema,
  jobAcceptedResponseSchema,
  profileSchema,
  profilePreferencesSchema,
  serviceHealthListResponseSchema,
  sessionBootstrapResponseSchema,
  type SessionBootstrapResponse,
} from "@koradio/contracts";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import { recordDataRootRestartFailure } from "../../apps/server/src/modules/device-settings/data-root-migration.js";
import {
  readActiveDataRoot,
  writeActiveDataRoot,
} from "../../apps/server/src/platform/db/data-root.js";

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

interface TestAppContext {
  app: Awaited<ReturnType<typeof createApp>>;
  bootstrapPath: string;
  parent: string;
  sourceDataRoot: string;
  targetDataRoot: string;
}

async function createTestApp(
  options: Omit<Parameters<typeof createApp>[0], "config" | "selectedPort"> = {},
): Promise<TestAppContext> {
  const parent = await mkdtemp(join(tmpdir(), "koradio-settings-foundation-"));
  const sourceDataRoot = join(parent, "source");
  const targetDataRoot = join(parent, "target");
  const bootstrapPath = join(parent, "bootstrap.json");
  await Promise.all([
    mkdir(sourceDataRoot, { mode: 0o700 }),
    mkdir(targetDataRoot, { mode: 0o700 }),
  ]);
  const config: RuntimeConfig = {
    environment: "test",
    host: "127.0.0.1",
    port: 49373,
    webPort: 5173,
    providerMode: "mock",
    strictPort: true,
    dataRoot: sourceDataRoot,
    initialDataRoot: sourceDataRoot,
    dataRootBootstrapPath: bootstrapPath,
    webRoot: "unused-in-test",
  };
  const app = await createApp({
    config,
    selectedPort: config.port,
    ...options,
  });
  openApps.push(app);

  return {
    app,
    bootstrapPath,
    parent,
    sourceDataRoot,
    targetDataRoot,
  };
}

async function bootstrapSession(
  app: Awaited<ReturnType<typeof createApp>>,
): Promise<SessionBootstrapResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/session/bootstrap",
    headers: { origin },
  });
  expect(response.statusCode).toBe(200);
  return sessionBootstrapResponseSchema.parse(response.json<unknown>());
}

function authorizedHeaders(session: SessionBootstrapResponse): Record<string, string> {
  return {
    authorization: `Bearer ${session.accessToken}`,
    origin,
  };
}

async function createProfile(
  app: Awaited<ReturnType<typeof createApp>>,
  headers: Record<string, string>,
  idempotencyKey: string,
  radioName: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/profiles",
    headers: {
      ...headers,
      "idempotency-key": idempotencyKey,
    },
    payload: {
      radioName,
      nickname: "Klein",
    },
  });
  expect(response.statusCode).toBe(201);
  return profileSchema.parse(response.json<unknown>()).id;
}

async function waitForMigration(
  dataRoot: string,
  jobId: string,
  expectedStatus: "succeeded" | "rolled_back",
): Promise<{ error_code: string | null; stage: string; status: string }> {
  const databasePath = join(dataRoot, "koradio.sqlite");

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const database = new DatabaseSync(databasePath);

    try {
      const row = database
        .prepare(
          `
            SELECT stage, status, error_code
            FROM data_root_migration
            WHERE job_id = ?
          `,
        )
        .get(jobId) as { error_code: string | null; stage: string; status: string } | undefined;

      if (row?.status === expectedStatus) {
        return row;
      }
    } finally {
      database.close();
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(`Migration ${jobId} did not reach ${expectedStatus}`);
}

describe("S2-05 settings, health and data root foundation", () => {
  it("keeps device settings separate from profile preferences", async () => {
    const context = await createTestApp();
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);
    const profileOne = await createProfile(
      context.app,
      headers,
      "settings-profile-one",
      "Night Signals",
    );
    const profileTwo = await createProfile(
      context.app,
      headers,
      "settings-profile-two",
      "Morning Signals",
    );

    const initialDeviceResponse = await context.app.inject({
      method: "GET",
      url: "/api/v1/device-settings",
      headers,
    });
    expect(deviceSettingsSchema.parse(initialDeviceResponse.json<unknown>())).toMatchObject({
      dataRoot: context.sourceDataRoot,
      codexCommand: null,
    });

    const updateDeviceResponse = await context.app.inject({
      method: "PATCH",
      url: "/api/v1/device-settings",
      headers,
      payload: { codexCommand: "/opt/koradio/bin/codex" },
    });
    expect(deviceSettingsSchema.parse(updateDeviceResponse.json<unknown>())).toMatchObject({
      codexCommand: "/opt/koradio/bin/codex",
    });

    const firstDefaults = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profileOne}/preferences`,
      headers,
    });
    expect(profilePreferencesSchema.parse(firstDefaults.json<unknown>())).toMatchObject({
      profileId: profileOne,
      themeMode: "dark",
      djLanguage: "zh-CN",
      djVoiceStyle: "british-soft-radio",
    });

    const firstUpdated = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/${profileOne}/preferences`,
      headers,
      payload: { djLanguage: "en-GB", themeMode: "light" },
    });
    expect(profilePreferencesSchema.parse(firstUpdated.json<unknown>())).toMatchObject({
      profileId: profileOne,
      themeMode: "light",
      djLanguage: "en-GB",
    });

    const secondDefaults = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profileTwo}/preferences`,
      headers,
    });
    expect(profilePreferencesSchema.parse(secondDefaults.json<unknown>())).toMatchObject({
      profileId: profileTwo,
      themeMode: "dark",
      djLanguage: "zh-CN",
    });

    const deviceAfterPreferences = await context.app.inject({
      method: "GET",
      url: "/api/v1/device-settings",
      headers,
    });
    expect(deviceSettingsSchema.parse(deviceAfterPreferences.json<unknown>())).toMatchObject({
      codexCommand: "/opt/koradio/bin/codex",
    });
  });

  it("exposes redacted health while built-in providers remain read-only", async () => {
    const context = await createTestApp();
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);

    const invalidUpdate = await context.app.inject({
      method: "PATCH",
      url: "/api/v1/device-settings",
      headers,
      payload: {
        codexCommand: "codex",
        neteaseCookie: "secret-cookie",
        ttsEndpoint: "https://example.invalid",
      },
    });
    expect(invalidUpdate.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(invalidUpdate.json<unknown>())).toMatchObject({
      code: "DEVICE_SETTINGS_VALIDATION_FAILED",
    });

    const initialHealth = await context.app.inject({
      method: "GET",
      url: "/api/v1/health/services",
      headers,
    });
    const initialSnapshot = serviceHealthListResponseSchema.parse(initialHealth.json<unknown>());
    expect(initialSnapshot.items).toHaveLength(4);
    expect(initialSnapshot.items.find((item) => item.service === "codex")).toMatchObject({
      status: "unavailable",
      redactedSummary: "Codex command is not configured",
    });
    expect(JSON.stringify(initialSnapshot)).not.toContain(context.sourceDataRoot);
    expect(JSON.stringify(initialSnapshot)).not.toContain("cookie");

    await context.app.inject({
      method: "PATCH",
      url: "/api/v1/device-settings",
      headers,
      payload: { codexCommand: "/Users/private/bin/codex" },
    });
    const configuredHealth = await context.app.inject({
      method: "GET",
      url: "/api/v1/health/services",
      headers,
    });
    const configuredSnapshot = serviceHealthListResponseSchema.parse(
      configuredHealth.json<unknown>(),
    );
    expect(configuredSnapshot.items.find((item) => item.service === "codex")).toMatchObject({
      status: "available",
      redactedSummary: "Codex command is configured",
    });
    expect(JSON.stringify(configuredSnapshot)).not.toContain("/Users/private");
  });

  it("copies, verifies and atomically switches a migration with idempotent requests", async () => {
    let resolveRestart:
      | ((request: {
          bootstrapPath: string;
          jobId: string;
          previousDataRoot: string;
          targetDataRoot: string;
        }) => void)
      | undefined;
    const restartRequested = new Promise<{
      bootstrapPath: string;
      jobId: string;
      previousDataRoot: string;
      targetDataRoot: string;
    }>((resolve) => {
      resolveRestart = resolve;
    });
    const context = await createTestApp({
      requestRestart: (request) => {
        resolveRestart?.(request);
        return Promise.resolve();
      },
    });
    const session = await bootstrapSession(context.app);
    const headers = {
      ...authorizedHeaders(session),
      "idempotency-key": "migrate-settings-foundation-001",
    };
    await writeFile(join(context.sourceDataRoot, "preserved.txt"), "keep this data");

    const firstResponse = await context.app.inject({
      method: "POST",
      url: "/api/v1/device-settings/data-root-migrations",
      headers,
      payload: { targetDataRoot: context.targetDataRoot },
    });
    const secondResponse = await context.app.inject({
      method: "POST",
      url: "/api/v1/device-settings/data-root-migrations",
      headers,
      payload: { targetDataRoot: context.targetDataRoot },
    });
    const firstJob = jobAcceptedResponseSchema.parse(firstResponse.json<unknown>());
    const secondJob = jobAcceptedResponseSchema.parse(secondResponse.json<unknown>());

    expect(firstResponse.statusCode).toBe(202);
    expect(secondResponse.statusCode).toBe(202);
    expect(secondJob.jobId).toBe(firstJob.jobId);

    const restart = await restartRequested;
    expect(restart).toMatchObject({
      jobId: firstJob.jobId,
      previousDataRoot: context.sourceDataRoot,
      targetDataRoot: context.targetDataRoot,
    });
    expect(
      await waitForMigration(context.targetDataRoot, firstJob.jobId, "succeeded"),
    ).toMatchObject({
      stage: "completed",
      status: "succeeded",
    });
    expect(await readActiveDataRoot(context.sourceDataRoot, context.bootstrapPath)).toBe(
      context.targetDataRoot,
    );
    expect(await readFile(join(context.targetDataRoot, "preserved.txt"), "utf8")).toBe(
      "keep this data",
    );
    expect(await readFile(join(context.sourceDataRoot, "preserved.txt"), "utf8")).toBe(
      "keep this data",
    );

    const backupDataRoot = join(
      dirname(context.sourceDataRoot),
      `${basename(context.sourceDataRoot)}.backup-${firstJob.jobId}`,
    );
    expect((await stat(backupDataRoot)).isDirectory()).toBe(true);
    expect(await readFile(join(backupDataRoot, "preserved.txt"), "utf8")).toBe("keep this data");

    const targetDatabase = new DatabaseSync(join(context.targetDataRoot, "koradio.sqlite"));
    try {
      expect(
        targetDatabase
          .prepare("SELECT data_root, codex_command FROM device_settings WHERE id = 1")
          .get(),
      ).toEqual({
        data_root: context.targetDataRoot,
        codex_command: null,
      });
    } finally {
      targetDatabase.close();
    }
  });

  it("rolls back the bootstrap pointer and preserves data when a stage fails", async () => {
    const context = await createTestApp({
      migrationRuntimeCoordinator: {
        checkpointPlayback: () => Promise.resolve(),
        pauseGenerationAndPlayback: () => Promise.reject(new Error("pause failed")),
      },
    });
    const session = await bootstrapSession(context.app);
    await writeFile(join(context.sourceDataRoot, "preserved.txt"), "old data remains");

    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/device-settings/data-root-migrations",
      headers: {
        ...authorizedHeaders(session),
        "idempotency-key": "migrate-settings-foundation-rollback",
      },
      payload: { targetDataRoot: context.targetDataRoot },
    });
    const job = jobAcceptedResponseSchema.parse(response.json<unknown>());
    const result = await waitForMigration(context.sourceDataRoot, job.jobId, "rolled_back");

    expect(result).toMatchObject({
      stage: "rolling_back",
      status: "rolled_back",
      error_code: "DATA_ROOT_MIGRATION_FAILED",
    });
    expect(await readActiveDataRoot(context.sourceDataRoot, context.bootstrapPath)).toBe(
      context.sourceDataRoot,
    );
    expect(await readFile(join(context.sourceDataRoot, "preserved.txt"), "utf8")).toBe(
      "old data remains",
    );
  });

  it("rejects a second migration while another job owns the lifecycle", async () => {
    let releasePause = () => {};
    const pauseGate = new Promise<void>((resolve) => {
      releasePause = resolve;
    });
    let resolveRestart:
      | ((request: {
          bootstrapPath: string;
          jobId: string;
          previousDataRoot: string;
          targetDataRoot: string;
        }) => void)
      | undefined;
    const restartRequested = new Promise<{
      bootstrapPath: string;
      jobId: string;
      previousDataRoot: string;
      targetDataRoot: string;
    }>((resolve) => {
      resolveRestart = resolve;
    });
    const context = await createTestApp({
      migrationRuntimeCoordinator: {
        checkpointPlayback: () => Promise.resolve(),
        pauseGenerationAndPlayback: () => pauseGate,
      },
      requestRestart: (request) => {
        resolveRestart?.(request);
        return Promise.resolve();
      },
    });
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);

    const first = await context.app.inject({
      method: "POST",
      url: "/api/v1/device-settings/data-root-migrations",
      headers: {
        ...headers,
        "idempotency-key": "migration-owner-first",
      },
      payload: { targetDataRoot: context.targetDataRoot },
    });
    expect(first.statusCode).toBe(202);

    const second = await context.app.inject({
      method: "POST",
      url: "/api/v1/device-settings/data-root-migrations",
      headers: {
        ...headers,
        "idempotency-key": "migration-owner-second",
      },
      payload: { targetDataRoot: join(context.parent, "another-target") },
    });
    expect(second.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(second.json<unknown>())).toMatchObject({
      code: "DATA_ROOT_MIGRATION_ALREADY_RUNNING",
      retryable: true,
    });

    releasePause();
    await restartRequested;
  });

  it("records a failed service restart as a rollback in both preserved roots", async () => {
    let resolveRestart:
      | ((request: {
          bootstrapPath: string;
          jobId: string;
          previousDataRoot: string;
          targetDataRoot: string;
        }) => void)
      | undefined;
    const restartRequested = new Promise<{
      bootstrapPath: string;
      jobId: string;
      previousDataRoot: string;
      targetDataRoot: string;
    }>((resolve) => {
      resolveRestart = resolve;
    });
    const context = await createTestApp({
      requestRestart: (request) => {
        resolveRestart?.(request);
        return Promise.resolve();
      },
    });
    const session = await bootstrapSession(context.app);
    const response = await context.app.inject({
      method: "POST",
      url: "/api/v1/device-settings/data-root-migrations",
      headers: {
        ...authorizedHeaders(session),
        "idempotency-key": "migration-restart-failure",
      },
      payload: { targetDataRoot: context.targetDataRoot },
    });
    const job = jobAcceptedResponseSchema.parse(response.json<unknown>());
    const restart = await restartRequested;

    await writeActiveDataRoot(context.bootstrapPath, context.sourceDataRoot);
    await recordDataRootRestartFailure(restart);

    expect(await waitForMigration(context.sourceDataRoot, job.jobId, "rolled_back")).toMatchObject({
      error_code: "SERVICE_RESTART_FAILED",
      stage: "rolling_back",
      status: "rolled_back",
    });
    expect(await waitForMigration(context.targetDataRoot, job.jobId, "rolled_back")).toMatchObject({
      error_code: "SERVICE_RESTART_FAILED",
      stage: "rolling_back",
      status: "rolled_back",
    });
    expect(await readActiveDataRoot(context.sourceDataRoot, context.bootstrapPath)).toBe(
      context.sourceDataRoot,
    );
  });
});
