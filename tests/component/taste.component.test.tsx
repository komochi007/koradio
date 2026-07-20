// @vitest-environment jsdom

import type {
  ProfileContext,
  TasteResponse,
  UpdateTasteOverridesCommand,
} from "@koradio/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient, QueryClientProvider } from "../../apps/web/src/app/query-client.js";
import { TasteExperience } from "../../apps/web/src/features/taste/index.js";
import type { ServiceTransport } from "../../apps/web/src/shared/transport.js";

const firstProfileId = "00000000-0000-4000-8000-000000000010";
const secondProfileId = "00000000-0000-4000-8000-000000000011";

function current(profileId = firstProfileId, nickname = "Komo"): ProfileContext {
  return {
    profile: {
      id: profileId,
      radioName: "After Midnight",
      nickname,
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
}

function taste(profileId = firstProfileId, tag = "Ambient"): TasteResponse {
  return {
    projection: {
      profileId,
      tags: ["Dream Pop"],
      affinities: ["track:00000000-0000-4000-8000-000000000020"],
      avoidSignals: ["track:00000000-0000-4000-8000-000000000021"],
      sourceVersion: 4,
      updatedAt: "2026-07-20T08:30:00.000Z",
    },
    overrides: {
      profileId,
      tags: [tag, "Bossa Nova"],
      avoidRules: ["避免高频刺耳的人声"],
      sceneRules: ["夜晚写作时保持安静，但不要太催眠"],
      updatedAt: "2026-07-20T08:15:00.000Z",
    },
    effective: {
      profileId,
      projectionVersion: 4,
      overrideVersion: 1,
      resolvedTaste: {
        tags: [tag, "Bossa Nova", "Dream Pop"],
        affinities: ["track:00000000-0000-4000-8000-000000000020"],
        avoidRules: ["避免高频刺耳的人声", "track:00000000-0000-4000-8000-000000000021"],
        sceneRules: ["夜晚写作时保持安静，但不要太催眠"],
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

function service(options: { failSave?: boolean } = {}): {
  commands: UpdateTasteOverridesCommand[];
  request: ReturnType<typeof vi.fn<(path: string, init?: RequestInit) => Promise<Response>>>;
  transport: ServiceTransport;
} {
  const commands: UpdateTasteOverridesCommand[] = [];
  const request = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>((path, init) => {
    const profileId = path.split("/").at(-2) ?? firstProfileId;
    if ((init?.method ?? "GET") === "GET") {
      return Promise.resolve(
        jsonResponse(taste(profileId, profileId === firstProfileId ? "Ambient" : "Jazz")),
      );
    }
    if (init?.method === "PATCH") {
      if (typeof init.body !== "string") throw new Error("Expected Taste JSON body");
      const command = JSON.parse(init.body) as UpdateTasteOverridesCommand;
      commands.push(command);
      if (options.failSave === true) {
        return Promise.resolve(
          jsonResponse(
            {
              code: "TASTE_UNREADABLE",
              message: "Taste could not be stored",
              retryable: false,
              correlationId: "00000000-0000-4000-8000-000000000099",
            },
            500,
          ),
        );
      }
      const before = taste(profileId);
      return Promise.resolve(
        jsonResponse({
          ...before,
          overrides: {
            profileId,
            ...command,
            updatedAt: "2026-07-20T09:00:00.000Z",
          },
          effective: {
            profileId,
            projectionVersion: 4,
            overrideVersion: 2,
            resolvedTaste: {
              tags: [...command.tags, "Dream Pop"],
              affinities: before.projection.affinities,
              avoidRules: [...command.avoidRules, ...before.projection.avoidSignals],
              sceneRules: command.sceneRules,
            },
          },
        }),
      );
    }
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

function renderTaste(options: { failSave?: boolean; profileId?: string } = {}) {
  const backend = service(options.failSave === undefined ? {} : { failSave: options.failSave });
  const profileId = options.profileId ?? firstProfileId;
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <TasteExperience
        current={current(profileId)}
        headingRef={createRef()}
        navigate={vi.fn()}
        onOpenProfiles={vi.fn()}
        reconnecting={false}
        transport={backend.transport}
      />
    </QueryClientProvider>,
  );
  return backend;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("S5-02 Taste experience", () => {
  it("separates projection, overrides and effective results on the overview", async () => {
    renderTaste();
    expect(await screen.findByRole("heading", { name: "你的音乐品味" })).toBeTruthy();
    expect(await screen.findByText("AUTO PROJECTION")).toBeTruthy();
    expect(screen.getByText("MANUAL RULES")).toBeTruthy();
    expect(screen.getByText("EFFECTIVE TASTE")).toBeTruthy();
    expect(screen.getByText("Ambient")).toBeTruthy();
    expect(screen.getByText("歌曲偏好 · …00000020")).toBeTruthy();
    expect(screen.getByText("已记录 4 条反馈")).toBeTruthy();
  });

  it("adds, deduplicates, validates, reorders and saves manual rules", async () => {
    const backend = renderTaste();
    await screen.findByText("AUTO PROJECTION");
    fireEvent.click(screen.getByRole("button", { name: "编辑品味" }));
    expect(screen.getByRole("heading", { name: "编辑音乐品味" })).toBeTruthy();

    const tagInput = screen.getByRole("textbox", { name: "新风格标签" });
    fireEvent.change(tagInput, { target: { value: "ambient" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    expect(await screen.findByText("已合并重复标签")).toBeTruthy();
    fireEvent.change(tagInput, { target: { value: "City Pop" } });
    fireEvent.click(screen.getByRole("button", { name: "添加标签" }));
    fireEvent.click(screen.getByRole("button", { name: "下移标签 Ambient" }));

    fireEvent.click(screen.getByRole("button", { name: /^添加避雷规则/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存品味" }));
    const blankRule = screen.getByRole("textbox", { name: "避雷规则 2" });
    expect(await screen.findByText("避雷规则不能为空")).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(blankRule);
    });
    fireEvent.change(blankRule, { target: { value: "不要突然切换到高能舞曲" } });
    fireEvent.click(screen.getByRole("button", { name: "保存品味" }));

    expect(await screen.findByText("已更新你的音乐品味")).toBeTruthy();
    expect(backend.commands).toHaveLength(1);
    expect(backend.commands[0]).toEqual({
      tags: ["Bossa Nova", "Ambient", "City Pop"],
      avoidRules: ["避免高频刺耳的人声", "不要突然切换到高能舞曲"],
      sceneRules: ["夜晚写作时保持安静，但不要太催眠"],
    });
  });

  it("keeps the draft and old server result when saving fails", async () => {
    renderTaste({ failSave: true });
    await screen.findByText("AUTO PROJECTION");
    fireEvent.click(screen.getByRole("button", { name: "编辑品味" }));
    const rule = screen.getByRole<HTMLInputElement>("textbox", { name: "避雷规则 1" });
    fireEvent.change(rule, { target: { value: "保留这条未保存规则" } });
    fireEvent.click(screen.getByRole("button", { name: "保存品味" }));
    expect(await screen.findByText("保存失败，内容已保留")).toBeTruthy();
    expect(rule.value).toBe("保留这条未保存规则");
    expect(screen.getByRole("button", { name: "重新保存" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "你的音乐品味" })).toBeTruthy();
    });
    expect(screen.getByText("避免高频刺耳的人声")).toBeTruthy();
    expect(screen.queryByText("保留这条未保存规则")).toBeNull();
  });

  it("reads Taste from the explicit Profile path", async () => {
    const backend = renderTaste({ profileId: secondProfileId });
    expect(await screen.findByText("Jazz")).toBeTruthy();
    expect(backend.request).toHaveBeenCalledWith(
      `/api/v1/profiles/${secondProfileId}/taste`,
      undefined,
    );
  });
});
