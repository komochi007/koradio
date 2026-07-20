// @vitest-environment jsdom

import type { ProgramDetail } from "@koradio/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DetailSheet } from "../../apps/web/src/features/radio/detail-sheet.js";
import type { AudioEngineFacade, AudioEngineSnapshot } from "../../apps/web/src/audio/types.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";
import { createAppQueryClient, QueryClientProvider } from "../../apps/web/src/app/query-client.js";

const profileId = "00000000-0000-4000-8000-000000000410";
const programId = "00000000-0000-4000-8000-000000000470";
const trackId = "00000000-0000-4000-8000-000000000471";

const program: ProgramDetail = {
  program: {
    id: programId,
    profileId,
    scenarioText: "夜里安静写作",
    title: "After Hours, Soft Focus",
    status: "ready",
    trackIds: [trackId],
    createdAt: "2026-07-19T08:00:00.000Z",
  },
  djScripts: [
    {
      id: "00000000-0000-4000-8000-000000000472",
      programId,
      type: "intro",
      language: "zh-CN",
      text: "今晚不必急着找到答案。先让声音替房间留一点呼吸。",
      displayText: "今晚不必急着找到答案。先让声音替房间留一点呼吸。",
      estimatedTiming: true,
      ttsAudioRef: "tts/intro.wav",
    },
  ],
  tracks: [
    {
      id: trackId,
      source: "netease",
      sourceTrackId: "detail-track",
      title: "Space Song",
      artist: "Beach House",
      album: "Depression Cherry",
      durationMs: 20_000,
      lyricStatus: "available",
    },
  ],
  timeline: [
    {
      id: "00000000-0000-4000-8000-000000000473",
      kind: "dj",
      position: 0,
      segmentId: "00000000-0000-4000-8000-000000000472",
      audioRef: "tts/intro.wav",
      durationMs: 8_000,
    },
    {
      id: "00000000-0000-4000-8000-000000000474",
      kind: "track",
      position: 1,
      trackId,
      resolvedAudioRef: "https://media.example.test/detail.mp3",
      durationMs: 20_000,
    },
  ],
};

function snapshot(index: 0 | 1): AudioEngineSnapshot {
  const currentItem = program.timeline[index];
  return {
    ownership: "active",
    state: "playing",
    profileId,
    programId,
    currentItem,
    currentIndex: index,
    itemCount: 2,
    positionMs: index === 0 ? 4_000 : 2_500,
    durationMs: currentItem?.durationMs ?? 0,
    volume: 1,
    leaseEpoch: 3,
    mediaError: undefined,
    checkpointError: false,
  };
}

function audioEngine(pause = vi.fn(() => Promise.resolve())): AudioEngineFacade {
  return {
    activateProfile: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
    getSnapshot: vi.fn(() => snapshot(1)),
    loadProgram: vi.fn(() => Promise.resolve()),
    next: vi.fn(() => Promise.resolve()),
    pause,
    play: vi.fn(() => Promise.resolve()),
    previewAudio: vi.fn(() => Promise.resolve()),
    prepareForProfileSwitch: vi.fn(() => Promise.resolve()),
    previous: vi.fn(() => Promise.resolve()),
    seek: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(),
    stopPreview: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn(() => () => undefined),
  };
}

function transport(lyrics: unknown): ServiceTransport {
  return {
    clearSession() {},
    connectEvents: () => Promise.reject(new Error("unused")),
    fetchHealth: () => Promise.reject(new Error("unused")),
    request: () => Promise.resolve(new Response(JSON.stringify(lyrics), { status: 200 })),
  };
}

function renderDetail(options: {
  audio?: AudioEngineSnapshot;
  engine?: AudioEngineFacade;
  lyrics?: unknown;
  onClosed?: () => void;
}) {
  const queryClient = createAppQueryClient();
  const engine = options.engine ?? audioEngine();
  const onClosed = options.onClosed ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DetailSheet
        audio={options.audio ?? snapshot(1)}
        audioEngine={engine}
        onClosed={onClosed}
        profileId={profileId}
        program={program}
        transport={transport(
          options.lyrics ?? {
            trackId,
            status: "available",
            content: "[00:01.00]A small light stayed awake\n[00:04.00]We let the hours move",
          },
        )}
      />
    </QueryClientProvider>,
  );
  return { engine, onClosed };
}

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: true })),
  });
});

afterEach(() => {
  cleanup();
});

describe("Detail Sheet", () => {
  it("renders timed lyrics from the canonical track snapshot with one playback control", async () => {
    const pause = vi.fn(() => Promise.resolve());
    const engine = audioEngine(pause);
    renderDetail({ engine });
    expect(
      (await screen.findByText("A small light stayed awake")).getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.getByRole("dialog", { name: "After Hours, Soft Focus" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "下一段" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    expect(pause).toHaveBeenCalledOnce();
  });

  it("estimates DJ sentence timing without requesting lyrics", () => {
    const request = vi.fn(() => Promise.reject(new Error("lyrics must not load")));
    const serviceTransport = transport({});
    serviceTransport.request = request;
    const queryClient = createAppQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DetailSheet
          audio={snapshot(0)}
          audioEngine={audioEngine()}
          onClosed={vi.fn()}
          profileId={profileId}
          program={program}
          transport={serviceTransport}
        />
      </QueryClientProvider>,
    );
    expect(
      screen
        .getByText("先让声音替房间留一点呼吸。")
        .closest("[aria-current]")
        ?.getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.getByText("SPEAKING NOW")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("traps focus, closes with Escape and never pauses playback while closing", async () => {
    const pause = vi.fn(() => Promise.resolve());
    const engine = audioEngine(pause);
    const onClosed = vi.fn();
    renderDetail({ engine, onClosed });
    const close = screen.getByRole("button", { name: "关闭节目详情，播放继续" });
    const playback = screen.getByRole("button", { name: "暂停" });
    await waitFor(() => {
      expect(document.activeElement).toBe(close);
    });
    playback.focus();
    fireEvent.keyDown(playback, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(playback);
    fireEvent.keyDown(playback, { key: "Escape" });
    await waitFor(() => {
      expect(onClosed).toHaveBeenCalledOnce();
    });
    expect(pause).not.toHaveBeenCalled();
  });

  it("degrades unavailable lyrics without affecting the playback control", () => {
    const unavailableProgram: ProgramDetail = {
      ...program,
      tracks: program.tracks.map((track) => ({ ...track, lyricStatus: "unavailable" })),
    };
    const queryClient = createAppQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DetailSheet
          audio={snapshot(1)}
          audioEngine={audioEngine()}
          onClosed={vi.fn()}
          profileId={profileId}
          program={unavailableProgram}
          transport={transport({})}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("暂无歌词，正在播放 DJ 推荐曲目")).toBeTruthy();
    expect(screen.getByRole("button", { name: "暂停" }).getAttribute("disabled")).toBeNull();
  });
});
