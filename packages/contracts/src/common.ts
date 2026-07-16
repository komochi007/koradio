import { z } from "zod";

export const apiVersionSchema = z.literal(1);
export const identifierSchema = z.uuid();
export const profileIdSchema = identifierSchema;
export const programIdSchema = identifierSchema;
export const jobIdSchema = identifierSchema;
export const trackIdSchema = identifierSchema;
export const playlistSourceIdSchema = identifierSchema;
export const timelineItemIdSchema = identifierSchema;
export const correlationIdSchema = identifierSchema;
export const occurredAtSchema = z.iso.datetime();
export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._~:+/=-]+$/);
export const cursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._~+/=-]+$/);
export const controlledFileRefSchema = z
  .string()
  .max(300)
  .regex(
    /^(?:avatars|lyrics|media|tts)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:aac|json|lrc|m4a|mp3|png|jpe?g|wav|webp)$/,
  );
export const pageQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const profileIdParamsSchema = z.strictObject({
  profileId: profileIdSchema,
});
export const profileProgramIdParamsSchema = z.strictObject({
  profileId: profileIdSchema,
  programId: programIdSchema,
});
export const profileJobIdParamsSchema = z.strictObject({
  profileId: profileIdSchema,
  jobId: jobIdSchema,
});
export const profileTrackIdParamsSchema = z.strictObject({
  profileId: profileIdSchema,
  trackId: trackIdSchema,
});
export const idempotencyKeyHeadersSchema = z.strictObject({
  "idempotency-key": idempotencyKeySchema,
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
export type ProfileIdParams = z.infer<typeof profileIdParamsSchema>;
export type ProfileProgramIdParams = z.infer<typeof profileProgramIdParamsSchema>;
export type ProfileJobIdParams = z.infer<typeof profileJobIdParamsSchema>;
export type ProfileTrackIdParams = z.infer<typeof profileTrackIdParamsSchema>;
export type IdempotencyKeyHeaders = z.infer<typeof idempotencyKeyHeadersSchema>;
