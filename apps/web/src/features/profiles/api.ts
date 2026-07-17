import {
  currentProfileResponseSchema,
  profileAvatarUploadResponseSchema,
  profileListResponseSchema,
  profileSchema,
  type CreateProfileCommand,
  type CurrentProfileResponse,
  type Profile,
  type ProfileListResponse,
  type UpdateProfileCommand,
} from "@koradio/contracts";

import { createIdempotencyKey, jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function getProfiles(transport: ServiceTransport): Promise<ProfileListResponse> {
  return requestJson(transport, "/api/v1/profiles", profileListResponseSchema);
}

export function getCurrentProfile(transport: ServiceTransport): Promise<CurrentProfileResponse> {
  return requestJson(transport, "/api/v1/profiles/current", currentProfileResponseSchema);
}

export function createProfile(
  transport: ServiceTransport,
  command: CreateProfileCommand,
): Promise<Profile> {
  const init = jsonRequest("POST", command);
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", createIdempotencyKey());
  init.headers = headers;
  return requestJson(transport, "/api/v1/profiles", profileSchema, init);
}

export function updateProfile(
  transport: ServiceTransport,
  profileId: string,
  command: UpdateProfileCommand,
): Promise<Profile> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}`,
    profileSchema,
    jsonRequest("PATCH", command),
  );
}

export function selectProfile(
  transport: ServiceTransport,
  profileId: string,
): Promise<CurrentProfileResponse> {
  return requestJson(
    transport,
    "/api/v1/profiles/current",
    currentProfileResponseSchema,
    jsonRequest("PUT", { profileId }),
  );
}

export async function uploadAvatar(transport: ServiceTransport, file: File): Promise<string> {
  const form = new FormData();
  form.append("avatar", file);
  const result = await requestJson(
    transport,
    "/api/v1/profile-avatars",
    profileAvatarUploadResponseSchema,
    { method: "POST", body: form },
  );
  return result.avatarRef;
}
