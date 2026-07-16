export const ids = {
  profile: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf01",
  program: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf02",
  job: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf03",
  track: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf04",
  trackTwo: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf05",
  playlistSource: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf12",
  timelineDj: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf06",
  timelineTrack: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf07",
  segment: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf08",
  feedback: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf09",
  event: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf10",
  correlation: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdf11",
} as const;

export const now = "2026-07-16T08:00:00.000Z";

export const health = {
  service: "koradio",
  status: "ready",
  mode: "mock",
  providers: {
    codex: "available",
    netease: "available",
    tts: "degraded",
  },
  checkedAt: now,
} as const;

export const profile = {
  id: ids.profile,
  radioName: "Night Signals",
  nickname: "Klein",
  avatarRef: "avatars/profile/avatar.webp",
  frequentGenres: ["dream pop", "ambient"],
  defaultScenario: "夜晚写作",
  createdAt: now,
  updatedAt: now,
} as const;

export const preferences = {
  profileId: ids.profile,
  themeMode: "dark",
  djLanguage: "zh-CN",
  djVoiceStyle: "british-soft-radio",
  updatedAt: now,
} as const;

export const track = {
  id: ids.track,
  source: "netease",
  sourceTrackId: "347230",
  title: "Space Song",
  artist: "Beach House",
  album: "Depression Cherry",
  durationMs: 320000,
  lyricStatus: "available",
} as const;

export const trackTwo = {
  ...track,
  id: ids.trackTwo,
  sourceTrackId: "186855",
  title: "If",
  artist: "Bread",
  album: "Manna",
  durationMs: 155000,
  lyricStatus: "untimed",
} as const;

export const djScript = {
  id: ids.segment,
  programId: ids.program,
  type: "intro",
  language: "zh-CN",
  text: "今晚适合慢一点，但不要睡着。",
  displayText: "今晚适合慢一点，但不要睡着。",
  estimatedTiming: true,
  ttsAudioRef: "tts/program/intro.m4a",
} as const;

export const djTimelineItem = {
  id: ids.timelineDj,
  kind: "dj",
  position: 0,
  segmentId: ids.segment,
  audioRef: "tts/program/intro.m4a",
  durationMs: 12000,
} as const;

export const trackTimelineItem = {
  id: ids.timelineTrack,
  kind: "track",
  position: 1,
  trackId: ids.track,
  resolvedAudioRef: "media/program/space-song.m4a",
  durationMs: 320000,
} as const;

export const program = {
  id: ids.program,
  profileId: ids.profile,
  scenarioText: "今晚写作，想要安静但不死板的 BGM",
  title: "Monday Night Exhale",
  status: "ready",
  trackIds: [ids.track],
  createdAt: now,
} as const;

export const programDetail = {
  program,
  djScripts: [djScript],
  tracks: [track],
  timeline: [djTimelineItem, trackTimelineItem],
} as const;

export const checkpoint = {
  profileId: ids.profile,
  programId: ids.program,
  timelineItemId: ids.timelineTrack,
  positionMs: 45000,
  volume: 0.8,
  status: "playing",
  savedAt: now,
} as const;

export const feedback = {
  id: ids.feedback,
  profileId: ids.profile,
  targetId: ids.track,
  type: "track_liked",
  idempotencyKey: "feedback-001",
  createdAt: now,
} as const;

export const envelope = {
  eventId: ids.event,
  version: 1,
  profileId: ids.profile,
  correlationId: ids.correlation,
  sequence: 3,
  occurredAt: now,
} as const;
