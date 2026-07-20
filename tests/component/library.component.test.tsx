// @vitest-environment jsdom

import type { HealthResponse, LibraryItem, MusicTrack, ProfileContext } from "@koradio/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AudioEngineFacade,
  AudioEngineSnapshot,
  PreviewAudioOptions,
} from "../../apps/web/src/audio/index.js";
import { createAppQueryClient, QueryClientProvider } from "../../apps/web/src/app/query-client.js";
import { LibraryExperience } from "../../apps/web/src/features/library/index.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";

const profileId = "00000000-0000-4000-8000-000000000010";
const track: MusicTrack = {
  id: "00000000-0000-4000-8000-000000000020",
  source: "netease",
  sourceTrackId: "space-song",
  title: "Space Song",
  artist: "Beach House",
  album: "Depression Cherry",
  durationMs: 320_000,
  lyricStatus: "available",
};
const secondTrack: MusicTrack = {
  ...track,
  id: "00000000-0000-4000-8000-000000000021",
  sourceTrackId: "midnight-city",
  title: "Midnight City",
  artist: "M83",
  album: "Hurry Up, We're Dreaming",
  durationMs: 244_000,
};
const current: ProfileContext = {
  profile: {
    id: profileId,
    radioName: "After Midnight",
    nickname: "Komo",
    avatarRef: null,
    frequentGenres: ["Dream Pop"],
    defaultScenario: "",
    createdAt: "2026-07-19T08:00:00.000Z",
    updatedAt: "2026-07-19T08:00:00.000Z",
  },
  preferences: {
    profileId,
    themeMode: "dark",
    djLanguage: "zh-CN",
    djVoiceStyle: "british-soft-radio",
    updatedAt: "2026-07-19T08:00:00.000Z",
  },
};

function health(netease: "available" | "degraded" | "unavailable" = "available"): HealthResponse {
  return {
    service: "koradio",
    status: "ready",
    mode: "mock",
    providers: { codex: "available", netease, tts: "degraded" },
    checkedAt: "2026-07-19T08:00:00.000Z",
  };
}

function libraryItem(itemTrack: MusicTrack): LibraryItem {
  return {
    track: itemTrack,
    addedAt: "2026-07-19T08:00:00.000Z",
    playlistSourceId: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function audioEngine(): AudioEngineFacade & {
  previewAudio: ReturnType<typeof vi.fn<(options: PreviewAudioOptions) => Promise<void>>>;
  stopPreview: ReturnType<typeof vi.fn<() => Promise<void>>>;
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
  const stopPreview = vi.fn(() => {
    snapshot = { ...snapshot, preview: undefined };
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
    stopPreview,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function transport(options: { initialItems?: LibraryItem[]; searchFails?: boolean } = {}) {
  let snapshotReads = 0;
  const request = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>((path, init) => {
    const method = init?.method ?? "GET";
    if (path.includes("/library?") && method === "GET") {
      const cursor = new URL(`http://koradio.test${path}`).searchParams.get("cursor");
      if (cursor === "next")
        return Promise.resolve(jsonResponse({ items: [libraryItem(secondTrack)] }));
      return Promise.resolve(
        jsonResponse({
          items: options.initialItems ?? [],
          ...(options.initialItems === undefined || options.initialItems.length === 0
            ? {}
            : { nextCursor: "next" }),
        }),
      );
    }
    if (path.endsWith("/music-searches") && method === "POST") {
      if (options.searchFails === true) {
        return Promise.resolve(
          jsonResponse(
            {
              code: "MUSIC_PROVIDER_UNAVAILABLE",
              message: "Music provider is unavailable",
              retryable: true,
              correlationId: "00000000-0000-4000-8000-000000000099",
            },
            503,
          ),
        );
      }
      if (typeof init?.body !== "string") throw new Error("Expected search JSON body");
      const body = JSON.parse(init.body) as { keyword: string };
      return Promise.resolve(jsonResponse({ items: body.keyword === "missing" ? [] : [track] }));
    }
    if (path.endsWith("/library-items") && method === "POST") {
      return Promise.resolve(jsonResponse(libraryItem(track), 201));
    }
    if (path.endsWith("/audio-resolutions") && method === "POST") {
      return Promise.resolve(
        jsonResponse({
          trackId: track.id,
          resolvedAudioRef: "https://media.example.test/preview.wav",
          expiresAt: "2026-07-19T09:00:00.000Z",
        }),
      );
    }
    if (path.endsWith("/playlist-imports") && method === "POST") {
      return Promise.resolve(jsonResponse({ jobId: "00000000-0000-4000-8000-000000000030" }, 202));
    }
    if (path.includes("/playlist-imports/") && method === "GET") {
      snapshotReads += 1;
      const done = snapshotReads > 1;
      return Promise.resolve(
        jsonResponse({
          jobId: "00000000-0000-4000-8000-000000000030",
          profileId,
          status: done ? "succeeded" : "running",
          playlistRef: "40112818",
          progress: done
            ? { total: 3, processed: 3, imported: 2, unavailable: 1 }
            : { total: 3, processed: 1, imported: 1, unavailable: 0 },
          playlistSource: done
            ? {
                id: "00000000-0000-4000-8000-000000000031",
                source: "netease",
                sourcePlaylistId: "40112818",
                title: "夜晚写作",
                importedAt: "2026-07-19T08:00:01.000Z",
                availableTrackCount: 2,
                unavailableTrackCount: 1,
              }
            : null,
          createdAt: "2026-07-19T08:00:00.000Z",
          updatedAt: "2026-07-19T08:00:01.000Z",
        }),
      );
    }
    return Promise.resolve(jsonResponse({}));
  });
  return {
    request,
    clearSession() {},
    connectEvents: () => Promise.reject(new Error("unused")),
    fetchHealth: () => Promise.reject(new Error("unused")),
  } satisfies ServiceTransport;
}

function renderLibrary(
  options: {
    engine?: ReturnType<typeof audioEngine>;
    netease?: "available" | "degraded" | "unavailable";
    service?: ReturnType<typeof transport>;
  } = {},
): { engine: ReturnType<typeof audioEngine>; view: ReactElement } {
  const engine = options.engine ?? audioEngine();
  const queryClient = createAppQueryClient();
  const view = (
    <QueryClientProvider client={queryClient}>
      <LibraryExperience
        audioEngine={engine}
        current={current}
        headingRef={createRef()}
        health={health(options.netease)}
        navigate={vi.fn()}
        onOpenProfiles={vi.fn()}
        reconnecting={false}
        transport={options.service ?? transport()}
      />
    </QueryClientProvider>
  );
  render(view);
  return { engine, view };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("S5-01 Library experience", () => {
  it("searches, validates, adds and previews with keyboard access", async () => {
    const engine = audioEngine();
    renderLibrary({ engine });
    expect(await screen.findByText("还没有导入音乐")).toBeTruthy();

    const search = screen.getByRole("searchbox", { name: "搜索歌曲、歌手或专辑" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(search);
    fireEvent.submit(search.closest("form") ?? document.createElement("form"));
    expect(await screen.findByText("请输入歌曲、歌手或专辑名")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Beach House" } });
    fireEvent.submit(search.closest("form") ?? document.createElement("form"));
    expect(await screen.findByText("Space Song")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "加入候选池" }));
    expect(await screen.findByText("已加入本地音乐库")).toBeTruthy();
    expect(await screen.findByText("已加入")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "试听 Space Song" }));
    await waitFor(() => {
      expect(engine.previewAudio).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: "停止试听 Space Song" })).toBeTruthy();
    cleanup();
    expect(engine.stopPreview).toHaveBeenCalled();
  });

  it("paginates the candidate pool and reports partial playlist import", async () => {
    renderLibrary({ service: transport({ initialItems: [libraryItem(track)] }) });
    expect(await screen.findByText("Space Song")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(await screen.findByText("Midnight City")).toBeTruthy();

    const input = screen.getByRole("textbox", { name: "网易云歌单链接或 ID" });
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.submit(input.closest("form") ?? document.createElement("form"));
    expect(await screen.findByText("请输入有效的网易云歌单链接或 ID")).toBeTruthy();
    fireEvent.change(input, { target: { value: "40112818" } });
    fireEvent.submit(input.closest("form") ?? document.createElement("form"));
    expect(await screen.findByText(/正在从网易云获取音乐/)).toBeTruthy();
    expect(await screen.findByText("已导入 2 首可用歌曲，1 首暂不可播放。")).toBeTruthy();
  });

  it("keeps service failure inline with a Settings recovery action", async () => {
    renderLibrary({ netease: "unavailable" });
    expect((await screen.findByText("网易云 API 暂不可用")).textContent).toContain(
      "网易云 API 暂不可用",
    );
    expect(screen.getByRole("button", { name: "前往 Settings" })).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>("searchbox", { name: "搜索歌曲、歌手或专辑" }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "导入歌单" }).disabled).toBe(true);
  });
});
