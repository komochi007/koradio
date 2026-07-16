import type {
  LibraryItem,
  LibraryListResponse,
  MusicTrack,
  PlaylistImportSnapshot,
} from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import {
  BoundedTtlCache,
  MusicProviderResponseError,
  createLibraryService,
  normalizeProviderTrack,
  parseProviderAudioResult,
  parseProviderLyricsResult,
  parseProviderPlaylistResult,
  parseProviderSearchResult,
  type LibraryRepository,
  type MusicProvider,
  type ProviderTrack,
} from "../../apps/server/src/modules/library/index.js";

const track: ProviderTrack = {
  source: "netease",
  sourceTrackId: "track-001",
  title: "Night Signal",
  artist: "Koradio",
  album: "Fixtures",
  durationMs: 180_000,
  lyricStatus: "available",
  playable: true,
};

function createRepository(overrides: Partial<LibraryRepository> = {}): LibraryRepository {
  return {
    addItem(): LibraryItem | null {
      return null;
    },
    completeImport(): PlaylistImportSnapshot {
      throw new Error("not used");
    },
    createImportJob() {
      throw new Error("not used");
    },
    failImport() {},
    findTrack(): MusicTrack | null {
      return null;
    },
    getImport(): PlaylistImportSnapshot | null {
      return null;
    },
    list(): LibraryListResponse {
      return { items: [] };
    },
    markImportRunning() {},
    recoverInterruptedImports() {},
    upsertTrack() {},
    ...overrides,
  };
}

describe("Library normalization and cache policy", () => {
  it("creates stable normalized identity and strips provider-only playability", () => {
    const normalized = normalizeProviderTrack(track);
    expect(normalized).toEqual(normalizeProviderTrack({ ...track }));
    expect(normalized.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(normalized).not.toHaveProperty("playable");

    const response = parseProviderSearchResult({
      items: [track, { ...track, sourceTrackId: "track-002", playable: false }],
      nextCursor: "cursor-001",
    });
    expect(response.items).toEqual([normalized]);
    expect(response.nextCursor).toBe("cursor-001");
  });

  it("rejects malformed provider search, playlist and lyric responses", () => {
    expect(() => parseProviderSearchResult({ items: [{ ...track, cookie: "secret" }] })).toThrow(
      MusicProviderResponseError,
    );
    expect(() => parseProviderSearchResult({ items: [track], nextCursor: "<script>" })).toThrow(
      MusicProviderResponseError,
    );
    expect(() =>
      parseProviderPlaylistResult({
        source: "netease",
        sourcePlaylistId: "playlist-001",
        title: " ",
        tracks: [],
      }),
    ).toThrow(MusicProviderResponseError);
    expect(() =>
      parseProviderLyricsResult(
        { status: "unavailable", content: "provider payload" },
        normalizeProviderTrack(track).id,
      ),
    ).toThrow(MusicProviderResponseError);
  });

  it("accepts valid lyrics and rejects expired or unsafe audio references", () => {
    const normalized = normalizeProviderTrack(track);
    expect(
      parseProviderLyricsResult({ status: "available", content: "[00:00.00]Night" }, normalized.id),
    ).toMatchObject({ trackId: normalized.id, status: "available" });

    const current = new Date("2026-07-16T08:00:00.000Z");
    expect(
      parseProviderAudioResult(
        {
          resolvedAudioRef: "https://media.example.com/song.m4a",
          expiresAt: "2026-07-16T08:05:00.000Z",
        },
        normalized.id,
        current,
      ),
    ).toMatchObject({ trackId: normalized.id });

    for (const resolvedAudioRef of [
      "http://media.example.com/song.m4a",
      "https://user:password@media.example.com/song.m4a",
      "https://localhost/song.m4a",
      "https://127.0.0.1/song.m4a",
      "https://[::1]/song.m4a",
    ]) {
      expect(() =>
        parseProviderAudioResult(
          {
            resolvedAudioRef,
            expiresAt: "2026-07-16T08:05:00.000Z",
          },
          normalized.id,
          current,
        ),
      ).toThrow(MusicProviderResponseError);
    }
    expect(() =>
      parseProviderAudioResult(
        {
          resolvedAudioRef: "https://media.example.com/song.m4a",
          expiresAt: "2026-07-16T08:00:00.000Z",
        },
        normalized.id,
        current,
      ),
    ).toThrow(MusicProviderResponseError);
  });

  it("expires entries, refreshes LRU order and enforces capacity", () => {
    let now = 0;
    const cache = new BoundedTtlCache<string, number>({
      capacity: 2,
      defaultTtlMs: 10,
      now: () => now,
    });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.size).toBe(2);

    now = 10;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
    cache.set("ignored", 4, 0);
    expect(cache.size).toBe(0);
    expect(() => new BoundedTtlCache({ capacity: 0, defaultTtlMs: 10 })).toThrow(TypeError);
  });

  it("tries at most two alternate keywords and caches empty and successful searches", async () => {
    let calls = 0;
    const persisted: MusicTrack[] = [];
    const provider: MusicProvider = {
      source: "netease",
      search() {
        calls += 1;
        return Promise.resolve({ items: calls === 3 ? [track] : [] });
      },
      importPlaylist() {
        return Promise.resolve({});
      },
      getLyrics() {
        return Promise.resolve({});
      },
      resolveAudio() {
        return Promise.resolve({});
      },
    };
    const service = createLibraryService({
      provider,
      repository: createRepository({
        upsertTrack(value) {
          persisted.push(value);
        },
      }),
    });

    const first = await service.searchWithFallback(["first", "second", "third", "fourth"]);
    const repeated = await service.searchWithFallback(["first", "second", "third", "fourth"]);
    expect(first.items).toHaveLength(1);
    expect(repeated).toEqual(first);
    expect(calls).toBe(3);
    expect(persisted).toHaveLength(1);
    await service.close();
  });
});
