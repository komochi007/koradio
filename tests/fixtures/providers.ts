export const providerCorrelationId = "10000000-0000-4000-8000-000000000001";

export const codexPlanningContextFixture = {
  scenarioText: "今晚写东西，想要安静但不死板的 BGM",
  listeningIntent: null,
  effectiveTaste: {
    profileId: "20000000-0000-4000-8000-000000000001",
    projectionVersion: 2,
    overrideVersion: 1,
    resolvedTaste: {
      tags: ["dream-pop"],
      affinities: ["track:space-song"],
      avoidRules: ["过强鼓点"],
      sceneRules: ["夜晚写作保持低刺激"],
    },
  },
  tasteBlueprint: null,
  history: [
    {
      title: "Quiet Signals",
      scenarioText: "深夜阅读",
      createdAt: "2026-07-16T20:00:00.000Z",
      trackIds: [],
    },
  ],
  library: {
    tracks: [
      {
        trackId: "20000000-0000-4000-8000-000000000011",
        title: "Space Song",
        artist: "Beach House",
        album: "Depression Cherry",
        durationMs: 320_000,
      },
    ],
    maximumTracks: 5,
    preferredLibraryTrackCount: 1,
    minimumLibraryTrackCount: 1,
    requiredDiscoveryTrackCount: 0,
  },
  currentTime: "2026-07-17T20:00:00.000Z",
  preferences: {
    djLanguage: "zh-CN",
    djVoiceStyle: "natural-radio",
  },
} as const;

export const codexProgramPlanFixture = {
  programTitle: "Monday Night Exhale",
  scenarioSummary: "夜晚写作，需要安静但不死板的 BGM",
  djLanguage: "zh-CN",
  djPersona: "natural-radio",
  djScripts: [
    {
      type: "intro",
      language: "zh-CN",
      text: "今晚适合慢一点，但不要睡着。",
      displayText: "今晚适合慢一点，但不要睡着。",
      estimatedTiming: true,
    },
    {
      type: "segue",
      language: "zh-CN",
      text: "旋律先把房间慢慢打开，下一首歌会顺着这份余裕接住你。",
      displayText: "旋律先把房间慢慢打开，下一首歌会顺着这份余裕接住你。",
      estimatedTiming: true,
    },
    {
      type: "segue",
      language: "zh-CN",
      text: "留意人声收尾时的换气，节奏会把这段安静自然推向下一首。",
      displayText: "留意人声收尾时的换气，节奏会把这段安静自然推向下一首。",
      estimatedTiming: true,
    },
  ],
  trackIntents: [
    {
      kind: "library",
      trackId: "20000000-0000-4000-8000-000000000011",
      reason: "音乐库中的温柔低刺激锚点",
    },
    {
      kind: "discovery",
      keyword: "Space Song Beach House",
      expectedArtist: "Beach House",
      reason: "温柔、低刺激，适合夜间写作开场",
    },
  ],
  playlistIntent: {
    energy: "low-mid",
    mood: "calm",
    avoid: ["过强鼓点"],
  },
} as const;

export const netEaseTrackFixture = {
  id: 25638273,
  name: "Space Song",
  ar: [{ name: "Beach House" }],
  al: { name: "Depression Cherry" },
  dt: 320000,
  fee: 0,
  privilege: { st: 0 },
  noCopyrightRcmd: null,
} as const;

export const netEaseSearchFixture = {
  code: 200,
  result: { songs: [netEaseTrackFixture] },
} as const;

export const netEasePlaylistFixture = {
  code: 200,
  playlist: {
    id: 123456789,
    name: "Koradio Writing",
    tracks: [netEaseTrackFixture],
  },
} as const;

export const netEaseLyricsFixture = {
  code: 200,
  lrc: { lyric: "[00:00.00]It was late at night" },
  tlyric: { lyric: "[00:00.00]夜色已深" },
} as const;

export const netEaseAudioFixture = {
  code: 200,
  data: [
    {
      id: 25638273,
      code: 200,
      url: "http://m701.music.126.net/song.mp3?token=redacted",
    },
  ],
} as const;

export const ttsVoicesFixture = {
  voices: [
    {
      identifier: "com.apple.voice.compact.zh-CN.Tingting",
      language: "zh-CN",
      name: "Tingting",
      isPersonalVoice: false,
    },
  ],
} as const;

export const ttsWavBase64Fixture = Buffer.from("RIFF0000WAVEfmt ", "ascii").toString("base64");

export const ttsSynthesisFixture = {
  audioBase64: ttsWavBase64Fixture,
  extension: "wav",
  mimeType: "audio/wav",
  durationMs: 1600,
  markers: [
    {
      startMs: 0,
      endMs: 1600,
      text: "今晚适合慢一点，但不要睡着。",
    },
  ],
} as const;
