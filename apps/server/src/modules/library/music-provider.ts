import { createHash } from "node:crypto";
import { isIP } from "node:net";

import {
  audioResolutionSchema,
  lyricStatusSchema,
  musicSearchResponseSchema,
  musicSourceSchema,
  musicTrackSchema,
  occurredAtSchema,
  trackLyricsSchema,
  type AudioResolution,
  type MusicSearchResponse,
  type MusicTrack,
  type TrackLyrics,
} from "@koradio/contracts";
import { z } from "zod";

export const providerTrackSchema = z.strictObject({
  source: musicSourceSchema,
  sourceTrackId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300),
  album: z.string().trim().min(1).max(300),
  durationMs: z.number().int().positive(),
  lyricStatus: lyricStatusSchema,
  playable: z.boolean(),
});
export const providerSearchResultSchema = z.strictObject({
  items: z.array(providerTrackSchema).max(100),
  nextCursor: z.string().min(1).max(512).optional(),
});
export const providerPlaylistResultSchema = z.strictObject({
  source: musicSourceSchema,
  sourcePlaylistId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  tracks: z.array(providerTrackSchema).max(10_000),
});
export const providerLyricsResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.enum(["available", "untimed"]),
    content: z.string().min(1).max(1_000_000),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    content: z.null(),
  }),
]);
export const providerAudioResultSchema = z.strictObject({
  resolvedAudioRef: z.url(),
  expiresAt: occurredAtSchema,
});

export type ProviderTrack = z.infer<typeof providerTrackSchema>;
export type ProviderPlaylistResult = z.infer<typeof providerPlaylistResultSchema>;

export interface MusicProvider {
  readonly source: "netease";
  search(keyword: string): Promise<unknown>;
  importPlaylist(playlistRef: string): Promise<unknown>;
  getLyrics(sourceTrackId: string): Promise<unknown>;
  resolveAudio(sourceTrackId: string): Promise<unknown>;
}

export class MusicProviderResponseError extends Error {
  constructor() {
    super("Music provider returned an invalid response");
    this.name = "MusicProviderResponseError";
  }
}

export class MusicProviderUnavailableError extends Error {
  constructor() {
    super("Music provider is unavailable");
    this.name = "MusicProviderUnavailableError";
  }
}

function stableTrackId(source: string, sourceTrackId: string): string {
  const bytes = createHash("sha256").update(`${source}:${sourceTrackId}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeProviderTrack(track: ProviderTrack): MusicTrack {
  return musicTrackSchema.parse({
    id: stableTrackId(track.source, track.sourceTrackId),
    source: track.source,
    sourceTrackId: track.sourceTrackId,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    lyricStatus: track.lyricStatus,
  });
}

export function parseProviderSearchResult(value: unknown): MusicSearchResponse {
  const parsed = providerSearchResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new MusicProviderResponseError();
  }

  const response = musicSearchResponseSchema.safeParse({
    items: parsed.data.items.filter((track) => track.playable).map(normalizeProviderTrack),
    ...(parsed.data.nextCursor === undefined ? {} : { nextCursor: parsed.data.nextCursor }),
  });
  if (!response.success) {
    throw new MusicProviderResponseError();
  }
  return response.data;
}

export function parseProviderPlaylistResult(value: unknown): ProviderPlaylistResult {
  const parsed = providerPlaylistResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new MusicProviderResponseError();
  }
  return parsed.data;
}

export function parseProviderLyricsResult(value: unknown, trackId: string): TrackLyrics {
  const parsed = providerLyricsResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new MusicProviderResponseError();
  }
  return trackLyricsSchema.parse({ trackId, ...parsed.data });
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const addressFamily = isIP(normalized);
  if (addressFamily === 4) {
    const octets = normalized.split(".").map(Number);
    const first = octets[0] ?? 0;
    const second = octets[1] ?? 0;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  if (addressFamily === 6) {
    return true;
  }
  return false;
}

export function parseProviderAudioResult(
  value: unknown,
  trackId: string,
  now: Date,
): AudioResolution {
  const parsed = providerAudioResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new MusicProviderResponseError();
  }

  const url = new URL(parsed.data.resolvedAudioRef);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    isUnsafeHostname(url.hostname) ||
    Date.parse(parsed.data.expiresAt) <= now.getTime()
  ) {
    throw new MusicProviderResponseError();
  }

  return audioResolutionSchema.parse({
    trackId,
    resolvedAudioRef: url.toString(),
    expiresAt: parsed.data.expiresAt,
  });
}
