import { z } from "zod";

export const providerAvailabilitySchema = z.enum(["available", "degraded", "unavailable"]);
export const runtimeModeSchema = z.enum(["mock", "live"]);
export const healthResponseSchema = z.strictObject({
  service: z.literal("koradio"),
  status: z.literal("ready"),
  mode: runtimeModeSchema,
  providers: z.strictObject({
    codex: providerAvailabilitySchema,
    netease: providerAvailabilitySchema,
    tts: providerAvailabilitySchema,
  }),
  checkedAt: z.iso.datetime(),
});
export const serviceHealthNameSchema = z.enum(["local-service", "codex", "netease", "tts"]);
export const serviceHealthSchema = z.strictObject({
  service: serviceHealthNameSchema,
  status: providerAvailabilitySchema,
  checkedAt: z.iso.datetime(),
  redactedSummary: z.string().min(1).max(300),
});
export const serviceHealthListResponseSchema = z.strictObject({
  items: z.array(serviceHealthSchema).max(4),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;
export type ServiceHealthListResponse = z.infer<typeof serviceHealthListResponseSchema>;
