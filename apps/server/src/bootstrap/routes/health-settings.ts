import {
  createDataRootMigrationRequestSchema,
  healthResponseSchema,
  jobAcceptedResponseSchema,
  serviceHealthListResponseSchema,
  ttsModelStatusSchema,
  updateDeviceSettingsRequestSchema,
} from "@koradio/contracts";
import type { FastifyPluginAsync } from "fastify";

import {
  DataRootMigrationConflictError,
  type DataRootMigrationService,
} from "../../modules/device-settings/data-root-migration.js";
import type { HealthService } from "../../modules/device-settings/health.js";
import type { DeviceSettingsService } from "../../modules/device-settings/index.js";
import type { TtsModelService } from "../../integrations/tts-model.js";
import { sendApiError } from "./api-error.js";

export function createHealthSettingsRoutes(options: {
  dataRootMigration: DataRootMigrationService;
  deviceSettings: DeviceSettingsService;
  health: HealthService;
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
      return options.deviceSettings.update(parsed.data.body);
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
  };
}
