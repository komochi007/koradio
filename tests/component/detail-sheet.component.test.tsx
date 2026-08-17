// @vitest-environment jsdom

import type { ProgramDetail } from "@koradio/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    originMode: "mock",
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
      artworkUrl: null,
      durationMs: 20_000,
      lyricStatus: "available",
      playable: true,
      originMode: "mock",
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
  vi.restoreAllMocks();
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

  it("uses a DJ preview track's own position when following lyrics", async () => {
    renderDetail({
      audio: {
        ...snapshot(1),
        positionMs: 1_000,
        preview: {
          kind: "track",
          previewId: trackId,
          state: "playing",
          positionMs: 4_500,
          durationMs: 20_000,
          mediaError: undefined,
          track: program.tracks[0],
        },
      },
      lyrics: {
        trackId,
        status: "available",
        content: "[00:01.00]First line\n[00:04.00]Preview current line",
      },
    });
    expect((await screen.findByText("Preview current line")).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.getByRole("progressbar", { name: /00:04/ }).getAttribute("aria-valuenow")).toBe(
      "4500",
    );
  });

  it("uses a paused DJ preview state for the detail playback control", () => {
    const play = vi.fn(() => Promise.resolve());
    renderDetail({
      audio: {
        ...snapshot(1),
        preview: {
          kind: "track",
          previewId: trackId,
          state: "paused",
          positionMs: 4_500,
          durationMs: 20_000,
          mediaError: undefined,
          track: program.tracks[0],
        },
      },
      engine: { ...audioEngine(), play },
    });
    fireEvent.click(screen.getByRole("button", { name: "播放" }));
    expect(play).toHaveBeenCalledOnce();
    expect(screen.getByText(/PAUSED/)).toBeTruthy();
  });

  it("does not inherit the paused program state while a DJ preview is playing", () => {
    renderDetail({
      audio: {
        ...snapshot(1),
        state: "paused",
        preview: {
          kind: "track",
          previewId: trackId,
          state: "playing",
          positionMs: 4_500,
          durationMs: 20_000,
          mediaError: undefined,
          track: program.tracks[0],
        },
      },
    });
    expect(screen.getByText(/PLAYING/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "暂停" })).toBeTruthy();
  });

  it("renders real YRC word progress inside the active lyric line", async () => {
    renderDetail({
      lyrics: {
        trackId,
        status: "available",
        content: "[1000,3000](1000,1000,0)Someway (2000,1000,0)baby (3000,1000,0)now",
      },
    });
    await screen.findByText("Someway");
    const activeWord = document.querySelector<HTMLElement>(".detail-copy__unit--current");
    expect(activeWord?.textContent).toBe("baby ");
    expect(activeWord?.getAttribute("style")).toContain("--detail-unit-progress: 50%");
    expect(document.querySelector(".detail-copy__unit--played")?.textContent).toBe("Someway ");
    expect(document.querySelector(".detail-copy__unit--upcoming")?.textContent).toBe("now");
  });

  it("centers the current lyric whenever playback advances to another line", async () => {
    const queryClient = createAppQueryClient();
    const initialAudio = { ...snapshot(1), positionMs: 2_500 };
    const view = (audio: AudioEngineSnapshot) => (
      <QueryClientProvider client={queryClient}>
        <DetailSheet
          audio={audio}
          audioEngine={audioEngine()}
          onClosed={vi.fn()}
          profileId={profileId}
          program={program}
          transport={transport({
            trackId,
            status: "available",
            content: "[00:01.00]A small light stayed awake\n[00:04.00]We let the hours move",
          })}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view(initialAudio));
    expect(
      (await screen.findByText("A small light stayed awake")).getAttribute("aria-current"),
    ).toBe("true");

    const copy = document.querySelector<HTMLElement>(".detail-copy__scroller");
    const nextLine = screen
      .getByText("We let the hours move")
      .closest<HTMLElement>(".detail-copy__line");
    if (copy === null || nextLine === null) throw new Error("Expected lyric layout elements");
    Object.defineProperties(copy, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    Object.defineProperties(nextLine, {
      offsetHeight: { configurable: true, value: 40 },
      offsetTop: { configurable: true, value: 400 },
    });

    rerender(view({ ...initialAudio, positionMs: 4_500 }));
    await waitFor(() => {
      expect(screen.getByText("We let the hours move").getAttribute("aria-current")).toBe("true");
      expect(copy.scrollTop).toBe(370);
    });
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
        .getByText("先让声音替房间留一点呼吸")
        .closest("[aria-current]")
        ?.getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.getByText("SPEAKING NOW")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("interpolates DJ highlighting between browser audio position updates", () => {
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    renderDetail({ audio: { ...snapshot(0), positionMs: 0 } });
    expect(
      screen
        .getByText("今晚不必急着找到答案")
        .closest("[aria-current]")
        ?.getAttribute("aria-current"),
    ).toBe("true");

    now.mockReturnValue(4_000);
    act(() => frame?.(4_000));

    expect(
      screen
        .getByText("先让声音替房间留一点呼吸")
        .closest("[aria-current]")
        ?.getAttribute("aria-current"),
    ).toBe("true");
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

  it("loads unknown lyrics and retries a failed provider request", async () => {
    const unknownProgram: ProgramDetail = {
      ...program,
      tracks: program.tracks.map((track) => ({ ...track, lyricStatus: "unknown" })),
    };
    let calls = 0;
    const serviceTransport = transport({});
    const request = vi.fn(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ code: "MUSIC_PROVIDER_UNAVAILABLE" }), { status: 503 }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            trackId,
            status: "untimed",
            content: "第一行完整歌词\n第二行完整歌词",
          }),
          { status: 200 },
        ),
      );
    });
    serviceTransport.request = request;
    render(
      <QueryClientProvider client={createAppQueryClient()}>
        <DetailSheet
          audio={snapshot(1)}
          audioEngine={audioEngine()}
          onClosed={vi.fn()}
          profileId={profileId}
          program={unknownProgram}
          transport={serviceTransport}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("歌词加载失败，播放不受影响")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试歌词" }));
    expect(await screen.findByText("第一行完整歌词")).toBeTruthy();
    expect(screen.getByText("第二行完整歌词")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
