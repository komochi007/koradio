import { z } from "zod";

export const providerAvailabilitySchema = z.enum(["available", "degraded", "unavailable"]);

export const healthResponseSchema = z.object({
  service: z.literal("koradio"),
  status: z.literal("ready"),
  mode: z.literal("mock"),
  providers: z.object({
    codex: providerAvailabilitySchema,
    netease: providerAvailabilitySchema,
    tts: providerAvailabilitySchema,
  }),
  checkedAt: z.iso.datetime(),
});

export const sessionBootstrapResponseSchema = z.object({
  accessToken: z.string().min(32),
  expiresAt: z.iso.datetime(),
});

export const sessionAuthenticateSchema = z.object({
  type: z.literal("session.authenticate"),
  accessToken: z.string().min(32),
});

export const serviceHealthChangedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("service.health.changed"),
  version: z.literal(1),
  correlationId: z.uuid(),
  sequence: z.number().int().nonnegative(),
  occurredAt: z.iso.datetime(),
  payload: healthResponseSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type SessionBootstrapResponse = z.infer<typeof sessionBootstrapResponseSchema>;
export type SessionAuthenticate = z.infer<typeof sessionAuthenticateSchema>;
export type ServiceHealthChangedEvent = z.infer<typeof serviceHealthChangedEventSchema>;
