import {
  playbackCheckpointSchema,
  type PlaybackCheckpoint,
  type SavePlaybackCheckpointCommand,
} from "@koradio/contracts";

import { ApiRequestError, jsonRequest, requestJson } from "../shared/api.js";
import type { ServiceTransport } from "../shared/transport.js";

export async function getPlaybackCheckpoint(
  transport: ServiceTransport,
  profileId: string,
): Promise<PlaybackCheckpoint | null> {
  try {
    return await requestJson(
      transport,
      `/api/v1/profiles/${encodeURIComponent(profileId)}/playback`,
      playbackCheckpointSchema,
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      error.status === 404 &&
      error.envelope?.code === "PLAYBACK_SNAPSHOT_NOT_FOUND"
    ) {
      return null;
    }
    throw error;
  }
}

export function savePlaybackCheckpoint(
  transport: ServiceTransport,
  command: SavePlaybackCheckpointCommand,
): Promise<PlaybackCheckpoint> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(command.profileId)}/playback/checkpoints`,
    playbackCheckpointSchema,
    jsonRequest("PUT", command),
  );
}
