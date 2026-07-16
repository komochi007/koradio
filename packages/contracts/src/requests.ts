import { z } from "zod";

import {
  idempotencyKeyHeadersSchema,
  profileIdParamsSchema,
  profileJobIdParamsSchema,
  profileProgramIdParamsSchema,
} from "./common.js";
import { createFeedbackCommandSchema } from "./feedback.js";
import { importPlaylistCommandSchema, musicSearchCommandSchema } from "./music.js";
import { updateProfilePreferencesCommandSchema } from "./preferences.js";
import { createProfileCommandSchema, updateProfileCommandSchema } from "./profiles.js";
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
export const programGenerationSnapshotRequestSchema = z.strictObject({
  params: profileJobIdParamsSchema,
});
export const savePlaybackCheckpointRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  body: savePlaybackCheckpointCommandSchema,
});
export const musicSearchRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  body: musicSearchCommandSchema,
});
export const importPlaylistRequestSchema = z.strictObject({
  params: profileIdParamsSchema,
  headers: idempotencyKeyHeadersSchema,
  body: importPlaylistCommandSchema,
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
export type UpdateProfilePreferencesRequest = z.infer<typeof updateProfilePreferencesRequestSchema>;
export type GenerateProgramRequest = z.infer<typeof generateProgramRequestSchema>;
export type SavePlaybackCheckpointRequest = z.infer<typeof savePlaybackCheckpointRequestSchema>;
export type MusicSearchRequest = z.infer<typeof musicSearchRequestSchema>;
export type ImportPlaylistRequest = z.infer<typeof importPlaylistRequestSchema>;
export type UpdateTasteOverridesRequest = z.infer<typeof updateTasteOverridesRequestSchema>;
export type CreateFeedbackRequest = z.infer<typeof createFeedbackRequestSchema>;
export type UpdateDeviceSettingsRequest = z.infer<typeof updateDeviceSettingsRequestSchema>;
export type CreateDataRootMigrationRequest = z.infer<typeof createDataRootMigrationRequestSchema>;
