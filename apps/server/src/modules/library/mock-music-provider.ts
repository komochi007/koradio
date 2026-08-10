import type { MusicProvider, ProviderTrack } from "./music-provider.js";

const mockAudioRefs = new Map([
  ["mock-space-song", "media/00000000-0000-4000-8000-000000000001.wav"],
  ["mock-midnight-city", "media/00000000-0000-4000-8000-000000000002.wav"],
  ...Array.from(
    { length: 22 },
    (_, index) =>
      [
        `mock-fixture-${String(index + 3)}`,
        `media/00000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}.wav`,
      ] as const,
  ),
]);

const tracks: ProviderTrack[] = [
  {
    source: "netease",
    sourceTrackId: "mock-space-song",
    title: "Space Song",
    artist: "Beach House",
    album: "Depression Cherry",
    artworkUrl: null,
    durationMs: 320_000,
    lyricStatus: "available",
    playable: true,
  },
  {
    source: "netease",
    sourceTrackId: "mock-midnight-city",
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    artworkUrl: null,
    durationMs: 244_000,
    lyricStatus: "untimed",
    playable: true,
  },
  {
    source: "netease",
    sourceTrackId: "mock-unavailable",
    title: "Unavailable Signal",
    artist: "Koradio Fixture",
    album: "Provider Tests",
    artworkUrl: null,
    durationMs: 180_000,
    lyricStatus: "unavailable",
    playable: false,
  },
  ...[
    ["Quiet Signal", "Artist Three"],
    ["Soft Current", "Artist Four"],
    ["Night Window", "Artist Five"],
    ["Slow Orbit", "Artist Six"],
    ["Paper Moon", "Artist Seven"],
    ["After Rain", "Artist Eight"],
    ["Green Room", "Artist Nine"],
    ["Last Light", "Artist Ten"],
    ["Small Hours", "Artist Eleven"],
    ["Open Road", "Artist Twelve"],
    ["Blue Hour", "Artist Thirteen"],
    ["Window Seat", "Artist Fourteen"],
    ["Low Tide", "Artist Fifteen"],
    ["Silver Lines", "Artist Sixteen"],
    ["Common Ground", "Artist Seventeen"],
    ["Northbound", "Artist Eighteen"],
    ["Velvet Sky", "Artist Nineteen"],
    ["Slow Bloom", "Artist Twenty"],
    ["Warm Static", "Artist Twenty-One"],
    ["Corner Light", "Artist Twenty-Two"],
    ["Soft Focus", "Artist Twenty-Three"],
    ["First Train", "Artist Twenty-Four"],
  ].map(([title, artist], index): ProviderTrack => ({
    source: "netease",
    sourceTrackId: `mock-fixture-${String(index + 3)}`,
    title: title ?? "Fixture",
    artist: artist ?? "Fixture Artist",
    album: "Koradio Sessions",
    artworkUrl: null,
    durationMs: 180_000 + index * 1_000,
    lyricStatus: "untimed",
    playable: true,
  })),
];

export function createMockMusicProvider(): MusicProvider {
  return {
    source: "netease",
    search(keyword) {
      const tokens = keyword.trim().toLowerCase().split(/\s+/u).filter(Boolean);
      return Promise.resolve({
        items: tracks.filter((track) => {
          const searchable = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
          return tokens.every((token) => searchable.includes(token));
        }),
      });
    },
    importPlaylist(playlistRef) {
      return Promise.resolve({
        source: "netease",
        sourcePlaylistId: playlistRef,
        title: "Koradio Mock Playlist",
        tracks: tracks.slice(0, 3),
      });
    },
    getLyrics(sourceTrackId) {
      if (sourceTrackId === "mock-space-song") {
        return Promise.resolve({
          status: "available",
          content: "[00:00.00]It was late at night",
          originalContent: "[00:00.00]It was late at night",
        });
      }
      if (sourceTrackId === "mock-midnight-city") {
        return Promise.resolve({
          status: "untimed",
          content: "Waiting in a car",
          originalContent: "Waiting in a car",
        });
      }
      if (sourceTrackId.startsWith("mock-fixture-")) {
        return Promise.resolve({
          status: "untimed",
          content: "A quiet line for deterministic tests",
          originalContent: "A quiet line for deterministic tests",
        });
      }
      return Promise.resolve({ status: "unavailable", content: null });
    },
    resolveAudio(sourceTrackId) {
      const resolvedAudioRef = mockAudioRefs.get(sourceTrackId);
      if (resolvedAudioRef === undefined) {
        return Promise.reject(new Error("Mock track is unavailable"));
      }
      return Promise.resolve({
        resolvedAudioRef,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    },
  };
}
