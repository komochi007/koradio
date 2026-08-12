import { z } from "zod";

import {
  controlledFileRefSchema,
  jobIdSchema,
  occurredAtSchema,
  profileIdSchema,
  radioMessageIdSchema,
  trackIdSchema,
} from "./common.js";
import { musicTrackSchema } from "./music.js";

export const radioTurnDecisionSchema = z.enum([
  "chat",
  "clarify",
  "single_track",
  "recommendations",
  "program",
]);
export const radioMessageRoleSchema = z.enum(["user", "assistant"]);
export const radioMessageSchema = z.strictObject({
  id: z.uuid(),
  profileId: profileIdSchema,
  role: radioMessageRoleSchema,
  content: z.string().trim().min(1).max(5000),
  trackId: trackIdSchema.nullable(),
  createdAt: occurredAtSchema,
});
export const radioTurnSchema = z.strictObject({
  id: z.uuid(),
  profileId: profileIdSchema,
  decision: radioTurnDecisionSchema,
  userMessage: radioMessageSchema,
  assistantMessage: radioMessageSchema,
  track: musicTrackSchema.nullable(),
  recommendedTracks: z.array(musicTrackSchema).max(5).optional(),
  programJobId: jobIdSchema.nullable(),
  createdAt: occurredAtSchema,
});
export const radioConversationSchema = z.strictObject({
  turns: z.array(radioTurnSchema).max(50),
});
export const createRadioTurnCommandSchema = z.strictObject({
  content: z.string().trim().min(1).max(500),
});
export const clearRadioConversationCommandSchema = z.strictObject({
  confirmed: z.literal(true),
});
export const radioSpeechGenerationStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);
export const radioSpeechGenerationSchema = z.strictObject({
  jobId: jobIdSchema,
  profileId: profileIdSchema,
  messageId: radioMessageIdSchema,
  status: radioSpeechGenerationStatusSchema,
  audioRef: controlledFileRefSchema.nullable(),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(10 * 60_000)
    .nullable(),
  errorCode: z.string().trim().min(1).max(100).nullable(),
  createdAt: occurredAtSchema,
  updatedAt: occurredAtSchema,
});

export type RadioTurnDecision = z.infer<typeof radioTurnDecisionSchema>;
export type RadioMessage = z.infer<typeof radioMessageSchema>;
export type RadioTurn = z.infer<typeof radioTurnSchema>;
export type RadioConversation = z.infer<typeof radioConversationSchema>;
export type CreateRadioTurnCommand = z.infer<typeof createRadioTurnCommandSchema>;
export type RadioSpeechGeneration = z.infer<typeof radioSpeechGenerationSchema>;
