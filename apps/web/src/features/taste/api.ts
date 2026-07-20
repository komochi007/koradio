import {
  tasteResponseSchema,
  type TasteResponse,
  type UpdateTasteOverridesCommand,
} from "@koradio/contracts";

import { jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

function tastePath(profileId: string): string {
  return `/api/v1/profiles/${encodeURIComponent(profileId)}/taste`;
}

export function getTaste(transport: ServiceTransport, profileId: string): Promise<TasteResponse> {
  return requestJson(transport, tastePath(profileId), tasteResponseSchema);
}

export function updateTasteOverrides(
  transport: ServiceTransport,
  profileId: string,
  command: UpdateTasteOverridesCommand,
): Promise<TasteResponse> {
  return requestJson(
    transport,
    tastePath(profileId),
    tasteResponseSchema,
    jsonRequest("PATCH", command),
  );
}
