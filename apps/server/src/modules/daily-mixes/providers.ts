import {
  effectiveTasteSchema,
  occurredAtSchema,
  tasteBlueprintSchema,
  trackIdSchema,
} from "@koradio/contracts";
import { z } from "zod";

import { libraryTrackContextSchema, providerCallOptionsSchema } from "../programs/providers.js";

const recentTrackSchema = z.strictObject({
  trackId: trackIdSchema,
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300),
});

export const dailyMixPlanningContextSchema = z.strictObject({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  effectiveTaste: effectiveTasteSchema,
  tasteBlueprint: tasteBlueprintSchema.nullable().default(null),
  libraryTracks: z.array(libraryTrackContextSchema).max(1_000),
  recentTracks: z.array(recentTrackSchema).max(300),
  dislikedTracks: z.array(recentTrackSchema).max(100),
  currentTime: occurredAtSchema,
  refill: z
    .strictObject({
      close: z.number().int().min(0).max(12),
      adjacent: z.number().int().min(0).max(4),
      surprise: z.number().int().min(0).max(2),
      excludedQueries: z.array(z.string().trim().min(1).max(400)).max(80),
    })
    .nullable()
    .default(null),
});

const dailyMixLibraryCandidateSchema = z.strictObject({
  kind: z.literal("library"),
  bucket: z.literal("library"),
  trackId: trackIdSchema,
});
const dailyMixDiscoveryCandidateSchema = z.strictObject({
  kind: z.literal("discovery"),
  bucket: z.enum(["close", "adjacent", "surprise"]),
  keyword: z.string().trim().min(1).max(100),
  expectedArtist: z.string().trim().min(1).max(300),
});
export const dailyMixCandidateSchema = z.discriminatedUnion("kind", [
  dailyMixLibraryCandidateSchema,
  dailyMixDiscoveryCandidateSchema,
]);
export const dailyMixPlanSchema = z.strictObject({
  candidates: z.array(dailyMixCandidateSchema).min(1).max(36),
});

export interface DailyMixPlannerProvider {
  planDailyMix(
    context: unknown,
    options: z.infer<typeof providerCallOptionsSchema>,
  ): Promise<unknown>;
}

export type DailyMixPlanningContext = z.infer<typeof dailyMixPlanningContextSchema>;
export type DailyMixCandidate = z.infer<typeof dailyMixCandidateSchema>;
export type DailyMixPlan = z.infer<typeof dailyMixPlanSchema>;
