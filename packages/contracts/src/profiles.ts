import { z } from "zod";

import {
  controlledFileRefSchema,
  cursorSchema,
  occurredAtSchema,
  profileIdSchema,
} from "./common.js";

export const radioNameSchema = z.string().trim().min(2).max(24);
export const nicknameSchema = z.string().trim().min(1).max(20);
export const genreTagSchema = z.string().trim().min(1).max(24);
export const profileSchema = z.strictObject({
  id: profileIdSchema,
  radioName: radioNameSchema,
  nickname: nicknameSchema,
  avatarRef: controlledFileRefSchema.nullable(),
  frequentGenres: z.array(genreTagSchema).max(12),
  defaultScenario: z.string().trim().max(120),
  createdAt: occurredAtSchema,
  updatedAt: occurredAtSchema,
});
export const createProfileCommandSchema = z.strictObject({
  radioName: radioNameSchema,
  nickname: nicknameSchema,
  avatarRef: controlledFileRefSchema.nullable().optional(),
  frequentGenres: z.array(genreTagSchema).max(12).optional(),
  defaultScenario: z.string().trim().max(120).optional(),
});
export const updateProfileCommandSchema = z
  .strictObject({
    radioName: radioNameSchema.optional(),
    nickname: nicknameSchema.optional(),
    avatarRef: controlledFileRefSchema.nullable().optional(),
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

export type Profile = z.infer<typeof profileSchema>;
export type CreateProfileCommand = z.infer<typeof createProfileCommandSchema>;
export type UpdateProfileCommand = z.infer<typeof updateProfileCommandSchema>;
export type ProfileListResponse = z.infer<typeof profileListResponseSchema>;
