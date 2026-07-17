import { z } from "zod";

import { jobIdSchema, occurredAtSchema, profileIdSchema, programIdSchema } from "./common.js";
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
export const programGenerationStageSchema = z.enum([
  "queued",
  "planning",
  "resolving_tracks",
  "enriching_tracks",
  "synthesizing_dj",
  "committing",
  "completed",
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
export const programGenerationSnapshotSchema = z
  .strictObject({
    jobId: jobIdSchema,
    profileId: profileIdSchema,
    status: asyncJobStatusSchema,
    stage: programGenerationStageSchema,
    sequence: z.number().int().nonnegative(),
    programId: programIdSchema.optional(),
    createdAt: occurredAtSchema,
    updatedAt: occurredAtSchema,
    errorCode: errorCodeSchema.optional(),
  })
  .superRefine((snapshot, context) => {
    if (
      snapshot.status === "succeeded" &&
      (snapshot.stage !== "completed" || snapshot.programId === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Succeeded generation snapshots require a completed program",
      });
    }
    if (snapshot.status !== "succeeded" && snapshot.programId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only succeeded generation snapshots may expose a program",
      });
    }
    if (snapshot.status === "queued" && snapshot.stage !== "queued") {
      context.addIssue({
        code: "custom",
        message: "Queued generation snapshots must remain at the queued stage",
      });
    }
  });

export type JobAcceptedResponse = z.infer<typeof jobAcceptedResponseSchema>;
export type AsyncJobSnapshot = z.infer<typeof asyncJobSnapshotSchema>;
export type ProgramGenerationStage = z.infer<typeof programGenerationStageSchema>;
export type ProgramGenerationSnapshot = z.infer<typeof programGenerationSnapshotSchema>;
