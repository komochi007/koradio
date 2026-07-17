import { Buffer } from "node:buffer";
import { createCipheriv } from "node:crypto";
import { lookup } from "node:dns";
import { isIP } from "node:net";

import { z } from "zod";

import {
  MusicProviderResponseError,
  MusicProviderUnavailableError,
  type MusicProvider,
  type MusicProviderCallOptions,
  type ProviderTrack,
} from "../modules/library/index.js";

const linuxApiEndpoint = "https://music.163.com/api/linux/forward";
const linuxApiKey = Buffer.from("rFgB&h#%2?^eDg:Q", "utf8");
const maximumProviderResponseBytes = 2 * 1_048_576;
const maximumMediaBytes = 100 * 1_048_576;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const sourceIdSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d{1,20}$/u)])
  .transform(String);
const artistSchema = z.object({ name: z.string().trim().max(300) });
const trackSchema = z.object({
  id: sourceIdSchema,
  name: z.string().trim().min(1).max(300),
  ar: z.array(artistSchema).min(1).max(20),
  al: z.object({ name: z.string().trim().max(300) }),
  dt: z.number().int().positive(),
  fee: z.number().int().optional(),
  privilege: z.object({ st: z.number().int() }).optional(),
  noCopyrightRcmd: z.unknown().nullable().optional(),
});
const searchResponseSchema = z.object({
  code: z.literal(200),
  result: z.object({
    songs: z.array(trackSchema).max(100).optional().default([]),
  }),
});
const playlistResponseSchema = z.object({
  code: z.literal(200),
  playlist: z.object({
    id: sourceIdSchema,
    name: z.string().trim().min(1).max(300),
    tracks: z.array(trackSchema).max(10_000),
  }),
});
const lyricsResponseSchema = z.object({
  code: z.literal(200),
  nolyric: z.boolean().optional(),
  lrc: z.object({ lyric: z.string().max(1_000_000) }).optional(),
  tlyric: z.object({ lyric: z.string().max(1_000_000) }).optional(),
});
const audioResponseSchema = z.object({
  code: z.literal(200),
  data: z
    .array(
      z.object({
        id: sourceIdSchema,
        code: z.number().int(),
        url: z.url().nullable(),
      }),
    )
    .min(1)
    .max(100),
});

export interface DnsAddress {
  address: string;
  family: number;
}

export type DnsResolver = (hostname: string) => Promise<readonly DnsAddress[]>;

export interface CreateNetEaseAdapterOptions {
  dnsResolver?: DnsResolver;
  fetchImplementation?: typeof fetch;
  maximumRedirects?: number;
  now?: () => Date;
  timeoutMs?: number;
}

function encryptLinuxApiPayload(path: string, params: Readonly<Record<string, unknown>>): string {
  const cipher = createCipheriv("aes-128-ecb", linuxApiKey, null);
  const payload = JSON.stringify({
    method: "POST",
    url: `https://music.163.com${path}`,
    params,
  });
  return Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
    .toString("hex")
    .toUpperCase();
}

function providerTrack(track: z.infer<typeof trackSchema>): ProviderTrack {
  const artists = track.ar.map((artist) => artist.name).filter((name) => name.length > 0);
  return {
    source: "netease",
    sourceTrackId: track.id,
    title: track.name,
    artist: artists.length === 0 ? "Unknown Artist" : artists.join(" / "),
    album: track.al.name.length === 0 ? "Unknown Album" : track.al.name,
    durationMs: track.dt,
    lyricStatus: "unavailable",
    playable: track.noCopyrightRcmd == null && track.fee !== 4 && (track.privilege?.st ?? 0) >= 0,
  };
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (response.body === null) {
    throw new MusicProviderResponseError();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    let result = await reader.read();
    while (!result.done) {
      totalBytes += result.value.byteLength;
      if (totalBytes > maximumProviderResponseBytes) {
        throw new MusicProviderResponseError();
      }
      chunks.push(result.value);
      result = await reader.read();
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

function parseJsonResponse(response: string): unknown {
  try {
    return JSON.parse(response);
  } catch {
    throw new MusicProviderResponseError();
  }
}

function requestSignal(
  options: MusicProviderCallOptions | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return options?.signal === undefined
    ? timeoutSignal
    : AbortSignal.any([options.signal, timeoutSignal]);
}

function mapFetchFailure(
  options: MusicProviderCallOptions | undefined,
  signal: AbortSignal,
): MusicProviderUnavailableError {
  if (options?.signal?.aborted === true) {
    return new MusicProviderUnavailableError("cancelled");
  }
  return new MusicProviderUnavailableError(signal.aborted ? "timeout" : "unavailable");
}

export const resolvePublicDns: DnsResolver = (hostname) =>
  new Promise((resolveAddresses, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error !== null) {
        reject(new MusicProviderUnavailableError());
        return;
      }
      resolveAddresses(addresses);
    });
  });

function isUnsafeIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const first = octets[0] ?? 0;
  const second = octets[1] ?? 0;
  const third = octets[2] ?? 0;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isUnsafeIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return isUnsafeIpv4(address);
  }
  if (family !== 6) {
    return true;
  }
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    /^f[cd]/u.test(normalized) ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

function isAllowedMediaHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "music.126.net" || normalized.endsWith(".music.126.net");
}

function resolveMediaAddresses(
  hostname: string,
  dnsResolver: DnsResolver,
  signal: AbortSignal,
): Promise<readonly DnsAddress[]> {
  return new Promise((resolveAddresses, reject) => {
    const abort = (): void => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    dnsResolver(hostname).then(
      (addresses) => {
        signal.removeEventListener("abort", abort);
        resolveAddresses(addresses);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error("DNS resolution failed"));
      },
    );
  });
}

async function validateMediaUrl(
  value: string,
  dnsResolver: DnsResolver,
  signal: AbortSignal,
  base?: URL,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new MusicProviderResponseError();
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    isIP(url.hostname) !== 0 ||
    !isAllowedMediaHostname(url.hostname)
  ) {
    throw new MusicProviderResponseError();
  }
  let addresses: readonly DnsAddress[];
  try {
    addresses = await resolveMediaAddresses(url.hostname, dnsResolver, signal);
  } catch (error) {
    if (error instanceof MusicProviderUnavailableError) {
      throw error;
    }
    throw error;
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isUnsafeIp(address))) {
    throw new MusicProviderResponseError();
  }
  url.protocol = "https:";
  return url;
}

function parseContentRange(value: string | null): number {
  const match = /^bytes 0-0\/(\d+)$/u.exec(value ?? "");
  const totalBytes = Number(match?.[1]);
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || totalBytes > maximumMediaBytes) {
    throw new MusicProviderResponseError();
  }
  return totalBytes;
}

async function probeMediaUrl(
  initialUrl: string,
  options: MusicProviderCallOptions | undefined,
  configuration: Required<
    Pick<
      CreateNetEaseAdapterOptions,
      "dnsResolver" | "fetchImplementation" | "maximumRedirects" | "timeoutMs"
    >
  >,
): Promise<URL> {
  const signal = requestSignal(options, configuration.timeoutMs);
  try {
    let url = await validateMediaUrl(initialUrl, configuration.dnsResolver, signal);
    for (let redirectCount = 0; ; redirectCount += 1) {
      const response = await configuration.fetchImplementation(url, {
        headers: { Range: "bytes=0-0" },
        redirect: "manual",
        signal,
      });
      if (redirectStatuses.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        if (redirectCount >= configuration.maximumRedirects) {
          throw new MusicProviderResponseError();
        }
        const location = response.headers.get("location");
        if (location === null) {
          throw new MusicProviderResponseError();
        }
        url = await validateMediaUrl(location, configuration.dnsResolver, signal, url);
        continue;
      }
      await response.body?.cancel().catch(() => undefined);
      const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (response.status !== 206 || mimeType === undefined || !mimeType.startsWith("audio/")) {
        throw new MusicProviderResponseError();
      }
      parseContentRange(response.headers.get("content-range"));
      return url;
    }
  } catch (error) {
    if (
      error instanceof MusicProviderResponseError ||
      error instanceof MusicProviderUnavailableError
    ) {
      throw error;
    }
    throw mapFetchFailure(options, signal);
  }
}

function parsePlaylistReference(value: string): string {
  const normalized = value.trim();
  if (/^\d{1,20}$/u.test(normalized)) {
    return normalized;
  }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new MusicProviderResponseError();
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    !["music.163.com", "y.music.163.com"].includes(url.hostname.toLowerCase())
  ) {
    throw new MusicProviderResponseError();
  }
  const sourceId = url.searchParams.get("id");
  if (sourceId === null || !/^\d{1,20}$/u.test(sourceId)) {
    throw new MusicProviderResponseError();
  }
  return sourceId;
}

export function createNetEaseAdapter(options: CreateNetEaseAdapterOptions = {}): MusicProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const dnsResolver = options.dnsResolver ?? resolvePublicDns;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maximumRedirects = options.maximumRedirects ?? 3;
  const now = options.now ?? (() => new Date());

  async function request(
    path: string,
    params: Readonly<Record<string, unknown>>,
    callOptions?: MusicProviderCallOptions,
  ): Promise<unknown> {
    const signal = requestSignal(callOptions, timeoutMs);
    try {
      const response = await fetchImplementation(linuxApiEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: "https://music.163.com/",
          "user-agent": "Koradio/1.0 Personal Local Preview",
        },
        body: new URLSearchParams({ eparams: encryptLinuxApiPayload(path, params) }),
        redirect: "error",
        signal,
      });
      if (response.status === 429) {
        throw new MusicProviderUnavailableError();
      }
      if (!response.ok) {
        throw new MusicProviderUnavailableError();
      }
      return parseJsonResponse(await readBoundedResponse(response));
    } catch (error) {
      if (
        error instanceof MusicProviderResponseError ||
        error instanceof MusicProviderUnavailableError
      ) {
        throw error;
      }
      throw mapFetchFailure(callOptions, signal);
    }
  }

  return {
    source: "netease",
    async search(keyword, callOptions) {
      const normalized = keyword.trim();
      if (normalized.length === 0 || normalized.length > 100) {
        throw new MusicProviderResponseError();
      }
      const parsed = searchResponseSchema.safeParse(
        await request(
          "/api/cloudsearch/pc",
          { s: normalized, type: 1, limit: 50, offset: 0 },
          callOptions,
        ),
      );
      if (!parsed.success) {
        throw new MusicProviderResponseError();
      }
      return { items: parsed.data.result.songs.map(providerTrack) };
    },
    async importPlaylist(playlistRef, callOptions) {
      const sourcePlaylistId = parsePlaylistReference(playlistRef);
      const parsed = playlistResponseSchema.safeParse(
        await request(
          "/api/v6/playlist/detail",
          { id: sourcePlaylistId, n: 10_000, s: 0 },
          callOptions,
        ),
      );
      if (!parsed.success || parsed.data.playlist.id !== sourcePlaylistId) {
        throw new MusicProviderResponseError();
      }
      return {
        source: "netease",
        sourcePlaylistId,
        title: parsed.data.playlist.name,
        tracks: parsed.data.playlist.tracks.map(providerTrack),
      };
    },
    async getLyrics(sourceTrackId, callOptions) {
      const id = sourceIdSchema.safeParse(sourceTrackId);
      if (!id.success) {
        throw new MusicProviderResponseError();
      }
      const parsed = lyricsResponseSchema.safeParse(
        await request("/api/song/lyric", { id: id.data, lv: -1, tv: -1 }, callOptions),
      );
      if (!parsed.success) {
        throw new MusicProviderResponseError();
      }
      const original = parsed.data.lrc?.lyric.trim() ?? "";
      if (parsed.data.nolyric === true || original.length === 0) {
        return { status: "unavailable", content: null };
      }
      const translation = parsed.data.tlyric?.lyric.trim() ?? "";
      const content = translation.length === 0 ? original : `${original}\n${translation}`;
      return {
        status: /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/u.test(original) ? "available" : "untimed",
        content,
      };
    },
    async resolveAudio(sourceTrackId, callOptions) {
      const id = sourceIdSchema.safeParse(sourceTrackId);
      if (!id.success) {
        throw new MusicProviderResponseError();
      }
      const parsed = audioResponseSchema.safeParse(
        await request("/api/song/enhance/player/url", { ids: [id.data], br: 320_000 }, callOptions),
      );
      if (!parsed.success) {
        throw new MusicProviderResponseError();
      }
      const track = parsed.data.data.find((item) => item.id === id.data);
      if (track === undefined || track.code !== 200 || track.url === null) {
        throw new MusicProviderUnavailableError();
      }
      const url = await probeMediaUrl(track.url, callOptions, {
        dnsResolver,
        fetchImplementation,
        maximumRedirects,
        timeoutMs,
      });
      return {
        resolvedAudioRef: url.toString(),
        expiresAt: new Date(now().getTime() + 5 * 60_000).toISOString(),
      };
    },
  };
}
