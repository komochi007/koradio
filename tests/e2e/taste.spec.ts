import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { TasteResponse, UpdateTasteOverridesCommand } from "@koradio/contracts";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
const firstProfileId = "00000000-0000-4000-8000-000000000010";
const secondProfileId = "00000000-0000-4000-8000-000000000011";
const profiles = [
  {
    id: firstProfileId,
    radioName: "After Midnight",
    nickname: "Komo",
    avatarRef: null,
    frequentGenres: ["Ambient", "Dream Pop"],
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
    themeMode: "dark",
    djLanguage: "zh-CN",
    djVoiceStyle: "british-soft-radio",
    updatedAt: "2026-07-20T08:00:00.000Z",
  };
}

function profileContext(profileId: string) {
  const profile = profiles.find((item) => item.id === profileId) ?? profiles[0];
  return { profile, preferences: preferences(profileId) };
}

function taste(profileId: string): TasteResponse {
  const second = profileId === secondProfileId;
  const tag = second ? "Jazz" : "Ambient";
  return {
    projection: {
      profileId,
      tags: [second ? "Soul" : "Dream Pop"],
      affinities: [
        `track:${second ? "00000000-0000-4000-8000-000000000030" : "00000000-0000-4000-8000-000000000020"}`,
      ],
      avoidSignals: [
        `track:${second ? "00000000-0000-4000-8000-000000000031" : "00000000-0000-4000-8000-000000000021"}`,
      ],
      sourceVersion: second ? 2 : 7,
      updatedAt: "2026-07-20T08:30:00.000Z",
    },
    overrides: {
      profileId,
      tags: second ? [tag] : [tag, "Bossa Nova", "Piano"],
      avoidRules: second ? ["避免过长即兴段落"] : ["避免高频刺耳的人声", "工作时减少强烈鼓点"],
      sceneRules: second
        ? ["周末阅读时保持温暖、松弛"]
        : ["夜晚写作时安静、有呼吸感，但不要太催眠", "通勤时节奏稳定，减少过长前奏"],
      updatedAt: "2026-07-20T08:15:00.000Z",
    },
    effective: {
      profileId,
      projectionVersion: second ? 2 : 7,
      overrideVersion: 1,
      resolvedTaste: {
        tags: second ? [tag, "Soul"] : [tag, "Bossa Nova", "Piano", "Dream Pop"],
        affinities: [
          `track:${second ? "00000000-0000-4000-8000-000000000030" : "00000000-0000-4000-8000-000000000020"}`,
        ],
        avoidRules: [
          ...(second ? ["避免过长即兴段落"] : ["避免高频刺耳的人声", "工作时减少强烈鼓点"]),
          `track:${second ? "00000000-0000-4000-8000-000000000031" : "00000000-0000-4000-8000-000000000021"}`,
        ],
        sceneRules: second
          ? ["周末阅读时保持温暖、松弛"]
          : ["夜晚写作时安静、有呼吸感，但不要太催眠", "通勤时节奏稳定，减少过长前奏"],
      },
    },
  };
}

function effectiveTaste(
  before: TasteResponse,
  command: UpdateTasteOverridesCommand,
): TasteResponse {
  return {
    projection: before.projection,
    overrides: {
      profileId: before.overrides.profileId,
      ...command,
      updatedAt: "2026-07-20T09:00:00.000Z",
    },
    effective: {
      profileId: before.effective.profileId,
      projectionVersion: before.projection.sourceVersion,
      overrideVersion: before.effective.overrideVersion + 1,
      resolvedTaste: {
        tags: [...command.tags, ...before.projection.tags],
        affinities: before.projection.affinities,
        avoidRules: [...command.avoidRules, ...before.projection.avoidSignals],
        sceneRules: command.sceneRules,
      },
    },
  };
}

async function fulfillTasteError(route: Route): Promise<void> {
  await route.fulfill({
    status: 500,
    json: {
      code: "TASTE_WRITE_FAILED",
      message: "Taste overrides could not be stored",
      retryable: true,
      correlationId: "00000000-0000-4000-8000-000000000099",
    },
  });
}

async function mockTasteWorkspace(
  page: Page,
  options: {
    empty?: boolean;
    failLoad?: boolean;
    failSave?: boolean;
    saveDelayMs?: number;
  } = {},
): Promise<{ commands: UpdateTasteOverridesCommand[] }> {
  let currentProfileId = firstProfileId;
  const commands: UpdateTasteOverridesCommand[] = [];
  const tastes = new Map(profiles.map((profile) => [profile.id, taste(profile.id)]));
  if (options.empty === true) {
    const emptyTaste = tastes.get(firstProfileId);
    if (emptyTaste !== undefined) {
      tastes.set(firstProfileId, {
        projection: {
          ...emptyTaste.projection,
          tags: [],
          affinities: [],
          avoidSignals: [],
          sourceVersion: 0,
        },
        overrides: {
          ...emptyTaste.overrides,
          tags: [],
          avoidRules: [],
          sceneRules: [],
        },
        effective: {
          ...emptyTaste.effective,
          projectionVersion: 0,
          overrideVersion: 0,
          resolvedTaste: { tags: [], affinities: [], avoidRules: [], sceneRules: [] },
        },
      });
    }
  }

  await page.route("**/api/v1/health", (route) =>
    route.fulfill({
      json: {
        service: "koradio",
        status: "ready",
        mode: "mock",
        providers: { codex: "available", netease: "available", tts: "degraded" },
        checkedAt: "2026-07-20T08:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/v1/profiles/current", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { profileId: string };
      currentProfileId = body.profileId;
    }
    await route.fulfill({ json: { current: profileContext(currentProfileId) } });
  });
  await page.route("**/api/v1/profiles", (route) => route.fulfill({ json: { items: profiles } }));
  await page.route("**/api/v1/profiles/*/taste", async (route) => {
    const profileId = new URL(route.request().url()).pathname.split("/").at(-2) ?? firstProfileId;
    if (route.request().method() === "GET") {
      if (options.failLoad === true) {
        await route.fulfill({
          status: 500,
          json: {
            code: "TASTE_UNREADABLE",
            message: "Taste could not be read",
            retryable: false,
            correlationId: "00000000-0000-4000-8000-000000000098",
          },
        });
        return;
      }
      await route.fulfill({ json: tastes.get(profileId) });
      return;
    }
    const command = route.request().postDataJSON() as UpdateTasteOverridesCommand;
    commands.push(command);
    if (options.saveDelayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.saveDelayMs));
    }
    if (options.failSave === true) {
      await fulfillTasteError(route);
      return;
    }
    const before = tastes.get(profileId);
    if (before === undefined) throw new Error("Taste fixture missing");
    const updated = effectiveTaste(before, command);
    tastes.set(profileId, updated);
    await route.fulfill({ json: updated });
  });
  return { commands };
}

test("views, edits, validates and saves Taste overrides", async ({ browserName, page }) => {
  test.skip(browserName === "webkit", "受控 Taste 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 960, height: 1600 });
  const workspace = await mockTasteWorkspace(page, { saveDelayMs: 250 });
  await page.goto(`${appOrigin}/taste`);

  await expect(page.getByRole("heading", { name: "你的音乐品味" })).toBeFocused();
  await expect(page.getByText("AUTO PROJECTION")).toBeVisible();
  await expect(page.getByText("人工规则始终优先", { exact: false })).toBeVisible();
  if (browserName === "chromium") {
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot("taste-overview-dark.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    await expect(page).toHaveScreenshot("taste-overview-light.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveScreenshot("taste-overview-mobile.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page).toHaveScreenshot("taste-overview-tablet.png", {
      animations: "disabled",
      fullPage: false,
    });
    await page.setViewportSize({ width: 960, height: 1600 });
  }

  await page.getByRole("button", { name: "编辑品味" }).click();
  await expect(page.getByRole("heading", { name: "编辑音乐品味" })).toBeFocused();
  const newTag = page.getByRole("textbox", { name: "新风格标签" });
  await newTag.fill("ambient");
  await newTag.press("Enter");
  await expect(page.getByText("已合并重复标签")).toBeVisible();
  await newTag.fill("City Pop");
  await newTag.press("Enter");
  await page.getByRole("button", { name: "下移标签 Ambient" }).click();
  await page.getByRole("button", { name: /^添加避雷规则/ }).click();
  await page.getByRole("button", { name: "保存品味" }).click();
  const newAvoidRule = page.getByRole("textbox", { name: "避雷规则 3" });
  await expect(page.getByText("避雷规则不能为空")).toBeVisible();
  await expect(newAvoidRule).toBeFocused();
  await newAvoidRule.fill("连续播放时不要突然切换到高能舞曲");

  if (browserName === "chromium") {
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot("taste-edit-dark.png", {
      animations: "disabled",
      fullPage: false,
    });
  }
  await page.getByRole("button", { name: "保存品味" }).click();
  await expect(page.getByRole("button", { name: "保存中…" })).toBeDisabled();
  await expect(page.getByText("已更新你的音乐品味")).toBeVisible();
  expect(workspace.commands).toHaveLength(1);
  expect(Object.keys(workspace.commands[0] ?? {}).sort()).toEqual([
    "avoidRules",
    "sceneRules",
    "tags",
  ]);
  expect(workspace.commands[0]?.tags).toEqual(["Bossa Nova", "Ambient", "Piano", "City Pop"]);
});

test("retains the edit draft while the stored Taste rolls back on failure", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "受控 Taste 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 834, height: 1194 });
  await mockTasteWorkspace(page, { failSave: true });
  await page.goto(`${appOrigin}/taste`);
  await page.getByRole("button", { name: "编辑品味" }).click();
  const rule = page.getByRole("textbox", { name: "避雷规则 1" });
  await rule.fill("保留这条未保存规则");
  await page.getByRole("button", { name: "保存品味" }).click();
  await expect(page.getByText("保存失败，内容已保留")).toBeVisible();
  await expect(rule).toHaveValue("保留这条未保存规则");
  await expect(page.getByRole("button", { name: "重新保存" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByText("避免高频刺耳的人声")).toBeVisible();
  await expect(page.getByText("保留这条未保存规则")).toHaveCount(0);
});

test("isolates Taste queries and drafts when switching Profile", async ({ browserName, page }) => {
  test.skip(browserName === "webkit", "受控 Taste 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 960, height: 1600 });
  await mockTasteWorkspace(page);
  await page.goto(`${appOrigin}/taste`);
  await expect(page.getByText("Ambient")).toBeVisible();
  await page.getByRole("button", { name: "切换档案" }).click();
  await page.getByRole("button", { name: "选择档案：Sunday Signals" }).click();
  await expect(page.getByRole("heading", { name: "你的音乐品味" })).toBeVisible();
  await expect(page.getByText("Jazz")).toBeVisible();
  await expect(page.getByText("避免过长即兴段落")).toBeVisible();
  await expect(page.getByText("Ambient")).toHaveCount(0);
});

test("keeps empty and load-error Taste states recoverable on mobile", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "受控 Taste 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockTasteWorkspace(page, { empty: true });
  await page.goto(`${appOrigin}/taste`);
  await expect(
    page.getByText("播放和反馈后会在这里形成你的音乐品味", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "去 Radio 开始播放" })).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBe(390);

  await page.unrouteAll({ behavior: "wait" });
  await mockTasteWorkspace(page, { failLoad: true });
  await page.reload();
  await expect(page.getByText("无法读取当前档案的音乐品味")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新选择档案" })).toBeVisible();
});
