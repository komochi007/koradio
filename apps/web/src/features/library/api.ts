import {
  audioResolutionSchema,
  jobAcceptedResponseSchema,
  libraryItemSchema,
  libraryListResponseSchema,
  musicSearchResponseSchema,
  playlistImportSnapshotSchema,
  type AudioResolution,
  type JobAcceptedResponse,
  type LibraryItem,
  type LibraryListResponse,
  type MusicSearchResponse,
  type PlaylistImportSnapshot,
} from "@koradio/contracts";

import { createIdempotencyKey, jsonRequest, requestJson } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";

function profilePath(profileId: string): string {
  return `/api/v1/profiles/${encodeURIComponent(profileId)}`;
}

export function getLibraryPage(
  transport: ServiceTransport,
  profileId: string,
  cursor?: string,
  limit = 5,
): Promise<LibraryListResponse> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) query.set("cursor", cursor);
  return requestJson(
    transport,
    `${profilePath(profileId)}/library?${query.toString()}`,
    libraryListResponseSchema,
  );
}

export function searchMusic(
  transport: ServiceTransport,
  profileId: string,
  keyword: string,
): Promise<MusicSearchResponse> {
  return requestJson(
    transport,
    `${profilePath(profileId)}/music-searches`,
    musicSearchResponseSchema,
    jsonRequest("POST", { keyword }),
  );
}

export function addLibraryItem(
  transport: ServiceTransport,
  profileId: string,
  trackId: string,
): Promise<LibraryItem> {
  const init = jsonRequest("POST", { trackId });
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", createIdempotencyKey());
  return requestJson(transport, `${profilePath(profileId)}/library-items`, libraryItemSchema, {
    ...init,
    headers,
  });
}

export function importPlaylist(
  transport: ServiceTransport,
  profileId: string,
  playlistRef: string,
): Promise<JobAcceptedResponse> {
  const init = jsonRequest("POST", { playlistRef });
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", createIdempotencyKey());
  return requestJson(
    transport,
    `${profilePath(profileId)}/playlist-imports`,
    jobAcceptedResponseSchema,
    { ...init, headers },
  );
}

export function getPlaylistImport(
  transport: ServiceTransport,
  profileId: string,
  jobId: string,
): Promise<PlaylistImportSnapshot> {
  return requestJson(
    transport,
    `${profilePath(profileId)}/playlist-imports/${encodeURIComponent(jobId)}`,
    playlistImportSnapshotSchema,
  );
}

export function resolveTrackAudio(
  transport: ServiceTransport,
  profileId: string,
  trackId: string,
): Promise<AudioResolution> {
  return requestJson(
    transport,
    `${profilePath(profileId)}/tracks/${encodeURIComponent(trackId)}/audio-resolutions`,
    audioResolutionSchema,
    { method: "POST" },
  );
}
