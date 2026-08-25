import { z } from "zod";

import {
  controlledFileRefSchema,
  cursorSchema,
  occurredAtSchema,
  playableAudioRefSchema,
  profileIdSchema,
  programIdSchema,
  timelineItemIdSchema,
  trackIdSchema,
} from "./common.js";
import { musicTrackSchema, originModeSchema } from "./music.js";
import { djLanguageSchema } from "./preferences.js";

export const programStatusSchema = z.enum(["ready", "completed"]);
export const programPlaybackModeSchema = z.enum(["sequential", "voice-overlay"]);
export const listeningSimilarityDimensionSchema = z.enum([
  "melody",
  "arrangement",
  "timbre",
  "emotion",
  "rhythm",
  "era",
]);
export const programLanguageScopeSchema = z.enum([
  "any",
  "chinese",
  "english",
  "japanese",
  "korean",
  "western-languages",
]);
export const programRegionScopeSchema = z.enum([
  "any",
  "western",
  "greater-china",
  "japan",
  "korea",
]);
export const programVocalModeSchema = z.enum(["any", "vocal-only", "instrumental-only"]);
export const programSourceModeSchema = z.enum(["balanced", "library-only", "discovery-only"]);
export const programEnergyTargetSchema = z.enum(["low", "low-mid", "mid", "mid-high", "high"]);
export const programRhythmSalienceSchema = z.enum([
  "any",
  "restrained",
  "light",
  "steady",
  "strong",
]);
export const programAttentionLevelSchema = z.enum(["any", "background", "focus", "immersive"]);
export const programExplorationModeSchema = z.enum(["balanced", "broaden", "familiar"]);
export const programListeningIntentSchema = z.strictObject({
  anchorTrack: z
    .strictObject({
      title: z.string().trim().min(1).max(300),
      artist: z.string().trim().min(1).max(300).nullable(),
    })
    .nullable(),
  similarityDimensions: z.array(listeningSimilarityDimensionSchema).min(1).max(6),
  languageConstraint: z.enum(["any", "chinese-vocal"]),
  languageScope: programLanguageScopeSchema.default("any"),
  regionScope: programRegionScopeSchema.default("any"),
  vocalMode: programVocalModeSchema.default("any"),
  genreHints: z.array(z.string().trim().min(1).max(40)).max(4).default([]),
  sourceMode: programSourceModeSchema.default("balanced"),
  targetTrackCount: z.number().int().min(8).max(12).optional(),
  requiredArtists: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
  excludedArtists: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  releaseYearRange: z
    .strictObject({
      from: z.number().int().min(1900).max(2100),
      to: z.number().int().min(1900).max(2100),
    })
    .refine((value) => value.from <= value.to)
    .nullable()
    .default(null),
  dominantLanguageShare: z.number().min(0.5).max(1).default(0.75),
  sceneHints: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  moodHints: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  energyTarget: programEnergyTargetSchema.nullable().default(null),
  rhythmSalience: programRhythmSalienceSchema.default("any"),
  attentionLevel: programAttentionLevelSchema.default("any"),
  styleAvoids: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  explorationMode: programExplorationModeSchema.default("balanced"),
});
export const djCitationSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().trim().min(1).max(300),
  url: z.url(),
  provider: z.enum(["musicbrainz", "wikimedia"]),
});
export const djScriptTypeSchema = z.enum(["intro", "segue", "outro"]);
export const djScriptSegmentSchema = z.strictObject({
  id: z.uuid(),
  programId: programIdSchema,
  type: djScriptTypeSchema,
  language: djLanguageSchema,
  text: z.string().trim().min(1).max(5000),
  displayText: z.string().trim().min(1).max(5000),
  estimatedTiming: z.boolean(),
  revealedAt: occurredAtSchema.nullable().optional(),
  ttsAudioRef: controlledFileRefSchema.nullable(),
  citations: z.array(djCitationSchema).max(5).optional(),
});
export const djTimelineItemSchema = z.strictObject({
  id: timelineItemIdSchema,
  kind: z.literal("dj"),
  position: z.number().int().nonnegative(),
  segmentId: z.uuid(),
  audioRef: controlledFileRefSchema,
  durationMs: z.number().int().positive(),
});
export const trackTimelineItemSchema = z.strictObject({
  id: timelineItemIdSchema,
  kind: z.literal("track"),
  position: z.number().int().nonnegative(),
  trackId: trackIdSchema,
  resolvedAudioRef: playableAudioRefSchema,
  durationMs: z.number().int().positive(),
});
export const playbackTimelineItemSchema = z.discriminatedUnion("kind", [
  djTimelineItemSchema,
  trackTimelineItemSchema,
]);
export const programSchema = z.strictObject({
  id: programIdSchema,
  profileId: profileIdSchema,
  scenarioText: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(200),
  status: programStatusSchema,
  trackIds: z.array(trackIdSchema).min(1),
  originMode: originModeSchema.default("mock"),
  playbackMode: programPlaybackModeSchema.optional(),
  createdAt: occurredAtSchema,
});
export const programDetailSchema = z.strictObject({
  program: programSchema,
  djScripts: z.array(djScriptSegmentSchema).min(1),
  tracks: z.array(musicTrackSchema).min(1),
  timeline: z.array(playbackTimelineItemSchema).min(1),
});
export const programListResponseSchema = z.strictObject({
  items: z.array(programSchema),
  nextCursor: cursorSchema.optional(),
});
export const currentProgramResponseSchema = z.strictObject({
  program: programDetailSchema.nullable(),
});
export const programHandoffResponseSchema = z.strictObject({
  program: programDetailSchema.nullable(),
});
export const deleteProgramResponseSchema = z.strictObject({
  programId: programIdSchema,
  clearedCurrentSession: z.boolean(),
  deletedAudioCount: z.number().int().nonnegative(),
  retainedAudioCount: z.number().int().nonnegative(),
  pendingCleanupCount: z.number().int().nonnegative(),
});
export const generateProgramCommandSchema = z.strictObject({
  scenarioText: z.string().trim().min(1).max(500),
  listeningIntent: programListeningIntentSchema.optional(),
});
export const playbackStatusSchema = z.enum(["playing", "paused", "completed", "failed"]);
export const playbackCheckpointSchema = z.strictObject({
  profileId: profileIdSchema,
  programId: programIdSchema,
  timelineItemId: timelineItemIdSchema,
  positionMs: z.number().int().nonnegative(),
  volume: z.number().min(0).max(1),
  status: playbackStatusSchema,
  savedAt: occurredAtSchema,
});
export const savePlaybackCheckpointCommandSchema = playbackCheckpointSchema
  .omit({
    savedAt: true,
  })
  .extend({
    leaseEpoch: z.number().int().nonnegative(),
  });

export type DjScriptSegment = z.infer<typeof djScriptSegmentSchema>;
export type PlaybackTimelineItem = z.infer<typeof playbackTimelineItemSchema>;
export type Program = z.infer<typeof programSchema>;
export type ProgramDetail = z.infer<typeof programDetailSchema>;
export type ProgramListResponse = z.infer<typeof programListResponseSchema>;
export type CurrentProgramResponse = z.infer<typeof currentProgramResponseSchema>;
export type ProgramHandoffResponse = z.infer<typeof programHandoffResponseSchema>;
export type DeleteProgramResponse = z.infer<typeof deleteProgramResponseSchema>;
export type GenerateProgramCommand = z.infer<typeof generateProgramCommandSchema>;
export type ProgramListeningIntent = z.infer<typeof programListeningIntentSchema>;
export type ListeningSimilarityDimension = z.infer<typeof listeningSimilarityDimensionSchema>;
export type ProgramLanguageScope = z.infer<typeof programLanguageScopeSchema>;
export type ProgramRegionScope = z.infer<typeof programRegionScopeSchema>;
export type ProgramVocalMode = z.infer<typeof programVocalModeSchema>;
export type ProgramSourceMode = z.infer<typeof programSourceModeSchema>;
export type ProgramEnergyTarget = z.infer<typeof programEnergyTargetSchema>;
export type ProgramRhythmSalience = z.infer<typeof programRhythmSalienceSchema>;
export type ProgramAttentionLevel = z.infer<typeof programAttentionLevelSchema>;
export type ProgramExplorationMode = z.infer<typeof programExplorationModeSchema>;
export type PlaybackCheckpoint = z.infer<typeof playbackCheckpointSchema>;
export type SavePlaybackCheckpointCommand = z.infer<typeof savePlaybackCheckpointCommandSchema>;
