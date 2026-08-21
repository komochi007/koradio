import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;

test.use({ serviceWorkers: "block" });

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
      djVoiceStyle: "natural-radio",
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
        plannerProvider: "codex",
        deepseekModel: "deepseek-v4-flash",
        deepseekPrivacyNoticeAccepted: false,
        updatedAt: "2026-07-17T08:00:00.000Z",
      },
    }),
  );
  await page.route(/\/api\/v1\/device-settings\/tts-model$/, async (route) =>
    route.fulfill({
      json: {
        model: "Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit",
        revision: "049ef77fe8816b536193c0c25f9a214d17921282",
        state: "not-installed",
        downloadedBytes: 0,
        totalBytes: 1973573869,
        progressPercent: 0,
      },
    }),
  );
  let deepseekConfigured = false;
  await page.route(/\/api\/v1\/device-settings\/deepseek-credentials$/, async (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      deepseekConfigured = true;
    } else if (method === "DELETE") {
      deepseekConfigured = false;
    }
    await route.fulfill({ json: { configured: deepseekConfigured } });
  });
  await page.route(/\/api\/v1\/health\/services$/, async (route) =>
    route.fulfill({
      json: {
        items: [
          ["local-service", "available", "Local Service is ready"],
          ["planner", "available", "Active AI planner is configured"],
          ["netease", "available", "Built-in NetEase provider is available"],
          ["tts", "degraded", "Qwen3-TTS local model is temporarily unavailable"],
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

async function enableStandaloneDesktopPwa(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const browserMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      if (query === "(display-mode: standalone)" || query === "(pointer: fine)") {
        return {
          addEventListener: () => undefined,
          addListener: () => undefined,
          dispatchEvent: () => false,
          matches: true,
          media: query,
          onchange: null,
          removeEventListener: () => undefined,
          removeListener: () => undefined,
        };
      }
      return browserMatchMedia(query);
    };
  });
}

async function ensureProfile(page: Page): Promise<void> {
  await page.goto(`${appOrigin}/radio`);
  const destination = await Promise.race([
    page
      .getByRole("heading", { name: "创建电台档案" })
      .waitFor()
      .then(() => "create" as const),
    page
      .getByRole("heading", { name: "Radio", exact: true })
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
        .getByRole("heading", { name: "Radio", exact: true })
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
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "切换档案" }).click();
  const selector = page.getByRole("button", { name: /^选择档案：/ }).first();
  await expect(selector).toBeVisible();
  const switchRequest = page.waitForRequest(
    (request) => request.url().endsWith("/api/v1/profiles/current") && request.method() === "PUT",
  );
  await selector.click();
  const request = await switchRequest;
  expect(request.postDataJSON()).toHaveProperty("profileId");
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeVisible();
});

test("profile create is keyboard accessible and matches the frozen layout", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "visual baseline is captured once in Chromium");
  await page.setViewportSize({ width: 960, height: 1600 });
  await mockProfileWorkspace(page, { current: false });
  await page.goto(`${appOrigin}/radio`);

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
    await page.goto(`${appOrigin}/settings`);

    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeFocused();
    await expect(page.getByText("3 SERVICES ONLINE")).toBeVisible();
    await expect(page.getByLabel("DeepSeek API key")).toHaveValue("");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot(`settings-${theme}.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });
}

test.describe("service diagnostics", () => {
  test.use({ serviceWorkers: "block" });

  test("exposes redacted health and optional TTS degradation", async ({ browserName, page }) => {
    await page.setViewportSize({ width: 960, height: 1600 });
    await mockProfileWorkspace(page, { current: true });
    await page.goto(`${appOrigin}/settings`);

    await page.getByRole("button", { name: "查看" }).first().click();
    await expect(page.getByRole("heading", { name: "服务检测", exact: true })).toBeFocused();
    await expect(page.getByText("3 OF 4 SERVICES AVAILABLE")).toBeVisible();
    await expect(page.getByText("核心播放服务可用，语音串讲将暂时降级为文字。")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Qwen3-TTS" })).toBeVisible();
    await expect(page.getByText("你仍然可以生成和播放节目，歌曲播放不受影响。")).toBeVisible();
    await expect(page.getByRole("button", { name: "返回 Radio" })).toBeEnabled();
    await expect(page.getByLabel(/API Key|Cookie|密钥/)).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    if (browserName === "chromium") {
      await expect(page).toHaveScreenshot("settings-diagnostics-dark.png", {
        animations: "disabled",
        fullPage: false,
      });
    }

    await page.getByRole("button", { name: "修改配置" }).click();
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  });
});

test("confirms DeepSeek privacy, saves a key through the controlled settings flow", async ({
  page,
}) => {
  await mockProfileWorkspace(page, { current: true });
  await page.goto(`${appOrigin}/settings`);

  await page.getByRole("button", { name: "AI 大脑" }).click();
  await page.getByRole("option", { name: "DeepSeek · 远程 API" }).click();
  await expect(page.getByRole("heading", { name: "启用 DeepSeek 前请确认" })).toBeVisible();
  await expect(page.getByText(/EffectiveTaste/)).toBeVisible();
  await page.getByRole("button", { name: "我已了解，启用 DeepSeek" }).click();

  await page.getByLabel("DeepSeek API key").fill("sk-e2e-secret");
  await page.getByRole("button", { name: "保存 key" }).click();
  await expect(page.getByText("DeepSeek API key 已安全写入系统钥匙串。")).toBeVisible();
  await expect(page.getByLabel("DeepSeek API key")).toHaveCount(0);
  await expect(page.getByText("已配置")).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑" })).toBeVisible();
});

test("keeps Settings selectors and profile controls aligned to their shared right edge", async ({
  page,
}) => {
  await mockProfileWorkspace(page, { current: true });
  await page.goto(`${appOrigin}/settings`);
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await expect(page.locator(".koradio-select__trigger")).toHaveCount(4);
  await expect(page.locator(".service-status--success").first()).toBeVisible();

  const settingsMetrics = await page.evaluate(() => {
    const selects = [...document.querySelectorAll<HTMLButtonElement>(".koradio-select__trigger")];
    const available = document.querySelector<HTMLElement>(".service-status--success");
    if (selects.length !== 4 || available === null) {
      throw new Error("Settings alignment metrics are unavailable");
    }
    const availableRect = available.getBoundingClientRect();
    return {
      availableRight: availableRect.right,
      selects: selects.map((select) => {
        const style = getComputedStyle(select);
        const rect = select.getBoundingClientRect();
        return {
          chevronWidth: select
            .querySelector<HTMLElement>(".koradio-select__chevron")
            ?.getBoundingClientRect().width,
          minHeight: Number.parseFloat(style.minHeight),
          right: rect.right,
        };
      }),
    };
  });
  for (const select of settingsMetrics.selects) {
    expect(select.minHeight).toBeGreaterThanOrEqual(44);
    expect(select.chevronWidth).toBeGreaterThan(0);
  }

  await page.setViewportSize({ width: 430, height: 652 });
  await page.goto(`${appOrigin}/settings`);
  await expect(page.locator(".service-list li")).toHaveCount(4);
  const serviceMetrics = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>(".service-list li")];
    return rows.map((row) => {
      const status = row.querySelector<HTMLElement>(".service-status");
      const action = row.querySelector<HTMLButtonElement>("button");
      if (status === null || action === null) {
        throw new Error("Service status alignment metrics are unavailable");
      }
      const statusRect = status.getBoundingClientRect();
      const actionRect = action.getBoundingClientRect();
      return {
        actionLeft: actionRect.left,
        actionRight: actionRect.right,
        centerDelta: Math.abs(
          statusRect.left + statusRect.width / 2 - (actionRect.left + actionRect.width / 2),
        ),
        statusLeft: statusRect.left,
        statusRight: statusRect.right,
      };
    });
  });
  expect(serviceMetrics).toHaveLength(4);
  for (const metrics of serviceMetrics) {
    expect(metrics.centerDelta).toBeLessThanOrEqual(1);
    expect(metrics.statusLeft).toBeCloseTo(metrics.actionLeft, 0);
    expect(metrics.statusRight).toBeCloseTo(metrics.actionRight, 0);
  }

  await page.setViewportSize({ width: 430, height: 652 });
  await page.goto(`${appOrigin}/radio`);
  await page.getByRole("button", { name: "切换档案" }).click();
  await expect(page.getByRole("heading", { name: "选择你的电台档案" })).toBeVisible();
  await expect(page.locator(".profile-card__rail b")).toHaveCount(0);
  const profileMetrics = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".profile-card");
    const current = document.querySelector<HTMLElement>(".profile-card__rail em");
    const edit = document.querySelector<HTMLElement>(".profile-card__edit");
    if (card === null || current === null || edit === null) {
      throw new Error("Profile alignment metrics are unavailable");
    }
    const cardStyle = getComputedStyle(card);
    const cardRect = card.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    const editRect = edit.getBoundingClientRect();
    return {
      cardRightInset: cardRect.right - currentRect.right,
      editCurrentDelta: Math.abs(editRect.right - currentRect.right),
      editRightInset: cardRect.right - editRect.right,
      borderRight: Number.parseFloat(cardStyle.borderRightWidth),
      paddingRight: Number.parseFloat(cardStyle.paddingRight),
      actionInset: Number.parseFloat(
        getComputedStyle(card).getPropertyValue("--profile-card-action-inset"),
      ),
    };
  });
  expect(profileMetrics.editCurrentDelta).toBeLessThanOrEqual(2);
  expect(profileMetrics.cardRightInset).toBeGreaterThanOrEqual(
    profileMetrics.paddingRight + profileMetrics.borderRight + profileMetrics.actionInset - 2,
  );
  expect(profileMetrics.editRightInset).toBeCloseTo(
    profileMetrics.paddingRight + profileMetrics.borderRight + profileMetrics.actionInset,
    0,
  );
});

test("keeps the profile avatar label separated from the avatar and controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockProfileWorkspace(page, { current: false });
  await page.goto(`${appOrigin}/radio`);
  const avatarField = page.locator(".avatar-field").first();
  const metrics = await avatarField.evaluate((field) => {
    const legend = field.querySelector<HTMLElement>("legend");
    const avatar = field.querySelector<HTMLElement>(".profile-avatar");
    const controls = field.querySelector<HTMLElement>(":scope > div");
    if (legend === null || avatar === null || controls === null) {
      throw new Error("Avatar field metrics are unavailable");
    }
    const legendRect = legend.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    return {
      avatarWidth: avatarRect.width,
      controlsLeft: controlsRect.left,
      avatarRight: avatarRect.right,
      legendGap: avatarRect.top - legendRect.bottom,
    };
  });
  expect(metrics.legendGap).toBeGreaterThanOrEqual(8);
  expect(metrics.avatarWidth).toBe(104);
  expect(metrics.controlsLeft - metrics.avatarRight).toBe(20);
});

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
    await page.goto(`${appOrigin}/radio`);
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
    await page.goto(`${appOrigin}/settings`);
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

test("keeps Settings content scrollable without blank space in a standalone desktop canvas", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "standalone canvas is captured once in Chromium");
  await enableStandaloneDesktopPwa(page);
  await page.setViewportSize({ width: 560, height: 600 });
  await mockProfileWorkspace(page, { current: true });
  await page.goto(`${appOrigin}/settings`);

  const region = page.locator(".settings-main");
  const actions = page.locator(".settings-actions");
  await expect(region).toBeVisible();
  await expect(actions).toBeVisible();
  await expect(page.getByRole("button", { name: "保存配置" })).toHaveAttribute(
    "form",
    "settings-form",
  );
  const before = await actions.boundingBox();
  const metrics = await page.evaluate(() => {
    const region = document.querySelector<HTMLElement>(".settings-main");
    const canvas = document.querySelector<HTMLElement>(".desktop-canvas");
    if (region === null || canvas === null)
      throw new Error("Standalone Settings canvas is unavailable");
    const style = getComputedStyle(region);
    region.scrollTop = region.scrollHeight;
    return {
      canvas: canvas.getBoundingClientRect(),
      clientHeight: region.clientHeight,
      documentHeight: document.documentElement.scrollHeight,
      scrollHeight: region.scrollHeight,
      scrollTop: region.scrollTop,
      scrollbarWidth: style.scrollbarWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  const after = await actions.boundingBox();

  expect(metrics.canvas.height).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.canvas.width).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollTop).toBeGreaterThan(0);
  expect(metrics.scrollbarWidth).toBe("none");
  expect(after).toEqual(before);
  await expect(page.getByText("数据路径")).toBeVisible();
  await expect(page.locator(".primary-nav")).toBeVisible();
});
