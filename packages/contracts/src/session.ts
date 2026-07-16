import { z } from "zod";

export const sessionAccessTokenSchema = z.string().min(32).max(512);
export const sessionBootstrapResponseSchema = z.strictObject({
  accessToken: sessionAccessTokenSchema,
  expiresAt: z.iso.datetime(),
});
export const sessionAuthenticateSchema = z.strictObject({
  type: z.literal("session.authenticate"),
  accessToken: sessionAccessTokenSchema,
});

export type SessionBootstrapResponse = z.infer<typeof sessionBootstrapResponseSchema>;
export type SessionAuthenticate = z.infer<typeof sessionAuthenticateSchema>;
