import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type {
  CreateFeedbackCommand,
  MusicTrack,
  Program,
  ProgramDetail,
  TasteResponse,
} from "@koradio/contracts";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
const visualBaselineNow = new Date(
  process.env.CI === undefined ? "2026-07-20T08:45:00.000Z" : "2026-07-21T08:45:00.000Z",
);
const firstProfileId = "00000000-0000-4000-8000-000000000010";
const secondProfileId = "00000000-0000-4000-8000-000000000011";
const profiles = [
  {
    id: firstProfileId,
    radioName: "After Midnight",
    nickname: "Komo",
    avatarRef: null,
    frequentGenres: ["Dream Pop"],
    defaultScenario: "夜晚写作",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
  },
  {
    id: secondProfileId,
    radioName: "Sunday Signals",
    nickname: "Mori",
    avatarRef: null,
    frequentGenres: ["Jazz"],
    defaultScenario: "周末阅读",
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
  },
];

function preferences(profileId: string) {
  return {
    profileId,
    themeMode: "dark" as const,
    djLanguage: "zh-CN" as const,
    djVoiceStyle: "british-soft-radio" as const,
    updatedAt: "2026-07-20T08:00:00.000Z",
  };
}

function profileContext(profileId: string) {
  const profile = profiles.find((candidate) => candidate.id === profileId) ?? profiles[0];
  return { profile, preferences: preferences(profileId) };
}

function track(index: number): MusicTrack {
  const titles = ["If", "Space Song", "Mystery of Love", "Moon Song", "Show Me How"];
  return {
    id: `00000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}`,
    source: "netease",
    sourceTrackId: `history-source-${String(index)}`,
    title: titles[index] ?? `History Track ${String(index + 1)}`,
    artist: index === 0 ? "Bread" : "Beach House",
    album: "Koradio Archive",
    durationMs: 155_000 + index * 31_000,
    lyricStatus: "available",
  };
}

function program(profileId: string, index: number, title: string): Program {
  return {
    id: `00000000-0000-4000-8000-${String(index + (profileId === secondProfileId ? 120 : 20)).padStart(12, "0")}`,
    profileId,
    scenarioText:
      profileId === secondProfileId
        ? "周末阅读，想要温暖、松弛的爵士。"
        : index === 0
          ? "今晚写东西，想要安静但不死板的 BGM。"
          : `历史场景 ${String(index + 1)}，保持克制和呼吸感。`,
    title,
    status: "ready",
    trackIds: [track(index % 5).id],
    createdAt: `2026-07-${String(20 - index).padStart(2, "0")}T${String(22 - index).padStart(2, "0")}:46:00.000Z`,
  };
}

function detail(value: Program, hasTts: boolean): ProgramDetail {
  const itemTrack = track(Number(value.trackIds[0]?.slice(-2) ?? "30") - 30);
  const suffix = value.id.slice(-3);
  const segmentId = `00000000-0000-4000-8000-${String(300 + Number(suffix)).padStart(12, "0")}`;
  return {
    program: value,
    djScripts: [
      {
        id: segmentId,
        programId: value.id,
        type: "intro",
        language: "zh-CN",
        text: "今晚不必急着找到答案。",
        displayText:
          "今晚不必急着找到答案。先从一首有点旧、有点温柔的歌开始，让房间里的声音慢下来。",
        estimatedTiming: true,
        ttsAudioRef: hasTts ? `tts/program-${suffix}.wav` : null,
      },
    ],
    tracks: [itemTrack],
    timeline: [
      ...(hasTts
        ? [
            {
              id: `00000000-0000-4000-8000-${String(500 + Number(suffix)).padStart(12, "0")}`,
              kind: "dj" as const,
              position: 0,
              segmentId,
              audioRef: `tts/program-${suffix}.wav`,
              durationMs: 28_000,
            },
          ]
        : []),
      {
        id: `00000000-0000-4000-8000-${String(700 + Number(suffix)).padStart(12, "0")}`,
        kind: "track",
        position: hasTts ? 1 : 0,
        trackId: itemTrack.id,
        resolvedAudioRef: `https://media.example.invalid/program-${suffix}.wav`,
        durationMs: itemTrack.durationMs,
      },
    ],
  };
}

function taste(profileId: string, affinities: string[] = []): TasteResponse {
  return {
    projection: {
      profileId,
      tags: [],
      affinities,
      avoidSignals: [],
      sourceVersion: affinities.length,
      updatedAt: "2026-07-20T09:00:00.000Z",
    },
    overrides: {
      profileId,
      tags: [],
      avoidRules: [],
      sceneRules: [],
      updatedAt: "2026-07-20T09:00:00.000Z",
    },
    effective: {
      profileId,
      projectionVersion: affinities.length,
      overrideVersion: 0,
      resolvedTaste: {
        tags: [],
        affinities,
        avoidRules: [],
        sceneRules: [],
      },
    },
  };
}

function wav(durationMs: number): Buffer {
  const sampleRate = 8_000;
  const sampleCount = Math.floor((sampleRate * durationMs) / 1_000);
  const dataSize = sampleCount * 2;
  const result = Buffer.alloc(44 + dataSize);
  result.write("RIFF", 0);
  result.writeUInt32LE(36 + dataSize, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(sampleRate, 24);
  result.writeUInt32LE(sampleRate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(dataSize, 40);
  return result;
}

async function mockProgramsWorkspace(
  page: Page,
  options: { failList?: boolean } = {},
): Promise<{ commands: CreateFeedbackCommand[]; generationCount: () => number }> {
  let currentProfileId = firstProfileId;
  let generationCount = 0;
  const commands: CreateFeedbackCommand[] = [];
  const firstPrograms = [
    program(firstProfileId, 0, "After Hours, Soft Focus"),
    program(firstProfileId, 1, "Slow Start, Clear Head"),
    program(firstProfileId, 2, "Windows Open"),
    program(firstProfileId, 3, "Blue Hour Notes"),
    program(firstProfileId, 4, "Paper Lanterns"),
  ];
  const secondPrograms = [program(secondProfileId, 0, "Sunday Signals")];
  const allPrograms = [...firstPrograms, ...secondPrograms];
  const details = new Map(allPrograms.map((item, index) => [item.id, detail(item, index !== 1)]));
  const tastes = new Map([
    [firstProfileId, taste(firstProfileId, [`track:${firstPrograms[0]?.trackIds[0] ?? ""}`])],
    [secondProfileId, taste(secondProfileId)],
  ]);

  await page.route("**/api/v1/health", (route) =>
    route.fulfill({
      json: {
        service: "koradio",
        status: "ready",
        mode: "mock",
        providers: { codex: "available", netease: "available", tts: "degraded" },
        checkedAt: "2026-07-20T09:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/v1/profiles/current", async (route) => {
    if (route.request().method() === "PUT") {
      currentProfileId = (route.request().postDataJSON() as { profileId: string }).profileId;
    }
    await route.fulfill({ json: { current: profileContext(currentProfileId) } });
  });
  await page.route("**/api/v1/profiles", (route) => route.fulfill({ json: { items: profiles } }));
  await page.route("**/api/v1/profiles/*/taste", async (route) => {
    const profileId = new URL(route.request().url()).pathname.split("/").at(-2) ?? firstProfileId;
    await route.fulfill({ json: tastes.get(profileId) });
  });
  await page.route("**/api/v1/profiles/*/feedback-events", async (route) => {
    const profileId = new URL(route.request().url()).pathname.split("/").at(-2) ?? firstProfileId;
    const command = route.request().postDataJSON() as CreateFeedbackCommand;
    commands.push(command);
    const before = tastes.get(profileId) ?? taste(profileId);
    const target = `program:${command.targetId}`;
    const affinities =
      command.type === "program_favorited"
        ? [...before.projection.affinities.filter((value) => value !== target), target]
        : before.projection.affinities.filter((value) => value !== target);
    tastes.set(profileId, taste(profileId, affinities));
    await route.fulfill({
      status: 201,
      json: {
        id: `00000000-0000-4000-8000-${String(900 + commands.length).padStart(12, "0")}`,
        profileId,
        targetId: command.targetId,
        type: command.type,
        idempotencyKey: `programs-e2e-feedback-${String(commands.length).padStart(4, "0")}`,
        createdAt: "2026-07-20T09:00:00.000Z",
      },
    });
  });
  await page.route("**/api/v1/profiles/*/programs?*", async (route) => {
    if (options.failList === true) {
      await route.fulfill({
        status: 500,
        json: {
          code: "PROGRAMS_UNREADABLE",
          message: "Programs could not be read",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000099",
        },
      });
      return;
    }
    const url = new URL(route.request().url());
    const profileId = url.pathname.split("/").at(-2) ?? firstProfileId;
    const source = profileId === secondProfileId ? secondPrograms : firstPrograms;
    const limit = Number(url.searchParams.get("limit") ?? "4");
    const cursor = url.searchParams.get("cursor");
    if (limit === 1) {
      await route.fulfill({ json: { items: source.slice(0, 1) } });
      return;
    }
    await route.fulfill({
      json:
        cursor === "next"
          ? { items: source.slice(4) }
          : { items: source.slice(0, 4), ...(source.length > 4 ? { nextCursor: "next" } : {}) },
    });
  });
  await page.route("**/api/v1/profiles/*/programs/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    await route.fulfill({ json: details.get(id) });
  });
  await page.route("**/api/v1/profiles/*/program-generations", async (route) => {
    generationCount += 1;
    await route.fulfill({ status: 500 });
  });
  await page.route("**/tts/*.wav", (route) =>
    route.fulfill({ body: wav(8_000), contentType: "audio/wav" }),
  );
  await page.route("https://media.example.invalid/**", (route) =>
    route.fulfill({ body: wav(8_000), contentType: "audio/wav" }),
  );
  return { commands, generationCount: () => generationCount };
}

test("paginates, replays, favorites, reuses and isolates Programs history", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "受控 Programs 路由与媒体重播由 Chromium 与 Firefox 验收");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 960, height: 1600 });
  await page.clock.install({ time: visualBaselineNow });
  const workspace = await mockProgramsWorkspace(page);
  await page.goto(`${appOrigin}/programs`);

  await expect(page.getByRole("heading", { name: "节目", exact: true })).toBeFocused();
  await expect(page.getByText("After Hours, Soft Focus")).toBeVisible();
  await expect(page.getByText("Paper Lanterns")).toBeHidden();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (browserName === "chromium") {
    await expect(page).toHaveScreenshot("programs-list-dark.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    await expect(page).toHaveScreenshot("programs-list-light.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
    await expect(page).toHaveScreenshot("programs-list-mobile.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page).toHaveScreenshot("programs-list-tablet.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await expect(page).toHaveScreenshot("programs-list-desktop.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.setViewportSize({ width: 960, height: 1600 });
  }

  await page.getByRole("button", { name: "加载更多" }).click();
  await expect(page.getByText("Paper Lanterns")).toBeVisible();
  await page.getByRole("button", { name: "打开节目 After Hours, Soft Focus" }).click();
  await expect(page.getByRole("heading", { name: "After Hours, Soft Focus" })).toBeFocused();
  if (browserName === "chromium") {
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot("program-detail-dark.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    await expect(page).toHaveScreenshot("program-detail-light.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
  }

  await page.getByRole("button", { name: "播放 DJ 开场" }).click();
  await expect(page.getByRole("button", { name: "停止 DJ 开场重播" })).toBeVisible();
  await expect(page.getByRole("button", { name: "播放 DJ 开场" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "收藏节目 After Hours, Soft Focus" }).click();
  await expect(
    page.getByRole("button", { name: "取消收藏节目 After Hours, Soft Focus" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "取消收藏节目 After Hours, Soft Focus" }).click();
  expect(workspace.commands.map((command) => command.type)).toEqual([
    "program_favorited",
    "program_favorite_removed",
  ]);

  await page.getByRole("button", { name: "复用场景" }).click();
  await expect(page).toHaveURL(`${appOrigin}/radio`);
  const draft = page.getByRole("textbox", { name: "告诉 DJ 当前场景" });
  await expect(draft).toHaveValue("今晚写东西，想要安静但不死板的 BGM。");
  await expect(draft).toBeFocused();
  expect(workspace.generationCount()).toBe(0);

  await page.getByRole("button", { name: "Programs" }).click();
  await page.getByRole("button", { name: "切换档案" }).click();
  await page.getByRole("button", { name: "选择档案：Sunday Signals" }).click();
  await expect(page.getByText("Sunday Signals", { exact: true })).toBeVisible();
  await expect(page.getByText("After Hours, Soft Focus")).toBeHidden();
});

test("falls back to text when historical TTS audio is absent", async ({ browserName, page }) => {
  test.skip(browserName === "webkit", "受控 Programs 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 960, height: 1600 });
  await mockProgramsWorkspace(page);
  await page.goto(`${appOrigin}/programs`);
  await page.getByRole("button", { name: "打开节目 Slow Start, Clear Head" }).click();
  await page.getByRole("button", { name: "重播串讲" }).click();
  await expect(page.getByText("串讲音频缺失，已显示文字版")).toBeVisible();
  await expect(
    page.getByText(
      "今晚不必急着找到答案。先从一首有点旧、有点温柔的歌开始，让房间里的声音慢下来。",
    ),
  ).toBeVisible();
});

test("keeps history load failures recoverable", async ({ browserName, page }) => {
  test.skip(browserName === "webkit", "受控 Programs 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 390, height: 844 });
  await mockProgramsWorkspace(page, { failList: true });
  await page.goto(`${appOrigin}/programs`);
  await expect(page.getByText("节目历史暂时无法读取")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新读取" })).toBeVisible();
  await expect(page.getByRole("button", { name: "回到 Radio" })).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
