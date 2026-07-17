import {
  profilePreferencesSchema,
  type ProfilePreferences,
  type UpdateProfilePreferencesCommand,
} from "@koradio/contracts";

import { jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function updateProfilePreferences(
  transport: ServiceTransport,
  profileId: string,
  command: UpdateProfilePreferencesCommand,
): Promise<ProfilePreferences> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/preferences`,
    profilePreferencesSchema,
    jsonRequest("PATCH", command),
  );
}
