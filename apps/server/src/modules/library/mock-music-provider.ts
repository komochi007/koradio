import type { MusicProvider, ProviderTrack } from "./music-provider.js";

const tracks: ProviderTrack[] = [
  {
    source: "netease",
    sourceTrackId: "mock-space-song",
    title: "Space Song",
    artist: "Beach House",
    album: "Depression Cherry",
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
    durationMs: 180_000,
    lyricStatus: "unavailable",
    playable: false,
  },
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
        tracks,
      });
    },
    getLyrics(sourceTrackId) {
      if (sourceTrackId === "mock-space-song") {
        return Promise.resolve({
          status: "available",
          content: "[00:00.00]It was late at night",
        });
      }
      if (sourceTrackId === "mock-midnight-city") {
        return Promise.resolve({
          status: "untimed",
          content: "Waiting in a car",
        });
      }
      return Promise.resolve({ status: "unavailable", content: null });
    },
    resolveAudio(sourceTrackId) {
      return Promise.resolve({
        resolvedAudioRef: `https://media.example.invalid/audio/${encodeURIComponent(sourceTrackId)}.m4a`,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    },
  };
}
