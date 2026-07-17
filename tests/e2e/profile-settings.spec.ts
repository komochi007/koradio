import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const profile = {
  id: "00000000-0000-4000-8000-000000000020",
  radioName: "After Midnight",
  nickname: "Komo",
  avatarRef: null,
  frequentGenres: ["Dream Pop", "Ambient", "Indie Folk"],
  defaultScenario: "今晚写东西，安静但不要太困。",
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

function context(themeMode: "dark" | "light" | "system" = "dark") {
  return {
    profile,
    preferences: {
      profileId: profile.id,
      themeMode,
      djLanguage: "zh-CN",
      djVoiceStyle: "british-soft-radio",
      updatedAt: "2026-07-17T08:00:00.000Z",
    },
  };
}

async function mockProfileWorkspace(
  page: Page,
  options: { current: boolean; theme?: "dark" | "light" | "system" },
): Promise<void> {
  await page.route(/\/api\/v1\/profiles$/, async (route) =>
    route.fulfill({ json: { items: options.current ? [profile] : [] } }),
  );
  await page.route(/\/api\/v1\/profiles\/current$/, async (route) =>
    route.fulfill({ json: { current: options.current ? context(options.theme) : null } }),
  );
  await page.route(/\/api\/v1\/device-settings$/, async (route) =>
    route.fulfill({
      json: {
        dataRoot: "/Users/listener/Library/Application Support/Koradio",
        codexCommand: "/opt/homebrew/bin/codex",
        updatedAt: "2026-07-17T08:00:00.000Z",
      },
    }),
  );
  await page.route(/\/api\/v1\/health\/services$/, async (route) =>
    route.fulfill({
      json: {
        items: [
          ["local-service", "available", "Local Service is ready"],
          ["codex", "available", "Codex command is configured"],
          ["netease", "available", "Built-in NetEase provider is available"],
          ["tts", "degraded", "Apple system TTS is temporarily unavailable"],
        ].map(([service, status, redactedSummary]) => ({
          service,
          status,
          redactedSummary,
          checkedAt: "2026-07-17T08:00:00.000Z",
        })),
      },
    }),
  );
}

async function ensureProfile(page: Page): Promise<void> {
  await page.goto("http://127.0.0.1:49373/radio");
  const destination = await Promise.race([
    page
      .getByRole("heading", { name: "创建电台档案" })
      .waitFor()
      .then(() => "create" as const),
    page
      .getByRole("heading", { name: "Radio" })
      .waitFor()
      .then(() => "radio" as const),
  ]);
  if (destination === "create") {
    await page.getByRole("textbox", { name: /电台名称/ }).fill("Browser Test Radio");
    await page.getByRole("textbox", { name: /你的昵称/ }).fill("Browser Listener");
    await page.getByRole("button", { name: "保存并进入 Koradio" }).click();
    const afterCreate = await Promise.race([
      page
        .getByRole("heading", { name: "设置", exact: true })
        .waitFor()
        .then(() => "settings" as const),
      page
        .getByRole("heading", { name: "Radio" })
        .waitFor()
        .then(() => "radio" as const),
    ]);
    if (afterCreate === "settings") {
      await page.getByRole("textbox", { name: "Codex 命令路径" }).fill("codex");
      await page.getByRole("button", { name: "保存配置" }).click();
      await expect(page.getByText("配置已保存。")).toBeVisible();
      await page.getByRole("button", { name: "Radio" }).click();
    }
  }
  await expect(page.getByRole("heading", { name: "Radio" })).toBeVisible();
}

async function fillFrozenProfile(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: /电台名称/ }).fill("After Midnight");
  await page.getByRole("textbox", { name: /你的昵称/ }).fill("komo");
  for (const genre of ["Dream Pop", "Indie Folk", "Ambient"]) {
    await page.getByRole("textbox", { name: "添加常听风格" }).fill(genre);
    await page.getByRole("button", { name: "添加风格" }).click();
  }
  await page
    .getByRole("textbox", { name: /默认场景/ })
    .fill("夜晚写作或整理思绪时，希望音乐安静、有呼吸感，但不要太催眠。");
  await page.getByRole("textbox", { name: /电台名称/ }).focus();
}

test("creates a second profile and switches through the coordinated command", async ({
  browserName,
  page,
}) => {
  await ensureProfile(page);
  await page.getByRole("button", { name: "切换档案" }).click();
  await page.getByRole("button", { name: /创建新的电台档案/ }).click();
  await page.getByRole("textbox", { name: /电台名称/ }).fill(`Switch Radio ${browserName}`);
  await page.getByRole("textbox", { name: /你的昵称/ }).fill(`Listener ${browserName}`);
  const createSelection = page.waitForRequest(
    (request) => request.url().endsWith("/api/v1/profiles/current") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "保存并进入 Koradio" }).click();
  await createSelection;
  await expect(page.getByRole("heading", { name: "Radio" })).toBeVisible();

  await page.getByRole("button", { name: "切换档案" }).click();
  const selector = page.getByRole("button", { name: /^选择档案：/ }).first();
  await expect(selector).toBeVisible();
  const switchRequest = page.waitForRequest(
    (request) => request.url().endsWith("/api/v1/profiles/current") && request.method() === "PUT",
  );
  await selector.click();
  const request = await switchRequest;
  expect(request.postDataJSON()).toHaveProperty("profileId");
  await expect(page.getByRole("heading", { name: "Radio" })).toBeVisible();
});

test("profile create is keyboard accessible and matches the frozen layout", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "visual baseline is captured once in Chromium");
  await page.setViewportSize({ width: 960, height: 1600 });
  await mockProfileWorkspace(page, { current: false });
  await page.goto("http://127.0.0.1:49373/radio");

  await expect(page.getByRole("heading", { name: "创建电台档案" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("选择头像")).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await fillFrozenProfile(page);
  await expect(page).toHaveScreenshot("profile-create-dark.png", {
    animations: "disabled",
    fullPage: false,
  });
});

for (const theme of ["dark", "light"] as const) {
  test(`Settings ${theme} theme matches the frozen single-column layout`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "visual baseline is captured once in Chromium");
    await page.setViewportSize({ width: 960, height: 1600 });
    await mockProfileWorkspace(page, { current: true, theme });
    await page.goto("http://127.0.0.1:49373/settings");

    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeFocused();
    await expect(page.getByText("3 SERVICES ONLINE")).toBeVisible();
    await expect(page.getByLabel(/API Key|Cookie|密钥/)).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot(`settings-${theme}.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });
}

const responsiveViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1194 },
  { name: "desktop", width: 1440, height: 1200 },
] as const;

for (const viewport of responsiveViewports) {
  test(`Profile ${viewport.name} responsive layout remains single-column`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "responsive baselines are captured once in Chromium");
    await page.setViewportSize(viewport);
    await mockProfileWorkspace(page, { current: false });
    await page.goto("http://127.0.0.1:49373/radio");
    await fillFrozenProfile(page);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(page).toHaveScreenshot(`profile-create-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });

  test(`Settings ${viewport.name} responsive layout preserves all controls`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "responsive baselines are captured once in Chromium");
    await page.setViewportSize(viewport);
    await mockProfileWorkspace(page, { current: true });
    await page.goto("http://127.0.0.1:49373/settings");
    await expect(page.getByRole("textbox", { name: "Codex 命令路径" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeVisible();
    await expect(page.getByText("数据路径")).toBeVisible();
    await expect(page.getByRole("button", { name: "保存配置" })).toBeVisible();
    await page.getByRole("heading", { name: "设置", exact: true }).scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot(`settings-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });
}
