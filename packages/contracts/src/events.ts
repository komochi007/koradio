import { z } from "zod";

import {
  apiVersionSchema,
  correlationIdSchema,
  jobIdSchema,
  occurredAtSchema,
  profileIdSchema,
  programIdSchema,
} from "./common.js";
import { errorCodeSchema } from "./errors.js";
import { feedbackEventSchema } from "./feedback.js";
import { healthResponseSchema } from "./health.js";
import { playbackCheckpointSchema, programDetailSchema } from "./programs.js";
import { dataRootMigrationStageSchema, dataRootMigrationStatusSchema } from "./settings.js";

const eventEnvelopeShape = {
  eventId: z.uuid(),
  version: apiVersionSchema,
  profileId: profileIdSchema.optional(),
  correlationId: correlationIdSchema,
  sequence: z.number().int().nonnegative(),
  occurredAt: occurredAtSchema,
};

export const generationPlannedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("generation.planned"),
  payload: z.strictObject({
    jobId: jobIdSchema,
  }),
});
export const generationTracksResolvedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("generation.tracks-resolved"),
  payload: z.strictObject({
    jobId: jobIdSchema,
    trackCount: z.number().int().positive(),
  }),
});
export const generationDegradedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("generation.degraded"),
  payload: z.strictObject({
    jobId: jobIdSchema,
    capability: z.enum(["tts", "lyrics", "track"]),
    code: errorCodeSchema,
  }),
});
export const generationCompletedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("generation.completed"),
  payload: z.strictObject({
    jobId: jobIdSchema,
    programId: programIdSchema,
  }),
});
export const programCommittedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("program.committed"),
  payload: programDetailSchema,
});
export const playbackSnapshotEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("playback.snapshot"),
  payload: playbackCheckpointSchema,
});
export const feedbackPersistedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("feedback.persisted"),
  payload: feedbackEventSchema,
});
export const serviceHealthChangedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("service.health.changed"),
  payload: healthResponseSchema,
});
export const dataRootMigrationStageChangedEventSchema = z.strictObject({
  ...eventEnvelopeShape,
  eventType: z.literal("data_root_migration.stage_changed"),
  payload: z.strictObject({
    jobId: jobIdSchema,
    stage: dataRootMigrationStageSchema,
    status: dataRootMigrationStatusSchema,
    errorCode: errorCodeSchema.optional(),
  }),
});
export const v1EventSchema = z.discriminatedUnion("eventType", [
  generationPlannedEventSchema,
  generationTracksResolvedEventSchema,
  generationDegradedEventSchema,
  generationCompletedEventSchema,
  programCommittedEventSchema,
  playbackSnapshotEventSchema,
  feedbackPersistedEventSchema,
  serviceHealthChangedEventSchema,
  dataRootMigrationStageChangedEventSchema,
]);

export type GenerationPlannedEvent = z.infer<typeof generationPlannedEventSchema>;
export type GenerationTracksResolvedEvent = z.infer<typeof generationTracksResolvedEventSchema>;
export type GenerationDegradedEvent = z.infer<typeof generationDegradedEventSchema>;
export type GenerationCompletedEvent = z.infer<typeof generationCompletedEventSchema>;
export type ProgramCommittedEvent = z.infer<typeof programCommittedEventSchema>;
export type PlaybackSnapshotEvent = z.infer<typeof playbackSnapshotEventSchema>;
export type FeedbackPersistedEvent = z.infer<typeof feedbackPersistedEventSchema>;
export type ServiceHealthChangedEvent = z.infer<typeof serviceHealthChangedEventSchema>;
export type DataRootMigrationStageChangedEvent = z.infer<
  typeof dataRootMigrationStageChangedEventSchema
>;
export type V1Event = z.infer<typeof v1EventSchema>;
