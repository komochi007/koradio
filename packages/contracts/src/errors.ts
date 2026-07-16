import { z } from "zod";

import { correlationIdSchema } from "./common.js";

export const errorCodeSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]+$/);
export const fieldErrorSchema = z.strictObject({
  field: z.string().min(1).max(128),
  code: errorCodeSchema,
  message: z.string().min(1).max(300),
});
export const errorEnvelopeSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
  correlationId: correlationIdSchema,
  fieldErrors: z.array(fieldErrorSchema).max(50).optional(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
