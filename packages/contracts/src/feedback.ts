import { z } from "zod";

import {
  idempotencyKeySchema,
  occurredAtSchema,
  profileIdSchema,
  programIdSchema,
  trackIdSchema,
} from "./common.js";

export const feedbackTypeSchema = z.enum([
  "track_liked",
  "track_like_removed",
  "track_disliked",
  "track_dislike_removed",
  "program_favorited",
  "program_favorite_removed",
  "track_skipped",
]);
export const trackFeedbackCommandSchema = z.strictObject({
  type: z.enum([
    "track_liked",
    "track_like_removed",
    "track_disliked",
    "track_dislike_removed",
    "track_skipped",
  ]),
  targetId: trackIdSchema,
});
export const programFeedbackCommandSchema = z.strictObject({
  type: z.enum(["program_favorited", "program_favorite_removed"]),
  targetId: programIdSchema,
});
export const createFeedbackCommandSchema = z.discriminatedUnion("type", [
  trackFeedbackCommandSchema,
  programFeedbackCommandSchema,
]);
export const feedbackEventSchema = z.strictObject({
  id: z.uuid(),
  profileId: profileIdSchema,
  targetId: z.uuid(),
  type: feedbackTypeSchema,
  idempotencyKey: idempotencyKeySchema,
  createdAt: occurredAtSchema,
});

export type CreateFeedbackCommand = z.infer<typeof createFeedbackCommandSchema>;
export type FeedbackEvent = z.infer<typeof feedbackEventSchema>;
