import { z } from "zod";

import { jobIdSchema, occurredAtSchema } from "./common.js";
import { errorCodeSchema } from "./errors.js";

export const deviceSettingsSchema = z.strictObject({
  dataRoot: z.string().trim().min(1).max(300),
  codexCommand: z.string().trim().min(1).max(300).nullable(),
  updatedAt: occurredAtSchema,
});
export const updateDeviceSettingsCommandSchema = z
  .strictObject({
    codexCommand: z.string().trim().min(1).max(300).optional(),
  })
  .refine((value) => value.codexCommand !== undefined, {
    message: "At least one device setting is required",
  });
export const ttsModelStateSchema = z.enum([
  "unsupported",
  "not-installed",
  "downloading",
  "ready",
  "failed",
]);
export const ttsModelStatusSchema = z.strictObject({
  model: z.literal("Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"),
  revision: z.literal("049ef77fe8816b536193c0c25f9a214d17921282"),
  state: ttsModelStateSchema,
  downloadedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().positive(),
  progressPercent: z.number().int().min(0).max(100),
  errorCode: z
    .enum([
      "TTS_MODEL_DOWNLOAD_FAILED",
      "TTS_MODEL_INTEGRITY_FAILED",
      "TTS_MODEL_STORAGE_FAILED",
      "TTS_MODEL_UNSUPPORTED",
    ])
    .optional(),
});
export const createDataRootMigrationCommandSchema = z.strictObject({
  targetDataRoot: z.string().trim().min(1).max(300),
});
export const dataRootMigrationStageSchema = z.enum([
  "validating",
  "pausing",
  "checkpointing",
  "backing_up",
  "copying",
  "verifying",
  "switching",
  "restarting",
  "completed",
  "rolling_back",
]);
export const dataRootMigrationStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "rolled_back",
]);
export const dataRootMigrationSnapshotSchema = z.strictObject({
  jobId: jobIdSchema,
  stage: dataRootMigrationStageSchema,
  status: dataRootMigrationStatusSchema,
  errorCode: errorCodeSchema.optional(),
  updatedAt: occurredAtSchema,
});

export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;
export type UpdateDeviceSettingsCommand = z.infer<typeof updateDeviceSettingsCommandSchema>;
export type TtsModelState = z.infer<typeof ttsModelStateSchema>;
export type TtsModelStatus = z.infer<typeof ttsModelStatusSchema>;
export type CreateDataRootMigrationCommand = z.infer<typeof createDataRootMigrationCommandSchema>;
export type DataRootMigrationStage = z.infer<typeof dataRootMigrationStageSchema>;
export type DataRootMigrationStatus = z.infer<typeof dataRootMigrationStatusSchema>;
export type DataRootMigrationSnapshot = z.infer<typeof dataRootMigrationSnapshotSchema>;
