import {
  createDataRootMigrationRequestSchema,
  deepseekCredentialStatusSchema,
  healthResponseSchema,
  jobAcceptedResponseSchema,
  serviceHealthListResponseSchema,
  serviceHealthSchema,
  ttsModelStatusSchema,
  updateDeepseekApiKeyRequestSchema,
  updateDeviceSettingsRequestSchema,
} from "@koradio/contracts";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import {
  DeepseekAdapterError,
  type TestableDeepseekPlannerProvider,
} from "../../integrations/deepseek.js";
import {
  DataRootMigrationConflictError,
  type DataRootMigrationService,
} from "../../modules/device-settings/data-root-migration.js";
import type { DeepseekCredentialService } from "../../modules/device-settings/deepseek-credentials.js";
import type { HealthService } from "../../modules/device-settings/health.js";
import {
  DeepseekPrivacyNoticeRequiredError,
  type DeviceSettingsService,
} from "../../modules/device-settings/index.js";
import type { ProgramPlannerProvider } from "../../modules/programs/index.js";
import { SecretStoreError } from "../../platform/secrets/index.js";
import type { TtsModelService } from "../../integrations/tts-model.js";
import { sendApiError } from "./api-error.js";

function isTestablePlanner(
  provider: ProgramPlannerProvider,
): provider is TestableDeepseekPlannerProvider {
  return "test" in provider && typeof provider.test === "function";
}

export function createHealthSettingsRoutes(options: {
  dataRootMigration: DataRootMigrationService;
  deviceSettings: DeviceSettingsService;
  deepseekCredentials: DeepseekCredentialService;
  health: HealthService;
  plannerProvider: () => ProgramPlannerProvider;
  ttsModelService: TtsModelService;
}): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/v1/health", () => healthResponseSchema.parse(options.health.getHealth()));
    app.get("/api/v1/health/services", () =>
      serviceHealthListResponseSchema.parse(options.health.getServiceHealth()),
    );
    app.get("/api/v1/device-settings", () => options.deviceSettings.get());
    app.get("/api/v1/device-settings/tts-model", () =>
      ttsModelStatusSchema.parse(options.ttsModelService.getStatus()),
    );
    app.get("/api/v1/device-settings/deepseek-credentials", async () => {
      try {
        return deepseekCredentialStatusSchema.parse({
          configured: await options.deepseekCredentials.has(),
        });
      } catch (error) {
        if (error instanceof SecretStoreError) {
          return deepseekCredentialStatusSchema.parse({ configured: false });
        }
        throw error;
      }
    });
    app.put("/api/v1/device-settings/deepseek-credentials", async (request, reply) => {
      const parsed = updateDeepseekApiKeyRequestSchema.safeParse({ body: request.body });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "DEEPSEEK_API_KEY_VALIDATION_FAILED",
          "DeepSeek API key is invalid",
          false,
        );
      }
      try {
        await options.deepseekCredentials.set(parsed.data.body.apiKey);
        return deepseekCredentialStatusSchema.parse({ configured: true });
      } catch (error) {
        if (error instanceof SecretStoreError) {
          return sendApiError(
            reply,
            error.code === "access_denied" ? 403 : 503,
            "DEEPSEEK_CREDENTIAL_STORE_UNAVAILABLE",
            "DeepSeek API key could not be saved in the OS Credential Store",
            true,
          );
        }
        throw error;
      }
    });
    app.delete("/api/v1/device-settings/deepseek-credentials", async (request, reply) => {
      try {
        await options.deepseekCredentials.delete();
        return deepseekCredentialStatusSchema.parse({ configured: false });
      } catch (error) {
        if (error instanceof SecretStoreError) {
          return sendApiError(
            reply,
            error.code === "access_denied" ? 403 : 503,
            "DEEPSEEK_CREDENTIAL_STORE_UNAVAILABLE",
            "DeepSeek API key could not be removed from the OS Credential Store",
            true,
          );
        }
        throw error;
      }
    });
    app.post("/api/v1/device-settings/planner-test", async (_request, reply) => {
      const checkedAt = new Date().toISOString();
      const planner = options.plannerProvider();
      if (isTestablePlanner(planner)) {
        try {
          await planner.test({ correlationId: randomUUID() });
        } catch (error) {
          if (error instanceof DeepseekAdapterError) {
            const statusCode =
              error.code === "unauthorized"
                ? 401
                : error.code === "payment_required"
                  ? 402
                  : error.code === "rate_limited"
                    ? 429
                    : error.code === "configuration_invalid" || error.code === "response_invalid"
                      ? 422
                      : error.code === "timeout"
                        ? 504
                        : 503;
            return sendApiError(
              reply,
              statusCode,
              "PLANNER_TEST_FAILED",
              "Active AI planner test failed",
              error.code === "rate_limited" || error.code === "timeout" || statusCode >= 500,
            );
          }
          throw error;
        }
      }
      return serviceHealthSchema.parse({
        service: "planner",
        status: "available",
        checkedAt,
        redactedSummary: "Active AI planner test succeeded",
      });
    });
    app.post("/api/v1/device-settings/tts-model/install", (_request, reply) => {
      const status = options.ttsModelService.startInstall();
      if (status.state === "unsupported") {
        return sendApiError(
          reply,
          409,
          "TTS_MODEL_UNSUPPORTED",
          "Qwen3-TTS requires Apple Silicon and macOS 15 or later",
          false,
        );
      }
      return reply
        .status(status.state === "ready" ? 200 : 202)
        .send(ttsModelStatusSchema.parse(status));
    });
    app.patch("/api/v1/device-settings", (request, reply) => {
      const parsed = updateDeviceSettingsRequestSchema.safeParse({ body: request.body });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "DEVICE_SETTINGS_VALIDATION_FAILED",
          "Device settings are invalid",
          false,
        );
      }
      try {
        return options.deviceSettings.update(parsed.data.body);
      } catch (error) {
        if (error instanceof DeepseekPrivacyNoticeRequiredError) {
          return sendApiError(
            reply,
            400,
            "DEEPSEEK_PRIVACY_REQUIRED",
            "DeepSeek privacy notice must be accepted before enabling the planner",
            false,
          );
        }
        throw error;
      }
    });
    app.post("/api/v1/device-settings/data-root-migrations", (request, reply) => {
      if (options.ttsModelService.getStatus().state === "downloading") {
        return sendApiError(
          reply,
          409,
          "TTS_MODEL_DOWNLOAD_IN_PROGRESS",
          "Wait for the Qwen3-TTS model download to finish before migrating the data root",
          true,
        );
      }
      const parsed = createDataRootMigrationRequestSchema.safeParse({
        headers: { "idempotency-key": request.headers["idempotency-key"] },
        body: request.body,
      });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "DATA_ROOT_MIGRATION_VALIDATION_FAILED",
          "Data root migration request is invalid",
          false,
        );
      }
      try {
        const result = options.dataRootMigration.create(
          parsed.data.body,
          parsed.data.headers["idempotency-key"],
        );
        return reply.status(202).send(jobAcceptedResponseSchema.parse({ jobId: result.jobId }));
      } catch (error) {
        if (error instanceof DataRootMigrationConflictError) {
          return sendApiError(
            reply,
            409,
            "DATA_ROOT_MIGRATION_ALREADY_RUNNING",
            "Another data root migration is already running",
            true,
          );
        }
        throw error;
      }
    });
    await app.after();
  };
}
