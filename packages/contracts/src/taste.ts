import { z } from "zod";

import { occurredAtSchema, profileIdSchema } from "./common.js";

export const tasteTagSchema = z.string().trim().min(1).max(24);
export const avoidRuleSchema = z.string().trim().min(1).max(120);
export const sceneRuleSchema = z.string().trim().min(1).max(160);
export const tasteProjectionSchema = z.strictObject({
  profileId: profileIdSchema,
  tags: z.array(tasteTagSchema).max(100),
  affinities: z.array(z.string().trim().min(1).max(120)).max(100),
  avoidSignals: z.array(z.string().trim().min(1).max(120)).max(100),
  sourceVersion: z.number().int().nonnegative(),
  updatedAt: occurredAtSchema,
});
export const tasteOverridesSchema = z.strictObject({
  profileId: profileIdSchema,
  tags: z.array(tasteTagSchema).max(30),
  avoidRules: z.array(avoidRuleSchema).max(20),
  sceneRules: z.array(sceneRuleSchema).max(20),
  updatedAt: occurredAtSchema,
});
export const resolvedTasteSchema = z.strictObject({
  tags: z.array(tasteTagSchema).max(100),
  affinities: z.array(z.string().trim().min(1).max(120)).max(100),
  avoidRules: z.array(avoidRuleSchema).max(20),
  sceneRules: z.array(sceneRuleSchema).max(20),
});
export const effectiveTasteSchema = z.strictObject({
  profileId: profileIdSchema,
  projectionVersion: z.number().int().nonnegative(),
  overrideVersion: z.number().int().nonnegative(),
  resolvedTaste: resolvedTasteSchema,
});
export const tasteResponseSchema = z.strictObject({
  projection: tasteProjectionSchema,
  overrides: tasteOverridesSchema,
  effective: effectiveTasteSchema,
});
export const updateTasteOverridesCommandSchema = z.strictObject({
  tags: z.array(tasteTagSchema).max(30),
  avoidRules: z.array(avoidRuleSchema).max(20),
  sceneRules: z.array(sceneRuleSchema).max(20),
});

export type TasteProjection = z.infer<typeof tasteProjectionSchema>;
export type TasteOverrides = z.infer<typeof tasteOverridesSchema>;
export type EffectiveTaste = z.infer<typeof effectiveTasteSchema>;
export type TasteResponse = z.infer<typeof tasteResponseSchema>;
export type UpdateTasteOverridesCommand = z.infer<typeof updateTasteOverridesCommandSchema>;
