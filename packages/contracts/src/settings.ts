import { z } from "zod";

import { jobIdSchema, occurredAtSchema } from "./common.js";
import { errorCodeSchema } from "./errors.js";

export const deviceSettingsSchema = z.strictObject({
  dataRoot: z.string().trim().min(1).max(300),
  codexCommand: z.string().trim().min(1).max(300),
  updatedAt: occurredAtSchema,
});
export const updateDeviceSettingsCommandSchema = z
  .strictObject({
    codexCommand: z.string().trim().min(1).max(300).optional(),
  })
  .refine((value) => value.codexCommand !== undefined, {
    message: "At least one device setting is required",
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
export type CreateDataRootMigrationCommand = z.infer<typeof createDataRootMigrationCommandSchema>;
export type DataRootMigrationSnapshot = z.infer<typeof dataRootMigrationSnapshotSchema>;
