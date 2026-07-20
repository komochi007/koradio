import type { Profile, ProgramDetail } from "@koradio/contracts";

export const s6Profile: Profile = {
  id: "60000000-0000-4000-8000-000000000001",
  radioName: "Failure Matrix Radio",
  nickname: "S6",
  avatarRef: null,
  frequentGenres: ["Ambient"],
  defaultScenario: "夜晚写作",
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
};

export const s6OldProgram: ProgramDetail = {
  program: {
    id: "60000000-0000-4000-8000-000000000010",
    profileId: s6Profile.id,
    scenarioText: "旧节目继续播放",
    title: "Known Good Session",
    status: "ready",
    trackIds: ["60000000-0000-4000-8000-000000000011", "60000000-0000-4000-8000-000000000012"],
    createdAt: "2026-07-20T12:00:00.000Z",
  },
  djScripts: [
    {
      id: "60000000-0000-4000-8000-000000000013",
      programId: "60000000-0000-4000-8000-000000000010",
      type: "intro",
      language: "zh-CN",
      text: "这段已提交的节目不会被失败任务覆盖。",
      displayText: "这段已提交的节目不会被失败任务覆盖。",
      estimatedTiming: true,
      ttsAudioRef: null,
    },
  ],
  tracks: [
    {
      id: "60000000-0000-4000-8000-000000000011",
      source: "netease",
      sourceTrackId: "s6-first",
      title: "First Safe Track",
      artist: "Koradio",
      album: "S6",
      durationMs: 30_000,
      lyricStatus: "available",
    },
    {
      id: "60000000-0000-4000-8000-000000000012",
      source: "netease",
      sourceTrackId: "s6-second",
      title: "Second Safe Track",
      artist: "Koradio",
      album: "S6",
      durationMs: 30_000,
      lyricStatus: "available",
    },
  ],
  timeline: [
    {
      id: "60000000-0000-4000-8000-000000000014",
      kind: "track",
      position: 0,
      trackId: "60000000-0000-4000-8000-000000000011",
      resolvedAudioRef: "https://media.example.invalid/s6-first.wav",
      durationMs: 30_000,
    },
    {
      id: "60000000-0000-4000-8000-000000000015",
      kind: "track",
      position: 1,
      trackId: "60000000-0000-4000-8000-000000000012",
      resolvedAudioRef: "https://media.example.invalid/s6-second.wav",
      durationMs: 30_000,
    },
  ],
};

export const s6DegradedProgram: ProgramDetail = {
  program: {
    id: "60000000-0000-4000-8000-000000000020",
    profileId: s6Profile.id,
    scenarioText: "没有语音和歌词也继续播放",
    title: "Text Still On Air",
    status: "ready",
    trackIds: ["60000000-0000-4000-8000-000000000021"],
    createdAt: "2026-07-20T12:10:00.000Z",
  },
  djScripts: [
    {
      id: "60000000-0000-4000-8000-000000000022",
      programId: "60000000-0000-4000-8000-000000000020",
      type: "intro",
      language: "zh-CN",
      text: "语音不可用时，这段文字仍然保留。",
      displayText: "语音不可用时，这段文字仍然保留。",
      estimatedTiming: true,
      ttsAudioRef: null,
    },
  ],
  tracks: [
    {
      id: "60000000-0000-4000-8000-000000000021",
      source: "netease",
      sourceTrackId: "s6-text-only",
      title: "Words Are Optional",
      artist: "Koradio",
      album: "S6",
      durationMs: 30_000,
      lyricStatus: "unavailable",
    },
  ],
  timeline: [
    {
      id: "60000000-0000-4000-8000-000000000023",
      kind: "track",
      position: 0,
      trackId: "60000000-0000-4000-8000-000000000021",
      resolvedAudioRef: "https://media.example.invalid/s6-text-only.wav",
      durationMs: 30_000,
    },
  ],
};

export const s6GenerationFailureCases = [
  {
    code: "PROGRAM_GENERATION_PLAN_INVALID",
    jobId: "60000000-0000-4000-8000-000000000031",
    scenarioText: "让非法 Codex 输出保持旧节目",
    title: "TUNING INTERRUPTED",
  },
  {
    code: "PROGRAM_GENERATION_NO_PLAYABLE_TRACKS",
    jobId: "60000000-0000-4000-8000-000000000032",
    scenarioText: "让三次无歌保持旧节目",
    title: "NO TRACKS FOUND",
  },
] as const;

export const s6EventJobId = "60000000-0000-4000-8000-000000000040";
