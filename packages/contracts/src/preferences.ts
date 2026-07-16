import { z } from "zod";

import { occurredAtSchema, profileIdSchema } from "./common.js";

export const themeModeSchema = z.enum(["dark", "light", "system"]);
export const djLanguageSchema = z.enum(["zh-CN", "en-GB"]);
export const djVoiceStyleSchema = z.literal("british-soft-radio");
export const profilePreferencesSchema = z.strictObject({
  profileId: profileIdSchema,
  themeMode: themeModeSchema,
  djLanguage: djLanguageSchema,
  djVoiceStyle: djVoiceStyleSchema,
  updatedAt: occurredAtSchema,
});
export const updateProfilePreferencesCommandSchema = z
  .strictObject({
    themeMode: themeModeSchema.optional(),
    djLanguage: djLanguageSchema.optional(),
    djVoiceStyle: djVoiceStyleSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one profile preference is required",
  });

export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>;
export type UpdateProfilePreferencesCommand = z.infer<typeof updateProfilePreferencesCommandSchema>;
