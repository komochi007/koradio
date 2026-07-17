import { z } from "zod";

import {
  idempotencyKeyHeadersSchema,
  pageQuerySchema,
  profileIdParamsSchema,
  profileJobIdParamsSchema,
  profileProgramIdParamsSchema,
  profileTrackIdParamsSchema,
} from "./common.js";
import { createFeedbackCommandSchema } from "./feedback.js";
import {
  addLibraryItemCommandSchema,
  importPlaylistCommandSchema,
  musicSearchCommandSchema,
} from "./music.js";
import { updateProfilePreferencesCommandSchema } from "./preferences.js";
import {
  createProfileCommandSchema,
  selectCurrentProfileCommandSchema,
  updateProfileCommandSchema,
} from "./profiles.js";
import { generateProgramCommandSchema, savePlaybackCheckpointCommandSchema } from "./programs.js";
import {
  createDataRootMigrationCommandSchema,
  updateDeviceSettingsCommandSchema,
} from "./settings.js";
import { updateTasteOverridesCommandSchema } from "./taste.js";

export const createProfileRequestSchema = z.strictObject({
  headers: idempotencyKeyHeadersSchema,
  body: createProfileCommandSchema,
});
export const updateProfileRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  body: updateProfileCommandSchema,
});
export const selectCurrentProfileRequestSchema = z.strictObject({
  body: selectCurrentProfileCommandSchema,
});
export const updateProfilePreferencesRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  body: updateProfilePreferencesCommandSchema,
});
export const generateProgramRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  headers: idempotencyKeyHeadersSchema,
  body: generateProgramCommandSchema,
});
export const programDetailRequestSchema = z.strictObject({
  params: profileProgramIdParamsSchema,
});
export const programListRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  query: pageQuerySchema,
});
export const programGenerationSnapshotRequestSchema = z.strictObject({
  params: profileJobIdParamsSchema,
});
export const playbackSnapshotRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
});
export const savePlaybackCheckpointRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  body: savePlaybackCheckpointCommandSchema,
});
export const musicSearchRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  body: musicSearchCommandSchema,
});
export const createLibraryItemRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  headers: idempotencyKeyHeadersSchema,
  body: addLibraryItemCommandSchema,
});
export const libraryListRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  query: pageQuerySchema,
});
export const importPlaylistRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  headers: idempotencyKeyHeadersSchema,
  body: importPlaylistCommandSchema,
});
export const playlistImportSnapshotRequestSchema = z.strictObject({
  params: profileJobIdParamsSchema,
});
export const trackLyricsRequestSchema = z.strictObject({
  params: profileTrackIdParamsSchema,
});
export const audioResolutionRequestSchema = z.strictObject({
  params: profileTrackIdParamsSchema,
});
export const updateTasteOverridesRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  body: updateTasteOverridesCommandSchema,
});
export const createFeedbackRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  headers: idempotencyKeyHeadersSchema,
  body: createFeedbackCommandSchema,
});
export const updateDeviceSettingsRequestSchema = z.strictObject({
  body: updateDeviceSettingsCommandSchema,
});
export const createDataRootMigrationRequestSchema = z.strictObject({
  headers: idempotencyKeyHeadersSchema,
  body: createDataRootMigrationCommandSchema,
});

export type CreateProfileRequest = z.infer<typeof createProfileRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type SelectCurrentProfileRequest = z.infer<typeof selectCurrentProfileRequestSchema>;
export type UpdateProfilePreferencesRequest = z.infer<typeof updateProfilePreferencesRequestSchema>;
export type GenerateProgramRequest = z.infer<typeof generateProgramRequestSchema>;
export type ProgramListRequest = z.infer<typeof programListRequestSchema>;
export type PlaybackSnapshotRequest = z.infer<typeof playbackSnapshotRequestSchema>;
export type SavePlaybackCheckpointRequest = z.infer<typeof savePlaybackCheckpointRequestSchema>;
export type MusicSearchRequest = z.infer<typeof musicSearchRequestSchema>;
export type CreateLibraryItemRequest = z.infer<typeof createLibraryItemRequestSchema>;
export type LibraryListRequest = z.infer<typeof libraryListRequestSchema>;
export type ImportPlaylistRequest = z.infer<typeof importPlaylistRequestSchema>;
export type PlaylistImportSnapshotRequest = z.infer<typeof playlistImportSnapshotRequestSchema>;
export type TrackLyricsRequest = z.infer<typeof trackLyricsRequestSchema>;
export type AudioResolutionRequest = z.infer<typeof audioResolutionRequestSchema>;
export type UpdateTasteOverridesRequest = z.infer<typeof updateTasteOverridesRequestSchema>;
export type CreateFeedbackRequest = z.infer<typeof createFeedbackRequestSchema>;
export type UpdateDeviceSettingsRequest = z.infer<typeof updateDeviceSettingsRequestSchema>;
export type CreateDataRootMigrationRequest = z.infer<typeof createDataRootMigrationRequestSchema>;
