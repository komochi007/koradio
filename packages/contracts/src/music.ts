import { z } from "zod";

import {
  cursorSchema,
  jobIdSchema,
  occurredAtSchema,
  playableAudioRefSchema,
  playlistSourceIdSchema,
  profileIdSchema,
  trackIdSchema,
} from "./common.js";
import { errorCodeSchema } from "./errors.js";
import { asyncJobStatusSchema } from "./jobs.js";

export const musicSourceSchema = z.literal("netease");
export const originModeSchema = z.enum(["live", "mock"]);
export const lyricStatusSchema = z.enum(["unknown", "available", "untimed", "unavailable"]);
export const musicTrackSchema = z.strictObject({
  id: trackIdSchema,
  source: musicSourceSchema,
  sourceTrackId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300),
  album: z.string().trim().min(1).max(300),
  artworkUrl: z.url().nullable().default(null),
  durationMs: z.number().int().positive(),
  lyricStatus: lyricStatusSchema,
  playable: z.boolean().default(true),
  originMode: originModeSchema.default("mock"),
});
export const libraryItemSchema = z.strictObject({
  track: musicTrackSchema,
  addedAt: occurredAtSchema,
  playlistSourceId: playlistSourceIdSchema.nullable(),
});
export const playlistSourceSchema = z.strictObject({
  id: playlistSourceIdSchema,
  source: musicSourceSchema,
  sourcePlaylistId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  importedAt: occurredAtSchema,
  availableTrackCount: z.number().int().nonnegative(),
  unavailableTrackCount: z.number().int().nonnegative(),
  originMode: originModeSchema.default("mock"),
});
export const musicSearchCommandSchema = z.strictObject({
  keyword: z.string().trim().min(1).max(100),
});
export const musicSearchResponseSchema = z.strictObject({
  items: z.array(musicTrackSchema),
  nextCursor: cursorSchema.optional(),
});
export const importPlaylistCommandSchema = z.strictObject({
  playlistRef: z.string().trim().min(1).max(300),
});
export const addLibraryItemCommandSchema = z.strictObject({
  trackId: trackIdSchema,
});
export const libraryListResponseSchema = z.strictObject({
  items: z.array(libraryItemSchema),
  totalCount: z.number().int().nonnegative().default(0),
  demoCount: z.number().int().nonnegative().default(0),
  nextCursor: cursorSchema.optional(),
});
export const timedTextTokenSchema = z
  .strictObject({
    text: z.string().min(1).max(500),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  })
  .refine((token) => token.endMs > token.startMs, {
    message: "Timed text token must end after it starts",
  });
export const timedTextLineSchema = z
  .strictObject({
    text: z.string().trim().min(1).max(5000),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    tokens: z.array(timedTextTokenSchema).max(500),
  })
  .refine((line) => line.endMs > line.startMs, {
    message: "Timed text line must end after it starts",
  });
export const trackLyricsSchema = z.discriminatedUnion("status", [
  z.strictObject({
    trackId: trackIdSchema,
    status: z.enum(["available", "untimed"]),
    content: z.string().min(1).max(1_000_000),
    timedLines: z.array(timedTextLineSchema).max(10_000).optional(),
  }),
  z.strictObject({
    trackId: trackIdSchema,
    status: z.literal("unavailable"),
    content: z.null(),
  }),
]);
export const audioResolutionSchema = z.strictObject({
  trackId: trackIdSchema,
  resolvedAudioRef: playableAudioRefSchema,
  expiresAt: occurredAtSchema,
});
export const playlistImportProgressSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
});
export const playlistImportSnapshotSchema = z.strictObject({
  jobId: jobIdSchema,
  profileId: profileIdSchema,
  status: asyncJobStatusSchema,
  playlistRef: z.string().trim().min(1).max(300),
  progress: playlistImportProgressSchema,
  playlistSource: playlistSourceSchema.nullable(),
  createdAt: occurredAtSchema,
  updatedAt: occurredAtSchema,
  errorCode: errorCodeSchema.optional(),
});

export type MusicTrack = z.infer<typeof musicTrackSchema>;
export type OriginMode = z.infer<typeof originModeSchema>;
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export type PlaylistSource = z.infer<typeof playlistSourceSchema>;
export type MusicSearchCommand = z.infer<typeof musicSearchCommandSchema>;
export type MusicSearchResponse = z.infer<typeof musicSearchResponseSchema>;
export type ImportPlaylistCommand = z.infer<typeof importPlaylistCommandSchema>;
export type AddLibraryItemCommand = z.infer<typeof addLibraryItemCommandSchema>;
export type LibraryListResponse = z.infer<typeof libraryListResponseSchema>;
export type TimedTextToken = z.infer<typeof timedTextTokenSchema>;
export type TimedTextLine = z.infer<typeof timedTextLineSchema>;
export type TrackLyrics = z.infer<typeof trackLyricsSchema>;
export type AudioResolution = z.infer<typeof audioResolutionSchema>;
export type PlaylistImportProgress = z.infer<typeof playlistImportProgressSchema>;
export type PlaylistImportSnapshot = z.infer<typeof playlistImportSnapshotSchema>;
