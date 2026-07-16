import { z } from "zod";

import { jobIdSchema, occurredAtSchema } from "./common.js";
import { errorCodeSchema } from "./errors.js";

export const asyncJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
export const asyncJobKindSchema = z.enum([
  "program_generation",
  "playlist_import",
  "data_root_migration",
]);
export const jobAcceptedResponseSchema = z.strictObject({
  jobId: jobIdSchema,
});
export const asyncJobSnapshotSchema = z.strictObject({
  jobId: jobIdSchema,
  kind: asyncJobKindSchema,
  status: asyncJobStatusSchema,
  createdAt: occurredAtSchema,
  updatedAt: occurredAtSchema,
  errorCode: errorCodeSchema.optional(),
});

export type JobAcceptedResponse = z.infer<typeof jobAcceptedResponseSchema>;
export type AsyncJobSnapshot = z.infer<typeof asyncJobSnapshotSchema>;
