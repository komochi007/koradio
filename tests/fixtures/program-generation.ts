export const s3GenerationScenario = "今晚写作，保持安静但不要沉闷";

export const s3GenerationPlanFixture = {
  programTitle: "Koradio S3 Mock Session",
  scenarioSummary: s3GenerationScenario,
  djLanguage: "zh-CN",
  djPersona: "british-soft-radio",
  djScripts: [
    {
      type: "intro",
      language: "zh-CN",
      text: "今晚慢一点，但别让思绪停下来。",
      displayText: "今晚慢一点，但别让思绪停下来。",
      estimatedTiming: true,
    },
  ],
  musicQueries: [
    { keyword: "S3 first empty", reason: "验证第一次搜索无结果" },
    { keyword: "S3 second empty", reason: "验证第二次搜索无结果" },
    { keyword: "S3 playable", reason: "验证第三次搜索得到固定曲目" },
  ],
  playlistIntent: {
    energy: "low-mid",
    mood: "focused",
    avoid: ["过强鼓点"],
  },
} as const;

export const s3InvalidGenerationPlanFixture = {
  ...s3GenerationPlanFixture,
  djScripts: [
    {
      type: "outro",
      language: "zh-CN",
      text: "没有开场的非法计划。",
      displayText: "没有开场的非法计划。",
      estimatedTiming: true,
    },
  ],
} as const;

export const s3PrimaryTrackFixture = {
  source: "netease",
  sourceTrackId: "s3-primary-track",
  title: "Quiet Signal",
  artist: "Koradio Fixture",
  album: "Backend Loop",
  durationMs: 180_000,
  lyricStatus: "available",
  playable: true,
} as const;

export const s3SecondaryTrackFixture = {
  source: "netease",
  sourceTrackId: "s3-secondary-track",
  title: "Late Signal",
  artist: "Koradio Fixture",
  album: "Backend Loop",
  durationMs: 210_000,
  lyricStatus: "unavailable",
  playable: true,
} as const;

export const s3LyricsFixture = {
  status: "available",
  content: "[00:00.00]Quiet signal",
} as const;

export const s3LyricsUnavailableFixture = {
  status: "unavailable",
  content: null,
} as const;

export const s3TtsFixture = {
  audioRef: "tts/30000000-0000-4000-8000-000000000001.wav",
  durationMs: 2_400,
  markers: [],
  estimatedTiming: true,
} as const;
