import {
  dailyMixPlaybackCheckpointSchema,
  playbackCheckpointSchema,
  playbackSourceSessionSchema,
  type ActivatePlaybackSourceCommand,
  type DailyMixPlaybackCheckpoint,
  type PlaybackCheckpoint,
  type PlaybackSourceSession,
  type SaveDailyMixCheckpointCommand,
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

export async function getDailyMixCheckpoint(
  transport: ServiceTransport,
  profileId: string,
): Promise<DailyMixPlaybackCheckpoint | null> {
  try {
    return await requestJson(
      transport,
      `/api/v1/profiles/${encodeURIComponent(profileId)}/daily-mix-playback`,
      dailyMixPlaybackCheckpointSchema,
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

export function saveDailyMixCheckpoint(
  transport: ServiceTransport,
  command: SaveDailyMixCheckpointCommand,
): Promise<DailyMixPlaybackCheckpoint> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(command.profileId)}/daily-mix-playback/checkpoints`,
    dailyMixPlaybackCheckpointSchema,
    jsonRequest("PUT", command),
  );
}

export function activatePlaybackSource(
  transport: ServiceTransport,
  profileId: string,
  command: ActivatePlaybackSourceCommand,
): Promise<PlaybackSourceSession> {
  return requestJson(
    transport,
    `/api/v1/profiles/${encodeURIComponent(profileId)}/playback/source`,
    playbackSourceSessionSchema,
    jsonRequest("PUT", command),
  );
}

export async function getPlaybackSourceSession(
  transport: ServiceTransport,
  profileId: string,
): Promise<PlaybackSourceSession | null> {
  try {
    return await requestJson(
      transport,
      `/api/v1/profiles/${encodeURIComponent(profileId)}/playback/source`,
      playbackSourceSessionSchema,
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
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
