import type { MusicTrack } from "@koradio/contracts";
import { z } from "zod";

const responseSchema = z.object({
  recordings: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        "first-release-date": z.string().optional(),
      }),
    )
    .default([]),
});
const wikimediaSearchSchema = z.object({
  query: z.object({
    search: z.array(z.object({ title: z.string() })).default([]),
  }),
});
const wikimediaSummarySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  content_urls: z.object({ desktop: z.object({ page: z.url() }) }).optional(),
});

export interface MusicFact {
  fact: string;
  title: string;
  url: string;
  provider: "musicbrainz" | "wikimedia";
}

export interface MusicFactProvider {
  lookup(track: MusicTrack, signal?: AbortSignal): Promise<MusicFact[]>;
}

export function createMusicBrainzFactProvider(
  options: {
    fetcher?: typeof fetch;
    userAgent?: string;
  } = {},
): MusicFactProvider {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const userAgent = options.userAgent ?? "Koradio/1.0 (local personal radio)";
  const cache = new Map<string, MusicFact[]>();
  let nextRequestAt = 0;

  const requestSignal = (signal?: AbortSignal): AbortSignal => {
    const timeout = AbortSignal.timeout(4_000);
    return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  };

  const lookupMusicBrainz = async (
    track: MusicTrack,
    signal?: AbortSignal,
  ): Promise<MusicFact[]> => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        const abort = () => {
          clearTimeout(timer);
          reject(new Error("cancelled"));
        };
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    nextRequestAt = Date.now() + 1_050;
    const query = `recording:${JSON.stringify(track.title)} AND artist:${JSON.stringify(track.artist)}`;
    const url = new URL("https://musicbrainz.org/ws/2/recording/");
    url.searchParams.set("query", query);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "1");
    const response = await fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      signal: requestSignal(signal),
    });
    if (!response.ok) throw new Error("music_fact_unavailable");
    const parsed = responseSchema.safeParse(await response.json());
    const recording = parsed.success ? parsed.data.recordings[0] : undefined;
    const release = recording?.["first-release-date"];
    return recording === undefined || release === undefined
      ? []
      : [
          {
            fact: `MusicBrainz 将这首录音的首次发行日期记录为 ${release}。`,
            title: `${track.title} — MusicBrainz recording`,
            url: `https://musicbrainz.org/recording/${recording.id}`,
            provider: "musicbrainz",
          },
        ];
  };

  const lookupWikimedia = async (track: MusicTrack, signal?: AbortSignal): Promise<MusicFact[]> => {
    const boundedSignal = requestSignal(signal);
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", `${track.title} ${track.artist}`);
    searchUrl.searchParams.set("srlimit", "1");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    const searchResponse = await fetcher(searchUrl, { signal: boundedSignal });
    if (!searchResponse.ok) throw new Error("wikimedia_fact_unavailable");
    const search = wikimediaSearchSchema.safeParse(await searchResponse.json());
    const title = search.success ? search.data.query.search[0]?.title : undefined;
    if (title === undefined) return [];
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryResponse = await fetcher(summaryUrl, { signal: boundedSignal });
    if (!summaryResponse.ok) throw new Error("wikimedia_fact_unavailable");
    const summary = wikimediaSummarySchema.safeParse(await summaryResponse.json());
    if (!summary.success || summary.data.description === undefined) return [];
    return [
      {
        fact: `Wikimedia 将相关条目标注为“${summary.data.description.slice(0, 180)}”。`,
        title: `${summary.data.title} — Wikimedia`,
        url:
          summary.data.content_urls?.desktop.page ??
          `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.data.title)}`,
        provider: "wikimedia",
      },
    ];
  };

  return {
    async lookup(track, signal) {
      const key = `${track.source}:${track.sourceTrackId}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const settled = await Promise.allSettled([
        lookupMusicBrainz(track, signal),
        lookupWikimedia(track, signal),
      ]);
      const facts = settled.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      cache.set(key, facts);
      if (cache.size > 200) cache.delete(cache.keys().next().value ?? key);
      return facts;
    },
  };
}
