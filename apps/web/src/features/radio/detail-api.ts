import { trackLyricsSchema, type TrackLyrics } from "@koradio/contracts";

import { requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

export function getTrackLyrics(
  transport: ServiceTransport,
  profileId: string,
  trackId: string,
): Promise<TrackLyrics> {
  return requestJson(
    transport,
    `/api/v1/profiles/${profileId}/tracks/${trackId}/lyrics`,
    trackLyricsSchema,
  );
}
