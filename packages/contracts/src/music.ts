import { z } from "zod";

import { cursorSchema, occurredAtSchema, trackIdSchema } from "./common.js";

export const musicSourceSchema = z.literal("netease");
export const lyricStatusSchema = z.enum(["available", "untimed", "unavailable"]);
export const musicTrackSchema = z.strictObject({
  id: trackIdSchema,
  source: musicSourceSchema,
  sourceTrackId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300),
  album: z.string().trim().min(1).max(300),
  durationMs: z.number().int().positive(),
  lyricStatus: lyricStatusSchema,
});
export const libraryItemSchema = z.strictObject({
  track: musicTrackSchema,
  addedAt: occurredAtSchema,
  playlistSourceId: z.string().min(1).max(128).nullable(),
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
export const libraryListResponseSchema = z.strictObject({
  items: z.array(libraryItemSchema),
  nextCursor: cursorSchema.optional(),
});

export type MusicTrack = z.infer<typeof musicTrackSchema>;
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export type MusicSearchCommand = z.infer<typeof musicSearchCommandSchema>;
export type MusicSearchResponse = z.infer<typeof musicSearchResponseSchema>;
export type ImportPlaylistCommand = z.infer<typeof importPlaylistCommandSchema>;
export type LibraryListResponse = z.infer<typeof libraryListResponseSchema>;
