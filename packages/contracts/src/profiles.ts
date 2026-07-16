import { z } from "zod";

import { cursorSchema, occurredAtSchema, profileIdSchema } from "./common.js";
import { profilePreferencesSchema } from "./preferences.js";

export const radioNameSchema = z.string().trim().min(2).max(24);
export const nicknameSchema = z.string().trim().min(1).max(20);
export const genreTagSchema = z.string().trim().min(1).max(24);
export const avatarRefSchema = z
  .string()
  .max(300)
  .regex(/^avatars\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/);
export const profileSchema = z.strictObject({
  id: profileIdSchema,
  radioName: radioNameSchema,
  nickname: nicknameSchema,
  avatarRef: avatarRefSchema.nullable(),
  frequentGenres: z.array(genreTagSchema).max(12),
  defaultScenario: z.string().trim().max(120),
  createdAt: occurredAtSchema,
  updatedAt: occurredAtSchema,
});
export const createProfileCommandSchema = z.strictObject({
  radioName: radioNameSchema,
  nickname: nicknameSchema,
  avatarRef: avatarRefSchema.nullable().optional(),
  frequentGenres: z.array(genreTagSchema).max(12).optional(),
  defaultScenario: z.string().trim().max(120).optional(),
});
export const updateProfileCommandSchema = z
  .strictObject({
    radioName: radioNameSchema.optional(),
    nickname: nicknameSchema.optional(),
    avatarRef: avatarRefSchema.nullable().optional(),
    frequentGenres: z.array(genreTagSchema).max(12).optional(),
    defaultScenario: z.string().trim().max(120).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one profile field is required",
  });
export const profileListResponseSchema = z.strictObject({
  items: z.array(profileSchema),
  nextCursor: cursorSchema.optional(),
});
export const profileAvatarUploadResponseSchema = z.strictObject({
  avatarRef: avatarRefSchema,
});
export const profileContextSchema = z.strictObject({
  profile: profileSchema,
  preferences: profilePreferencesSchema,
});
export const currentProfileResponseSchema = z.strictObject({
  current: profileContextSchema.nullable(),
});
export const selectCurrentProfileCommandSchema = z.strictObject({
  profileId: profileIdSchema,
});

export type Profile = z.infer<typeof profileSchema>;
export type CreateProfileCommand = z.infer<typeof createProfileCommandSchema>;
export type UpdateProfileCommand = z.infer<typeof updateProfileCommandSchema>;
export type ProfileListResponse = z.infer<typeof profileListResponseSchema>;
export type ProfileAvatarUploadResponse = z.infer<typeof profileAvatarUploadResponseSchema>;
export type ProfileContext = z.infer<typeof profileContextSchema>;
export type CurrentProfileResponse = z.infer<typeof currentProfileResponseSchema>;
export type SelectCurrentProfileCommand = z.infer<typeof selectCurrentProfileCommandSchema>;
