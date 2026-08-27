import { z } from "zod";

import {
  cursorSchema,
  dailyMixIdSchema,
  jobIdSchema,
  occurredAtSchema,
  profileIdSchema,
  trackIdSchema,
} from "./common.js";
import { errorCodeSchema } from "./errors.js";
import { asyncJobStatusSchema, dailyMixGenerationStageSchema } from "./jobs.js";
import { musicTrackSchema } from "./music.js";
import { playbackStatusSchema } from "./programs.js";

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
export const dailyMixTrackBucketSchema = z.enum(["library", "close", "adjacent", "surprise"]);
export const dailyMixSchema = z.strictObject({
  id: dailyMixIdSchema,
  profileId: profileIdSchema,
  localDate: localDateSchema,
  trackIds: z.array(trackIdSchema).length(20),
  generatedAt: occurredAtSchema,
});
export const dailyMixTrackSchema = z.strictObject({
  position: z.number().int().min(0).max(19),
  bucket: dailyMixTrackBucketSchema,
  track: musicTrackSchema,
});
export const dailyMixDetailSchema = z.strictObject({
  mix: dailyMixSchema,
  tracks: z.array(dailyMixTrackSchema).length(20),
});
export const dailyMixGenerationSnapshotSchema = z
  .strictObject({
    jobId: jobIdSchema,
    profileId: profileIdSchema,
    localDate: localDateSchema,
    status: asyncJobStatusSchema,
    stage: dailyMixGenerationStageSchema,
    attemptCount: z.number().int().positive(),
    dailyMixId: dailyMixIdSchema.optional(),
    createdAt: occurredAtSchema,
    updatedAt: occurredAtSchema,
    errorCode: errorCodeSchema.optional(),
  })
  .superRefine((snapshot, context) => {
    if (
      snapshot.status === "succeeded" &&
      (snapshot.stage !== "completed" || snapshot.dailyMixId === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Succeeded Daily Mix snapshots require a completed mix",
      });
    }
    if (snapshot.status !== "succeeded" && snapshot.dailyMixId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only succeeded Daily Mix snapshots may expose a mix",
      });
    }
  });
export const dailyMixTodayResponseSchema = z.strictObject({
  localDate: localDateSchema,
  generation: dailyMixGenerationSnapshotSchema.nullable(),
  mix: dailyMixDetailSchema.nullable(),
});
export const dailyMixListResponseSchema = z.strictObject({
  items: z.array(dailyMixSchema),
  nextCursor: cursorSchema.optional(),
});
export const ensureDailyMixCommandSchema = z.strictObject({
  retry: z.boolean().default(false),
});
export const dailyMixPlaybackCheckpointSchema = z.strictObject({
  profileId: profileIdSchema,
  dailyMixId: dailyMixIdSchema,
  trackId: trackIdSchema,
  position: z.number().int().min(0).max(19),
  positionMs: z.number().int().nonnegative(),
  volume: z.number().min(0).max(1),
  status: playbackStatusSchema,
  savedAt: occurredAtSchema,
});
export const saveDailyMixCheckpointCommandSchema = dailyMixPlaybackCheckpointSchema
  .omit({ savedAt: true })
  .extend({ leaseEpoch: z.number().int().nonnegative() });
export const playbackSourceKindSchema = z.enum(["program", "daily"]);
export const playbackSourceSessionSchema = z.strictObject({
  profileId: profileIdSchema,
  activeKind: playbackSourceKindSchema,
  programId: z.uuid().nullable(),
  dailyMixId: dailyMixIdSchema.nullable(),
  updatedAt: occurredAtSchema,
});
export const activatePlaybackSourceCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("program"), sourceId: z.uuid() }),
  z.strictObject({ kind: z.literal("daily"), sourceId: dailyMixIdSchema }),
]);

export type DailyMix = z.infer<typeof dailyMixSchema>;
export type DailyMixDetail = z.infer<typeof dailyMixDetailSchema>;
export type DailyMixTrack = z.infer<typeof dailyMixTrackSchema>;
export type DailyMixTrackBucket = z.infer<typeof dailyMixTrackBucketSchema>;
export type DailyMixGenerationSnapshot = z.infer<typeof dailyMixGenerationSnapshotSchema>;
export type DailyMixTodayResponse = z.infer<typeof dailyMixTodayResponseSchema>;
export type DailyMixListResponse = z.infer<typeof dailyMixListResponseSchema>;
export type EnsureDailyMixCommand = z.infer<typeof ensureDailyMixCommandSchema>;
export type DailyMixPlaybackCheckpoint = z.infer<typeof dailyMixPlaybackCheckpointSchema>;
export type SaveDailyMixCheckpointCommand = z.infer<typeof saveDailyMixCheckpointCommandSchema>;
export type PlaybackSourceKind = z.infer<typeof playbackSourceKindSchema>;
export type PlaybackSourceSession = z.infer<typeof playbackSourceSessionSchema>;
export type ActivatePlaybackSourceCommand = z.infer<typeof activatePlaybackSourceCommandSchema>;
