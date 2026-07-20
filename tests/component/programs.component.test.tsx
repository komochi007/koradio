// @vitest-environment jsdom

import type {
  CreateFeedbackCommand,
  MusicTrack,
  ProfileContext,
  Program,
  ProgramDetail,
  TasteResponse,
} from "@koradio/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AudioEngineFacade,
  AudioEngineSnapshot,
  PreviewAudioOptions,
} from "../../apps/web/src/audio/index.js";
import { createAppQueryClient, QueryClientProvider } from "../../apps/web/src/app/query-client.js";
import { ProgramsExperience } from "../../apps/web/src/features/programs/index.js";
import { createAppEventBus } from "../../apps/web/src/shared/events.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";

const profileId = "00000000-0000-4000-8000-000000000010";
const firstProgramId = "00000000-0000-4000-8000-000000000020";
const secondProgramId = "00000000-0000-4000-8000-000000000021";
const firstTrackId = "00000000-0000-4000-8000-000000000030";

const current: ProfileContext = {
  profile: {
    id: profileId,
    radioName: "After Midnight",
    nickname: "Komo",
    avatarRef: null,
    frequentGenres: ["Dream Pop"],
    defaultScenario: "夜晚写作",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
  },
  preferences: {
    profileId,
    themeMode: "dark",
    djLanguage: "zh-CN",
    djVoiceStyle: "british-soft-radio",
    updatedAt: "2026-07-20T08:00:00.000Z",
  },
};

function track(id = firstTrackId, title = "Space Song"): MusicTrack {
  return {
    id,
    source: "netease",
    sourceTrackId: `source-${id.slice(-2)}`,
    title,
    artist: "Beach House",
    album: "Depression Cherry",
    durationMs: 320_000,
    lyricStatus: "available",
  };
}

function program(id: string, title: string, createdAt: string): Program {
  return {
    id,
    profileId,
    scenarioText:
      id === firstProgramId ? "今晚写东西，安静但不要死板。" : "阴天早晨，慢一点进入工作。",
    title,
    status: "ready",
    trackIds: [firstTrackId],
    createdAt,
  };
}

function detail(value: Program, hasTts: boolean): ProgramDetail {
  const segmentId =
    value.id === firstProgramId
      ? "00000000-0000-4000-8000-000000000040"
      : "00000000-0000-4000-8000-000000000041";
  return {
    program: value,
    djScripts: [
      {
        id: segmentId,
        programId: value.id,
        type: "intro",
        language: "zh-CN",
        text: "今晚不必急着找到答案。",
        displayText: "今晚不必急着找到答案。先从一首温柔的歌开始。",
        estimatedTiming: true,
        ttsAudioRef: hasTts ? "tts/history-opening.m4a" : null,
      },
    ],
    tracks: [track()],
    timeline: [
      ...(hasTts
        ? [
            {
              id: "00000000-0000-4000-8000-000000000050",
              kind: "dj" as const,
              position: 0,
              segmentId,
              audioRef: "tts/history-opening.m4a",
              durationMs: 28_000,
            },
          ]
        : []),
      {
        id:
          value.id === firstProgramId
            ? "00000000-0000-4000-8000-000000000051"
            : "00000000-0000-4000-8000-000000000052",
        kind: "track",
        position: hasTts ? 1 : 0,
        trackId: firstTrackId,
        resolvedAudioRef: "https://media.example.test/space-song.mp3",
        durationMs: 320_000,
      },
    ],
  };
}

function taste(): TasteResponse {
  return {
    projection: {
      profileId,
      tags: [],
      affinities: [`track:${firstTrackId}`],
      avoidSignals: [],
      sourceVersion: 1,
      updatedAt: "2026-07-20T08:30:00.000Z",
    },
    overrides: {
      profileId,
      tags: [],
      avoidRules: [],
      sceneRules: [],
      updatedAt: "2026-07-20T08:30:00.000Z",
    },
    effective: {
      profileId,
      projectionVersion: 1,
      overrideVersion: 0,
      resolvedTaste: {
        tags: [],
        affinities: [`track:${firstTrackId}`],
        avoidRules: [],
        sceneRules: [],
      },
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createTransport(options: { failList?: boolean } = {}): {
  commands: CreateFeedbackCommand[];
  request: ReturnType<typeof vi.fn<(path: string, init?: RequestInit) => Promise<Response>>>;
  transport: ServiceTransport;
} {
  const first = program(firstProgramId, "After Hours, Soft Focus", "2026-07-20T08:00:00.000Z");
  const second = program(secondProgramId, "Slow Start, Clear Head", "2026-07-19T08:00:00.000Z");
  const commands: CreateFeedbackCommand[] = [];
  const request = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>((path, init) => {
    const method = init?.method ?? "GET";
    if (path.endsWith("/taste") && method === "GET") return Promise.resolve(jsonResponse(taste()));
    if (path.endsWith("/feedback-events") && method === "POST") {
      if (typeof init?.body !== "string") throw new Error("Expected feedback body");
      const command = JSON.parse(init.body) as CreateFeedbackCommand;
      commands.push(command);
      return Promise.resolve(
        jsonResponse(
          {
            id: "00000000-0000-4000-8000-000000000099",
            profileId,
            targetId: command.targetId,
            type: command.type,
            idempotencyKey: "programs-component-feedback-0001",
            createdAt: "2026-07-20T09:00:00.000Z",
          },
          201,
        ),
      );
    }
    if (path.includes("/programs?") && method === "GET") {
      if (options.failList === true) {
        return Promise.resolve(
          jsonResponse(
            {
              code: "PROGRAMS_UNREADABLE",
              message: "Programs could not be read",
              retryable: true,
              correlationId: "00000000-0000-4000-8000-000000000098",
            },
            500,
          ),
        );
      }
      const cursor = new URL(`http://koradio.test${path}`).searchParams.get("cursor");
      return Promise.resolve(
        jsonResponse(
          cursor === "next" ? { items: [second] } : { items: [first], nextCursor: "next" },
        ),
      );
    }
    if (path.endsWith(`/programs/${firstProgramId}`))
      return Promise.resolve(jsonResponse(detail(first, true)));
    if (path.endsWith(`/programs/${secondProgramId}`))
      return Promise.resolve(jsonResponse(detail(second, false)));
    return Promise.resolve(jsonResponse({}));
  });
  return {
    commands,
    request,
    transport: {
      request,
      clearSession() {},
      connectEvents: () => Promise.reject(new Error("unused")),
      fetchHealth: () => Promise.reject(new Error("unused")),
    },
  };
}

function createAudioEngine(): AudioEngineFacade & {
  previewAudio: ReturnType<typeof vi.fn<(options: PreviewAudioOptions) => Promise<void>>>;
} {
  let snapshot: AudioEngineSnapshot = {
    ownership: "active",
    state: "paused",
    profileId,
    programId: undefined,
    currentItem: undefined,
    currentIndex: 0,
    itemCount: 0,
    positionMs: 0,
    durationMs: 0,
    volume: 1,
    leaseEpoch: 1,
    mediaError: undefined,
    checkpointError: false,
  };
  const listeners = new Set<() => void>();
  const publish = (): void => {
    for (const listener of listeners) listener();
  };
  const previewAudio = vi.fn((options: PreviewAudioOptions) => {
    snapshot = {
      ...snapshot,
      preview: {
        kind: options.kind,
        previewId: options.previewId,
        state: "playing",
        positionMs: 0,
        durationMs: options.durationMs,
        mediaError: undefined,
      },
    };
    publish();
    return Promise.resolve();
  });
  return {
    activateProfile: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
    getSnapshot: () => snapshot,
    loadProgram: () => Promise.resolve(),
    next: () => Promise.resolve(),
    pause: () => Promise.resolve(),
    play: () => Promise.resolve(),
    prepareForProfileSwitch: () => Promise.resolve(),
    previous: () => Promise.resolve(),
    previewAudio,
    seek: () => Promise.resolve(),
    setVolume() {},
    stopPreview: () => {
      snapshot = { ...snapshot, preview: undefined };
      publish();
      return Promise.resolve();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function renderPrograms(
  options: { failList?: boolean; onReuseScenario?: (value: string) => boolean } = {},
) {
  const backend = createTransport(
    options.failList === undefined ? {} : { failList: options.failList },
  );
  const audioEngine = createAudioEngine();
  const onReuseScenario = options.onReuseScenario ?? vi.fn(() => true);
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <ProgramsExperience
        audioEngine={audioEngine}
        current={current}
        eventBus={createAppEventBus()}
        headingRef={createRef()}
        navigate={vi.fn()}
        onOpenProfiles={vi.fn()}
        onReuseScenario={onReuseScenario}
        reconnecting={false}
        transport={backend.transport}
      />
    </QueryClientProvider>,
  );
  return { audioEngine, backend, onReuseScenario };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("S5-03 Programs experience", () => {
  it("paginates history, opens details, replays DJ audio, reuses scenes and writes favorites", async () => {
    const rendered = renderPrograms();
    expect(await screen.findByRole("heading", { name: "节目" })).toBeTruthy();
    expect(await screen.findByText("After Hours, Soft Focus")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(await screen.findByText("Slow Start, Clear Head")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "打开节目 After Hours, Soft Focus" }));
    expect(await screen.findByText("PROGRAM ARCHIVE")).toBeTruthy();
    expect(screen.getByText("今晚不必急着找到答案。先从一首温柔的歌开始。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "播放 DJ 开场" }));
    await waitFor(() => {
      expect(rendered.audioEngine.previewAudio).toHaveBeenCalledWith({
        kind: "dj",
        previewId: "00000000-0000-4000-8000-000000000040",
        resolvedAudioRef: "/tts/history-opening.m4a",
        durationMs: 28_000,
      });
    });
    expect(await screen.findByRole("button", { name: "停止 DJ 开场重播" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "复用场景" }));
    expect(rendered.onReuseScenario).toHaveBeenCalledWith("今晚写东西，安静但不要死板。");
    fireEvent.click(screen.getByRole("button", { name: "收藏节目 After Hours, Soft Focus" }));
    await waitFor(() => {
      expect(rendered.backend.commands).toEqual([
        { type: "program_favorited", targetId: firstProgramId },
      ]);
    });
  });

  it("keeps DJ text visible when historical TTS audio is missing", async () => {
    renderPrograms();
    await screen.findByText("After Hours, Soft Focus");
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    await screen.findByText("Slow Start, Clear Head");
    fireEvent.click(screen.getByRole("button", { name: "打开节目 Slow Start, Clear Head" }));
    await screen.findByText("PROGRAM ARCHIVE");
    fireEvent.click(screen.getByRole("button", { name: "重播串讲" }));
    expect(await screen.findByText("串讲音频缺失，已显示文字版")).toBeTruthy();
    expect(screen.getByText("今晚不必急着找到答案。先从一首温柔的歌开始。")).toBeTruthy();
  });

  it("keeps the user in details when Radio cannot accept a reused scene", async () => {
    renderPrograms({ onReuseScenario: vi.fn(() => false) });
    await screen.findByText("After Hours, Soft Focus");
    fireEvent.click(screen.getByRole("button", { name: "打开节目 After Hours, Soft Focus" }));
    await screen.findByText("PROGRAM ARCHIVE");
    fireEvent.click(screen.getByRole("button", { name: "复用场景" }));
    expect(await screen.findByText("Radio 未连接，暂时不能复用场景")).toBeTruthy();
  });

  it("shows recoverable history errors", async () => {
    renderPrograms({ failList: true });
    expect(await screen.findByText("节目历史暂时无法读取")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "回到 Radio" })).toBeTruthy();
  });
});
