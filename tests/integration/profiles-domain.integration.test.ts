import {
  currentProfileResponseSchema,
  errorEnvelopeSchema,
  profileAvatarUploadResponseSchema,
  profileListResponseSchema,
  profilePreferencesSchema,
  profileSchema,
  sessionBootstrapResponseSchema,
  type SessionBootstrapResponse,
} from "@koradio/contracts";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import type { ProfileSwitchRuntimeCoordinator } from "../../apps/server/src/modules/profiles/index.js";
import { readCurrentProfileId } from "../../apps/server/src/platform/db/data-root.js";

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

interface TestAppContext {
  app: Awaited<ReturnType<typeof createApp>>;
  bootstrapPath: string;
  dataRoot: string;
}

async function createTestApp(
  profileSwitchRuntimeCoordinator?: ProfileSwitchRuntimeCoordinator,
): Promise<TestAppContext> {
  const parent = await mkdtemp(join(tmpdir(), "koradio-profiles-domain-"));
  const dataRoot = join(parent, "data");
  const bootstrapPath = join(parent, "bootstrap.json");
  const config: RuntimeConfig = {
    environment: "test",
    host: "127.0.0.1",
    port: 49373,
    webPort: 5173,
    providerMode: "mock",
    strictPort: true,
    dataRoot,
    initialDataRoot: dataRoot,
    dataRootBootstrapPath: bootstrapPath,
    webRoot: "unused-in-test",
  };
  const app = await createApp({
    config,
    selectedPort: config.port,
    ...(profileSwitchRuntimeCoordinator === undefined ? {} : { profileSwitchRuntimeCoordinator }),
  });
  openApps.push(app);
  return { app, bootstrapPath, dataRoot };
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
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/profiles",
    headers: {
      ...headers,
      "idempotency-key": idempotencyKey,
    },
    payload: {
      radioName,
      nickname: "Klein",
      ...overrides,
    },
  });
}

function multipartAvatar(
  content: Buffer,
  mimeType: string,
  filename = "avatar.png",
): { body: Buffer; contentType: string } {
  const boundary = "koradio-avatar-boundary";
  return {
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("S3-01 Profiles domain closure", () => {
  it("creates idempotent profiles with isolated defaults and supports list, read and update", async () => {
    const context = await createTestApp();
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);

    const noCurrent = await context.app.inject({
      method: "GET",
      url: "/api/v1/profiles/current",
      headers,
    });
    expect(currentProfileResponseSchema.parse(noCurrent.json<unknown>())).toEqual({
      current: null,
    });

    const firstResponse = await createProfile(
      context.app,
      headers,
      "profile-create-001",
      "Night Signals",
      {
        frequentGenres: ["ambient", "dream pop"],
        defaultScenario: "夜晚写作",
      },
    );
    const repeatedResponse = await createProfile(
      context.app,
      headers,
      "profile-create-001",
      "Ignored Duplicate",
    );
    expect(firstResponse.statusCode).toBe(201);
    expect(repeatedResponse.statusCode).toBe(201);
    const first = profileSchema.parse(firstResponse.json<unknown>());
    expect(profileSchema.parse(repeatedResponse.json<unknown>())).toEqual(first);

    const secondResponse = await createProfile(
      context.app,
      headers,
      "profile-create-002",
      "Morning Signals",
    );
    const second = profileSchema.parse(secondResponse.json<unknown>());

    const database = new DatabaseSync(join(context.dataRoot, "koradio.sqlite"));
    try {
      expect(database.prepare("SELECT COUNT(*) AS count FROM profile").get()).toEqual({
        count: 2,
      });
      expect(
        database
          .prepare(
            "SELECT tags_json, avoid_rules_json, scene_rules_json FROM taste_overrides WHERE profile_id = ?",
          )
          .get(first.id),
      ).toEqual({
        tags_json: '["ambient","dream pop"]',
        avoid_rules_json: "[]",
        scene_rules_json: '["夜晚写作"]',
      });
      expect(
        database
          .prepare(
            "SELECT theme_mode, dj_language, dj_voice_style FROM profile_preferences WHERE profile_id = ?",
          )
          .get(first.id),
      ).toEqual({
        theme_mode: "dark",
        dj_language: "zh-CN",
        dj_voice_style: "british-soft-radio",
      });
    } finally {
      database.close();
    }

    const updatedPreferences = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/${first.id}/preferences`,
      headers,
      payload: { themeMode: "light", djLanguage: "en-GB" },
    });
    expect(profilePreferencesSchema.parse(updatedPreferences.json<unknown>())).toMatchObject({
      profileId: first.id,
      themeMode: "light",
      djLanguage: "en-GB",
    });
    const secondPreferences = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${second.id}/preferences`,
      headers,
    });
    expect(profilePreferencesSchema.parse(secondPreferences.json<unknown>())).toMatchObject({
      profileId: second.id,
      themeMode: "dark",
      djLanguage: "zh-CN",
    });

    const updatedProfile = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/${first.id}`,
      headers,
      payload: { nickname: "Blue", defaultScenario: "深夜阅读" },
    });
    expect(profileSchema.parse(updatedProfile.json<unknown>())).toMatchObject({
      id: first.id,
      nickname: "Blue",
      defaultScenario: "深夜阅读",
    });

    const list = await context.app.inject({
      method: "GET",
      url: "/api/v1/profiles",
      headers,
    });
    expect(profileListResponseSchema.parse(list.json<unknown>()).items).toHaveLength(2);

    const corruptedProfileId = randomUUID();
    const corruptDatabase = new DatabaseSync(join(context.dataRoot, "koradio.sqlite"));
    try {
      corruptDatabase
        .prepare(
          `
            INSERT INTO profile (
              id,
              creation_idempotency_key,
              radio_name,
              nickname,
              avatar_ref,
              frequent_genres_json,
              default_scenario,
              created_at,
              updated_at
            )
            VALUES (?, ?, 'Broken Signals', 'Broken', NULL, '{}', '', ?, ?)
          `,
        )
        .run(
          corruptedProfileId,
          "profile-corrupted-row",
          "2026-07-16T09:00:00.000Z",
          "2026-07-16T09:00:00.000Z",
        );
    } finally {
      corruptDatabase.close();
    }
    const listWithoutCorruptProfile = await context.app.inject({
      method: "GET",
      url: "/api/v1/profiles",
      headers,
    });
    expect(
      profileListResponseSchema.parse(listWithoutCorruptProfile.json<unknown>()).items,
    ).toHaveLength(2);
    const corruptedProfile = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${corruptedProfileId}`,
      headers,
    });
    expect(corruptedProfile.statusCode).toBe(500);
    expect(errorEnvelopeSchema.parse(corruptedProfile.json<unknown>())).toMatchObject({
      code: "PROFILE_UNREADABLE",
    });

    const invalidAvatarRef = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/${first.id}`,
      headers,
      payload: { avatarRef: "media/avatar.png" },
    });
    expect(invalidAvatarRef.statusCode).toBe(400);

    const unknownPreferences = await context.app.inject({
      method: "GET",
      url: `/api/v1/profiles/${randomUUID()}/preferences`,
      headers,
    });
    expect(unknownPreferences.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(unknownPreferences.json<unknown>())).toMatchObject({
      code: "PROFILE_NOT_FOUND",
    });
  });

  it("stores only signature-verified avatar uploads as controlled avatar references", async () => {
    const context = await createTestApp();
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const valid = multipartAvatar(png, "image/png");

    const uploadedResponse = await context.app.inject({
      method: "POST",
      url: "/api/v1/profile-avatars",
      headers: {
        ...headers,
        "content-type": valid.contentType,
      },
      payload: valid.body,
    });
    expect(uploadedResponse.statusCode).toBe(201);
    const uploaded = profileAvatarUploadResponseSchema.parse(uploadedResponse.json<unknown>());
    expect(uploaded.avatarRef).toMatch(/^avatars\/[0-9a-f-]+\.png$/);
    expect(
      await readFile(join(context.dataRoot, "files", ...uploaded.avatarRef.split("/"))),
    ).toEqual(png);

    const profileWithUploadedAvatar = await createProfile(
      context.app,
      headers,
      "profile-with-uploaded-avatar",
      "Avatar Signals",
      { avatarRef: uploaded.avatarRef },
    );
    expect(profileWithUploadedAvatar.statusCode).toBe(201);
    expect(profileSchema.parse(profileWithUploadedAvatar.json<unknown>())).toMatchObject({
      avatarRef: uploaded.avatarRef,
    });

    const profileWithForgedAvatar = await createProfile(
      context.app,
      headers,
      "profile-with-forged-avatar",
      "Forged Signals",
      { avatarRef: `avatars/${randomUUID()}.png` },
    );
    expect(profileWithForgedAvatar.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(profileWithForgedAvatar.json<unknown>())).toMatchObject({
      code: "PROFILE_AVATAR_INVALID",
    });

    const mismatched = multipartAvatar(png, "image/jpeg");
    const mismatchedResponse = await context.app.inject({
      method: "POST",
      url: "/api/v1/profile-avatars",
      headers: {
        ...headers,
        "content-type": mismatched.contentType,
      },
      payload: mismatched.body,
    });
    expect(mismatchedResponse.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(mismatchedResponse.json<unknown>())).toMatchObject({
      code: "AVATAR_UPLOAD_VALIDATION_FAILED",
    });

    const oversizedContent = Buffer.alloc(5 * 1_048_576 + 1);
    png.copy(oversizedContent);
    const oversized = multipartAvatar(oversizedContent, "image/png");
    const oversizedResponse = await context.app.inject({
      method: "POST",
      url: "/api/v1/profile-avatars",
      headers: {
        ...headers,
        "content-type": oversized.contentType,
      },
      payload: oversized.body,
    });
    expect(oversizedResponse.statusCode).toBe(413);
    expect(errorEnvelopeSchema.parse(oversizedResponse.json<unknown>())).toMatchObject({
      code: "AVATAR_FILE_TOO_LARGE",
    });
  });

  it("coordinates Profile switching in order and keeps the old context when switching fails", async () => {
    const calls: string[] = [];
    let failCheckpoint = false;
    const coordinator: ProfileSwitchRuntimeCoordinator = {
      cancelGeneration(profileId) {
        calls.push(`cancel:${profileId}`);
        return Promise.resolve();
      },
      discardLateEvents(profileId) {
        calls.push(`discard:${profileId}`);
        return Promise.resolve();
      },
      checkpointPlayback(profileId) {
        calls.push(`checkpoint:${profileId}`);
        return failCheckpoint ? Promise.reject(new Error("checkpoint failed")) : Promise.resolve();
      },
      stopPlayback(profileId) {
        calls.push(`stop:${profileId}`);
        return Promise.resolve();
      },
    };
    const context = await createTestApp(coordinator);
    const session = await bootstrapSession(context.app);
    const headers = authorizedHeaders(session);
    const first = profileSchema.parse(
      (
        await createProfile(context.app, headers, "profile-switch-001", "Night Signals")
      ).json<unknown>(),
    );
    const second = profileSchema.parse(
      (
        await createProfile(context.app, headers, "profile-switch-002", "Morning Signals")
      ).json<unknown>(),
    );

    const initialSelection = await context.app.inject({
      method: "PUT",
      url: "/api/v1/profiles/current",
      headers,
      payload: { profileId: first.id },
    });
    expect(initialSelection.statusCode).toBe(200);
    expect(calls).toEqual([]);

    const secondSelection = await context.app.inject({
      method: "PUT",
      url: "/api/v1/profiles/current",
      headers,
      payload: { profileId: second.id },
    });
    expect(secondSelection.statusCode).toBe(200);
    expect(calls).toEqual([
      `cancel:${first.id}`,
      `discard:${first.id}`,
      `checkpoint:${first.id}`,
      `stop:${first.id}`,
    ]);
    expect(await readCurrentProfileId(context.dataRoot, context.bootstrapPath)).toBe(second.id);

    failCheckpoint = true;
    calls.length = 0;
    const failedSelection = await context.app.inject({
      method: "PUT",
      url: "/api/v1/profiles/current",
      headers,
      payload: { profileId: first.id },
    });
    expect(failedSelection.statusCode).toBe(500);
    expect(errorEnvelopeSchema.parse(failedSelection.json<unknown>())).toMatchObject({
      code: "PROFILE_SWITCH_FAILED",
      retryable: true,
    });
    expect(calls).toEqual([
      `cancel:${second.id}`,
      `discard:${second.id}`,
      `checkpoint:${second.id}`,
    ]);
    expect(await readCurrentProfileId(context.dataRoot, context.bootstrapPath)).toBe(second.id);

    const current = await context.app.inject({
      method: "GET",
      url: "/api/v1/profiles/current",
      headers,
    });
    expect(currentProfileResponseSchema.parse(current.json<unknown>()).current?.profile.id).toBe(
      second.id,
    );
  });
});
