// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  HealthResponse,
  Profile,
  ProfileContext,
  ProgramDetail,
  V1Event,
} from "@koradio/contracts";
import { afterEach, describe, expect, it, vi, type MockedFunction } from "vitest";

import { App } from "../../apps/web/src/app/app.js";
import type { AudioEngineFacade, AudioEngineSnapshot } from "../../apps/web/src/audio/index.js";
import type { ServiceConnection, ServiceTransport } from "../../apps/web/src/shared/transport.js";

const health: HealthResponse = {
  service: "koradio",
  status: "ready",
  mode: "mock",
  providers: {
    codex: "available",
    netease: "available",
    tts: "available",
  },
  checkedAt: "2026-07-17T08:00:00.000Z",
};

const primaryProfile: Profile = {
  id: "00000000-0000-4000-8000-000000000010",
  radioName: "After Midnight",
  nickname: "Komo",
  avatarRef: null,
  frequentGenres: ["Dream Pop", "Ambient"],
  defaultScenario: "安静地写东西",
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

const secondaryProfile: Profile = {
  ...primaryProfile,
  id: "00000000-0000-4000-8000-000000000011",
  radioName: "Morning Lines",
  nickname: "Lin",
};

const generatedProgram: ProgramDetail = {
  program: {
    id: "00000000-0000-4000-8000-000000000070",
    profileId: primaryProfile.id,
    scenarioText: "今晚写东西，安静但不要太困",
    title: "After Hours, Soft Focus",
    status: "ready",
    trackIds: ["00000000-0000-4000-8000-000000000071"],
    createdAt: "2026-07-17T08:00:00.000Z",
  },
  djScripts: [
    {
      id: "00000000-0000-4000-8000-000000000072",
      programId: "00000000-0000-4000-8000-000000000070",
      type: "intro",
      language: "zh-CN",
      text: "先让声音替房间留一点呼吸。",
      displayText: "先让声音替房间留一点呼吸。",
      estimatedTiming: true,
      ttsAudioRef: null,
    },
  ],
  tracks: [
    {
      id: "00000000-0000-4000-8000-000000000071",
      source: "netease",
      sourceTrackId: "fixture-if",
      title: "If",
      artist: "Bread",
      album: "Manna",
      durationMs: 155_000,
      lyricStatus: "available",
    },
  ],
  timeline: [
    {
      id: "00000000-0000-4000-8000-000000000073",
      kind: "track",
      position: 0,
      trackId: "00000000-0000-4000-8000-000000000071",
      resolvedAudioRef: "https://media.example.test/if.mp3",
      durationMs: 155_000,
    },
  ],
};

function profileContext(profile: Profile = primaryProfile): ProfileContext {
  return {
    profile,
    preferences: {
      profileId: profile.id,
      themeMode: "dark",
      djLanguage: "zh-CN",
      djVoiceStyle: "british-soft-radio",
      updatedAt: "2026-07-17T08:00:00.000Z",
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseRequestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new TypeError("Expected a JSON request body");
  }
  return JSON.parse(init.body) as unknown;
}

function createHealthEvent(): V1Event {
  return {
    eventId: "00000000-0000-4000-8000-000000000001",
    eventType: "service.health.changed",
    version: 1,
    correlationId: "00000000-0000-4000-8000-000000000002",
    sequence: 1,
    occurredAt: "2026-07-17T08:00:00.000Z",
    payload: health,
  };
}

function createTestAudioEngine(): AudioEngineFacade {
  let snapshot: AudioEngineSnapshot = {
    ownership: "active",
    state: "idle",
    profileId: undefined,
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
  return {
    activateProfile(nextProfileId) {
      snapshot = { ...snapshot, profileId: nextProfileId };
      publish();
      return Promise.resolve();
    },
    destroy: () => Promise.resolve(),
    getSnapshot: () => snapshot,
    loadProgram(nextProgram) {
      const currentItem = nextProgram.timeline[0];
      snapshot = {
        ...snapshot,
        state: "paused",
        profileId: nextProgram.program.profileId,
        programId: nextProgram.program.id,
        currentItem,
        itemCount: nextProgram.timeline.length,
        durationMs: currentItem?.durationMs ?? 0,
      };
      publish();
      return Promise.resolve();
    },
    next: () => Promise.resolve(),
    pause: () => Promise.resolve(),
    play: () => Promise.resolve(),
    previewAudio: () => Promise.resolve(),
    prepareForProfileSwitch: () => Promise.resolve(),
    previous: () => Promise.resolve(),
    seek: () => Promise.resolve(),
    setVolume() {},
    stopPreview: () => Promise.resolve(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createOnlineTransport(
  options: {
    empty?: boolean;
    failTheme?: boolean;
    generation?: "failed" | "succeeded";
    latestProgram?: ProgramDetail;
    profiles?: Profile[];
    ttsStatus?: "available" | "degraded" | "unavailable";
  } = {},
): ServiceTransport & { request: MockedFunction<ServiceTransport["request"]> } {
  const storedProfiles = options.profiles ?? (options.empty === true ? [] : [primaryProfile]);
  let current = options.empty === true ? null : profileContext(storedProfiles[0]);
  let generationSnapshotReads = 0;
  const request = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>((path, init) => {
    const method = init?.method ?? "GET";
    if (path === "/api/v1/profiles" && method === "GET") {
      return Promise.resolve(jsonResponse({ items: storedProfiles }));
    }
    if (path === "/api/v1/profiles/current" && method === "GET") {
      return Promise.resolve(jsonResponse({ current }));
    }
    if (path.endsWith("/programs?limit=1") && method === "GET") {
      return Promise.resolve(
        jsonResponse({
          items: options.latestProgram === undefined ? [] : [options.latestProgram.program],
        }),
      );
    }
    if (path.endsWith(`/programs/${generatedProgram.program.id}`) && method === "GET") {
      return Promise.resolve(jsonResponse(options.latestProgram ?? generatedProgram));
    }
    if (path.endsWith("/program-generations") && method === "POST") {
      return Promise.resolve(jsonResponse({ jobId: "00000000-0000-4000-8000-000000000074" }, 202));
    }
    if (path.endsWith("/program-generations/00000000-0000-4000-8000-000000000074")) {
      generationSnapshotReads += 1;
      const terminal = generationSnapshotReads > 1;
      if (!terminal) {
        return Promise.resolve(
          jsonResponse({
            jobId: "00000000-0000-4000-8000-000000000074",
            profileId: primaryProfile.id,
            status: "running",
            stage: "resolving_tracks",
            sequence: 2,
            createdAt: "2026-07-17T08:00:00.000Z",
            updatedAt: "2026-07-17T08:00:01.000Z",
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(
          options.generation === "failed"
            ? {
                jobId: "00000000-0000-4000-8000-000000000074",
                profileId: primaryProfile.id,
                status: "failed",
                stage: "resolving_tracks",
                sequence: 3,
                errorCode: "PROGRAM_GENERATION_NO_PLAYABLE_TRACKS",
                createdAt: "2026-07-17T08:00:00.000Z",
                updatedAt: "2026-07-17T08:00:02.000Z",
              }
            : {
                jobId: "00000000-0000-4000-8000-000000000074",
                profileId: primaryProfile.id,
                status: "succeeded",
                stage: "completed",
                sequence: 4,
                programId: generatedProgram.program.id,
                createdAt: "2026-07-17T08:00:00.000Z",
                updatedAt: "2026-07-17T08:00:02.000Z",
              },
        ),
      );
    }
    if (path === "/api/v1/profiles" && method === "POST") {
      const command = parseRequestBody(init) as {
        avatarRef?: string | null;
        defaultScenario?: string;
        frequentGenres?: string[];
        nickname: string;
        radioName: string;
      };
      const profile: Profile = {
        ...command,
        id: "00000000-0000-4000-8000-000000000012",
        avatarRef: command.avatarRef ?? null,
        frequentGenres: command.frequentGenres ?? [],
        defaultScenario: command.defaultScenario ?? "",
        createdAt: "2026-07-17T08:00:00.000Z",
        updatedAt: "2026-07-17T08:00:00.000Z",
      };
      storedProfiles.push(profile);
      return Promise.resolve(jsonResponse(profile, 201));
    }
    if (path === "/api/v1/profiles/current" && method === "PUT") {
      const body = parseRequestBody(init) as { profileId: string };
      const selected = storedProfiles.find((profile) => profile.id === body.profileId);
      current = selected === undefined ? null : profileContext(selected);
      return Promise.resolve(jsonResponse({ current }));
    }
    if (path === "/api/v1/device-settings") {
      return Promise.resolve(
        jsonResponse({
          dataRoot: "/tmp/koradio-test",
          codexCommand: "/usr/local/bin/codex",
          updatedAt: "2026-07-17T08:00:00.000Z",
        }),
      );
    }
    if (path === "/api/v1/device-settings/data-root-migrations" && method === "POST") {
      return Promise.resolve(jsonResponse({ jobId: "00000000-0000-4000-8000-000000000080" }, 202));
    }
    if (path === "/api/v1/health/services") {
      return Promise.resolve(
        jsonResponse({
          items: [
            ["local-service", "available", "Local Service is ready"],
            ["codex", "available", "Codex command is configured"],
            ["netease", "available", "Built-in provider is available"],
            ["tts", options.ttsStatus ?? "available", "Apple system TTS snapshot"],
          ].map(([service, status, redactedSummary]) => ({
            service,
            status,
            redactedSummary,
            checkedAt: "2026-07-17T08:00:00.000Z",
          })),
        }),
      );
    }
    if (path.endsWith("/preferences") && method === "PATCH") {
      const command = parseRequestBody(init) as Partial<ProfileContext["preferences"]>;
      if (options.failTheme === true && command.themeMode !== undefined) {
        return Promise.resolve(
          jsonResponse(
            {
              code: "PROFILE_PREFERENCES_SAVE_FAILED",
              message: "Preferences could not be saved",
              retryable: true,
              correlationId: "00000000-0000-4000-8000-000000000099",
            },
            500,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ ...current?.preferences, ...command }));
    }
    throw new Error(`Unhandled test request: ${method} ${path}`);
  });

  return {
    clearSession: vi.fn(),
    connectEvents(onEvent): Promise<ServiceConnection> {
      queueMicrotask(() => {
        onEvent(createHealthEvent());
      });
      return Promise.resolve({ close: vi.fn() });
    },
    fetchHealth: vi.fn().mockResolvedValue(health),
    request,
  };
}

function createOfflineTransport(): ServiceTransport {
  return {
    clearSession: vi.fn(),
    connectEvents: vi.fn(),
    fetchHealth: vi.fn().mockRejectedValue(new Error("offline")),
    request: vi.fn().mockRejectedValue(new Error("offline")),
  };
}

function createReconnectingTransport(): ServiceTransport & {
  connectEvents: ReturnType<typeof vi.fn>;
} {
  let connectionAttempt = 0;
  const connectEvents = vi.fn(
    (onEvent: (event: V1Event) => void, onFailure: () => void): Promise<ServiceConnection> => {
      connectionAttempt += 1;
      queueMicrotask(() => {
        if (connectionAttempt === 1) {
          onFailure();
          return;
        }

        onEvent(createHealthEvent());
      });
      return Promise.resolve({ close: vi.fn() });
    },
  );

  return {
    ...createOnlineTransport(),
    clearSession: vi.fn(),
    connectEvents,
    fetchHealth: vi.fn().mockResolvedValue(health),
  };
}

function createDisconnectingTransport(): ServiceTransport & { failEvents: () => void } {
  let failEvents = (): void => undefined;
  let healthAttempt = 0;

  return {
    ...createOnlineTransport(),
    clearSession: vi.fn(),
    connectEvents(onEvent, onFailure): Promise<ServiceConnection> {
      failEvents = onFailure;
      queueMicrotask(() => {
        onEvent(createHealthEvent());
      });
      return Promise.resolve({ close: vi.fn() });
    },
    failEvents() {
      failEvents();
    },
    fetchHealth: vi.fn(() => {
      healthAttempt += 1;
      return healthAttempt === 1 ? Promise.resolve(health) : Promise.reject(new Error("offline"));
    }),
  };
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("App Shell", () => {
  it("establishes an online session and provides keyboard-routable navigation", async () => {
    window.history.replaceState(null, "", "/radio");
    render(<App audioEngine={createTestAudioEngine()} transport={createOnlineTransport()} />);

    const heading = await screen.findByRole("heading", { name: "Radio" });
    expect(screen.getAllByText("LIVE").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(heading);

    const radio = screen.getByRole("button", { name: "Radio" });
    radio.focus();
    fireEvent.keyDown(radio, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Library" }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "设置" })).toBeTruthy();
    expect(window.location.pathname).toBe("/settings");
  });

  it("exposes only read-only Settings controls while the service is offline", async () => {
    window.history.replaceState(null, "", "/radio");
    render(<App audioEngine={createTestAudioEngine()} transport={createOfflineTransport()} />);

    expect(await screen.findByRole("heading", { name: "Koradio 服务未连接" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "前往 Settings" }));

    expect(await screen.findByRole("heading", { name: "设置暂时只读" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存配置" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "测试连接" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "迁移数据目录" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("reconnects the event stream after a connection failure", async () => {
    window.history.replaceState(null, "", "/radio");
    const transport = createReconnectingTransport();
    render(<App audioEngine={createTestAudioEngine()} transport={transport} />);

    await waitFor(
      () => {
        expect(transport.connectEvents).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("heading", { name: "Radio" })).toBeTruthy();
      },
      { timeout: 2_000 },
    );
  });

  it("enters the offline recovery page when the connected service stops", async () => {
    window.history.replaceState(null, "", "/radio");
    const transport = createDisconnectingTransport();
    render(<App audioEngine={createTestAudioEngine()} transport={transport} />);

    expect(await screen.findByRole("heading", { name: "Radio" })).toBeTruthy();
    act(() => {
      transport.failEvents();
    });

    expect(await screen.findByRole("heading", { name: "Koradio 服务未连接" })).toBeTruthy();
  });

  it("creates and selects the first local profile before entering Radio", async () => {
    window.history.replaceState(null, "", "/radio");
    const transport = createOnlineTransport({ empty: true });
    render(<App audioEngine={createTestAudioEngine()} transport={transport} />);

    expect(await screen.findByRole("heading", { name: "创建电台档案" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: /电台名称/ }), {
      target: { value: "Quiet Frequency" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /你的昵称/ }), {
      target: { value: "Klein" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /默认场景/ }), {
      target: { value: "周末整理房间" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并进入 Koradio" }));

    expect(await screen.findByRole("heading", { name: "Radio" })).toBeTruthy();
    expect(
      transport.request.mock.calls.some(
        ([path, init]) => path === "/api/v1/profiles" && init?.method === "POST",
      ),
    ).toBe(true);
    expect(
      transport.request.mock.calls.some(
        ([path, init]) => path === "/api/v1/profiles/current" && init?.method === "PUT",
      ),
    ).toBe(true);
  });

  it("switches profiles only after the coordinated server command succeeds", async () => {
    window.history.replaceState(null, "", "/radio");
    const transport = createOnlineTransport({ profiles: [primaryProfile, secondaryProfile] });
    render(<App audioEngine={createTestAudioEngine()} transport={transport} />);

    expect(await screen.findByRole("heading", { name: "Radio" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "切换档案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择档案：Morning Lines" }));

    expect(await screen.findByRole("heading", { name: "Radio" })).toBeTruthy();
    expect(
      transport.request.mock.calls.some(
        ([path, init]) =>
          path === "/api/v1/profiles/current" &&
          init?.method === "PUT" &&
          typeof init.body === "string" &&
          init.body.includes(secondaryProfile.id),
      ),
    ).toBe(true);
  });

  it("rolls back an immediate theme preview when persistence fails", async () => {
    window.history.replaceState(null, "", "/settings");
    render(
      <App
        audioEngine={createTestAudioEngine()}
        transport={createOnlineTransport({ failTheme: true })}
      />,
    );

    expect(await screen.findByRole("heading", { name: "设置" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect((await screen.findByRole("alert")).textContent).toContain("已恢复到之前的主题");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
  });

  it("treats degraded TTS as optional and never exposes secret inputs", async () => {
    window.history.replaceState(null, "", "/settings");
    render(
      <App
        audioEngine={createTestAudioEngine()}
        transport={createOnlineTransport({ ttsStatus: "degraded" })}
      />,
    );

    expect(await screen.findByRole("heading", { name: "设置" })).toBeTruthy();
    expect(screen.queryByLabelText(/API Key|Cookie|密钥/)).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Test" }));

    expect(await screen.findByText("3 OF 4 SERVICES AVAILABLE")).toBeTruthy();
    expect(screen.getByText(/你仍然可以生成和播放节目/)).toBeTruthy();
    expect(screen.queryByText("NOT CONFIGURED")).toBeNull();
  });

  it("starts data-root migration as an idempotent safe command", async () => {
    window.history.replaceState(null, "", "/settings");
    const transport = createOnlineTransport();
    render(<App audioEngine={createTestAudioEngine()} transport={transport} />);

    expect(await screen.findByRole("heading", { name: "设置" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新的数据目录" }), {
      target: { value: "/tmp/koradio-migrated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "安全迁移数据目录" }));

    expect(await screen.findByText(/迁移已安全启动/)).toBeTruthy();
    const migrationCall = transport.request.mock.calls.find(
      ([path]) => path === "/api/v1/device-settings/data-root-migrations",
    );
    expect(migrationCall?.[1]?.method).toBe("POST");
    expect(new Headers(migrationCall?.[1]?.headers).has("Idempotency-Key")).toBe(true);
  });

  it("moves through Radio empty, generating, and committed program states", async () => {
    window.history.replaceState(null, "", "/radio");
    const transport = createOnlineTransport({ generation: "succeeded" });
    render(<App audioEngine={createTestAudioEngine()} transport={transport} />);

    expect(await screen.findByText("NO SESSION ON AIR")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "告诉 DJ 当前场景" }), {
      target: { value: "今晚写东西，安静但不要太困" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送给 DJ" }));

    expect(await screen.findByText("TUNING YOUR STATION...")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "If" })).toBeTruthy();
    expect(screen.getByText("ON AIR")).toBeTruthy();
    const generationCall = transport.request.mock.calls.find(([path]) =>
      path.endsWith("/program-generations"),
    );
    expect(generationCall?.[1]?.method).toBe("POST");
    expect(new Headers(generationCall?.[1]?.headers).has("Idempotency-Key")).toBe(true);
  });

  it("restores the draft and keeps the old program when generation fails", async () => {
    window.history.replaceState(null, "", "/radio");
    render(
      <App
        audioEngine={createTestAudioEngine()}
        transport={createOnlineTransport({
          generation: "failed",
          latestProgram: generatedProgram,
        })}
      />,
    );

    expect(await screen.findByRole("heading", { name: "If" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "告诉 DJ 当前场景" }), {
      target: { value: "雨夜读书" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送给 DJ" }));

    expect(await screen.findByText("NO TRACKS FOUND")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "If" })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "告诉 DJ 当前场景" }).value).toBe(
      "雨夜读书",
    );
  });
});
