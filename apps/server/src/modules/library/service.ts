import { randomUUID } from "node:crypto";

import {
  audioResolutionSchema,
  libraryItemSchema,
  musicSearchResponseSchema,
  playlistImportSnapshotSchema,
  playlistSourceSchema,
  trackLyricsSchema,
  type AudioResolution,
  type LibraryItem,
  type LibraryListResponse,
  type MusicSearchResponse,
  type MusicTrack,
  type PlaylistImportSnapshot,
  type TrackLyrics,
} from "@koradio/contracts";

import { BoundedTtlCache } from "./cache.js";
import {
  MusicProviderResponseError,
  MusicProviderUnavailableError,
  normalizeProviderTrack,
  parseProviderAudioResult,
  parseProviderLyricsResult,
  parseProviderPlaylistResult,
  parseProviderSearchResult,
  type MusicProvider,
} from "./music-provider.js";
import type { LibraryRepository } from "./persistence.js";

export class LibraryTrackNotFoundError extends Error {
  constructor() {
    super("Library track was not found");
    this.name = "LibraryTrackNotFoundError";
  }
}

export class PlaylistImportNotFoundError extends Error {
  constructor() {
    super("Playlist import was not found");
    this.name = "PlaylistImportNotFoundError";
  }
}

export interface CreateLibraryServiceOptions {
  now?: () => Date;
  provider: MusicProvider;
  randomId?: () => string;
  repository: LibraryRepository;
}

export interface LibraryService {
  addItem(profileId: string, trackId: string, idempotencyKey: string): LibraryItem;
  close(): Promise<void>;
  getImport(profileId: string, jobId: string): PlaylistImportSnapshot;
  getLyrics(trackId: string): Promise<TrackLyrics>;
  getTracks(trackIds: string[]): MusicTrack[];
  hasTrack(trackId: string): boolean;
  importPlaylist(
    profileId: string,
    playlistRef: string,
    idempotencyKey: string,
  ): PlaylistImportSnapshot;
  list(profileId: string, cursor?: string, limit?: number): LibraryListResponse;
  resolveAudio(trackId: string): Promise<AudioResolution>;
  search(keyword: string): Promise<MusicSearchResponse>;
  searchWithFallback(keywords: string[]): Promise<MusicSearchResponse>;
}

export function createLibraryService(options: CreateLibraryServiceOptions): LibraryService {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;
  const searchCache = new BoundedTtlCache<string, MusicSearchResponse>({
    capacity: 100,
    defaultTtlMs: 5 * 60_000,
  });
  const lyricsCache = new BoundedTtlCache<string, TrackLyrics>({
    capacity: 500,
    defaultTtlMs: 60 * 60_000,
  });
  const audioCache = new BoundedTtlCache<string, AudioResolution>({
    capacity: 100,
    defaultTtlMs: 5 * 60_000,
  });
  const pendingImports = new Set<Promise<void>>();

  options.repository.recoverInterruptedImports(now().toISOString());

  async function searchOne(keyword: string): Promise<MusicSearchResponse> {
    const cacheKey = `${options.provider.source}:${keyword.trim().toLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let providerResponse: unknown;
    try {
      providerResponse = await options.provider.search(keyword);
    } catch {
      throw new MusicProviderUnavailableError();
    }
    const response = parseProviderSearchResult(providerResponse);
    const updatedAt = now().toISOString();
    for (const track of response.items) {
      options.repository.upsertTrack(track, updatedAt);
    }
    searchCache.set(cacheKey, response);
    return response;
  }

  async function runImport(jobId: string, playlistRef: string): Promise<void> {
    options.repository.markImportRunning(jobId, now().toISOString());
    try {
      let providerResponse: unknown;
      try {
        providerResponse = await options.provider.importPlaylist(playlistRef);
      } catch {
        throw new MusicProviderUnavailableError();
      }
      const imported = parseProviderPlaylistResult(providerResponse);
      const availableTracks = imported.tracks
        .filter((track) => track.playable)
        .map(normalizeProviderTrack);
      const importedAt = now().toISOString();
      options.repository.completeImport(
        jobId,
        playlistSourceSchema.parse({
          id: randomId(),
          source: imported.source,
          sourcePlaylistId: imported.sourcePlaylistId,
          title: imported.title,
          importedAt,
          availableTrackCount: availableTracks.length,
          unavailableTrackCount: imported.tracks.length - availableTracks.length,
        }),
        availableTracks,
      );
    } catch (error) {
      options.repository.failImport(
        jobId,
        error instanceof MusicProviderResponseError
          ? "MUSIC_PROVIDER_RESPONSE_INVALID"
          : error instanceof MusicProviderUnavailableError
            ? "MUSIC_PROVIDER_UNAVAILABLE"
            : "LIBRARY_IMPORT_FAILED",
        now().toISOString(),
      );
    }
  }

  function startImport(jobId: string, playlistRef: string): void {
    const promise = Promise.resolve()
      .then(() => runImport(jobId, playlistRef))
      .finally(() => {
        pendingImports.delete(promise);
      });
    pendingImports.add(promise);
  }

  return {
    addItem(profileId, trackId, idempotencyKey) {
      const item = options.repository.addItem(
        profileId,
        trackId,
        idempotencyKey,
        now().toISOString(),
      );
      if (item === null) {
        throw new LibraryTrackNotFoundError();
      }
      return libraryItemSchema.parse(item);
    },
    async close() {
      await Promise.allSettled(pendingImports);
    },
    getImport(profileId, jobId) {
      const snapshot = options.repository.getImport(profileId, jobId);
      if (snapshot === null) {
        throw new PlaylistImportNotFoundError();
      }
      return playlistImportSnapshotSchema.parse(snapshot);
    },
    async getLyrics(trackId) {
      const track = options.repository.findTrack(trackId);
      if (track === null) {
        throw new LibraryTrackNotFoundError();
      }
      const cacheKey = `${track.source}:${track.sourceTrackId}`;
      const cached = lyricsCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      let providerResponse: unknown;
      try {
        providerResponse = await options.provider.getLyrics(track.sourceTrackId);
      } catch {
        throw new MusicProviderUnavailableError();
      }
      const lyrics = parseProviderLyricsResult(providerResponse, track.id);
      lyricsCache.set(cacheKey, lyrics);
      return trackLyricsSchema.parse(lyrics);
    },
    getTracks(trackIds) {
      return trackIds.map((trackId) => {
        const track = options.repository.findTrack(trackId);
        if (track === null) {
          throw new LibraryTrackNotFoundError();
        }
        return track;
      });
    },
    hasTrack(trackId) {
      return options.repository.findTrack(trackId) !== null;
    },
    importPlaylist(profileId, playlistRef, idempotencyKey) {
      const createdAt = now().toISOString();
      const result = options.repository.createImportJob(
        randomId(),
        profileId,
        idempotencyKey,
        playlistRef,
        createdAt,
      );
      if (result.created) {
        startImport(result.snapshot.jobId, playlistRef);
      }
      return playlistImportSnapshotSchema.parse(result.snapshot);
    },
    list(profileId, cursor, limit) {
      return options.repository.list(profileId, cursor, limit);
    },
    async resolveAudio(trackId) {
      const track = options.repository.findTrack(trackId);
      if (track === null) {
        throw new LibraryTrackNotFoundError();
      }
      const cacheKey = `${track.source}:${track.sourceTrackId}`;
      const cached = audioCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const current = now();
      let providerResponse: unknown;
      try {
        providerResponse = await options.provider.resolveAudio(track.sourceTrackId);
      } catch {
        throw new MusicProviderUnavailableError();
      }
      const resolution = parseProviderAudioResult(providerResponse, track.id, current);
      audioCache.set(
        cacheKey,
        resolution,
        Math.min(Date.parse(resolution.expiresAt) - current.getTime(), 10 * 60_000),
      );
      return audioResolutionSchema.parse(resolution);
    },
    search(keyword) {
      return searchOne(keyword);
    },
    async searchWithFallback(keywords) {
      const candidates = [
        ...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
      ].slice(0, 3);
      let response = musicSearchResponseSchema.parse({ items: [] });
      for (const keyword of candidates) {
        response = await searchOne(keyword);
        if (response.items.length > 0) {
          return response;
        }
      }
      return response;
    },
  };
}
