import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
const profile = {
  id: "00000000-0000-4000-8000-000000000010",
  radioName: "After Midnight",
  nickname: "Komo",
  avatarRef: null,
  frequentGenres: ["Dream Pop", "Ambient"],
  defaultScenario: "安静地写东西",
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

const program = {
  program: {
    id: "00000000-0000-4000-8000-000000000070",
    profileId: profile.id,
    scenarioText: "今晚写东西，安静但不要太困",
    title: "After Hours, Soft Focus",
    status: "ready",
    trackIds: [
      "00000000-0000-4000-8000-000000000071",
      "00000000-0000-4000-8000-000000000075",
      "00000000-0000-4000-8000-000000000076",
    ],
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
    {
      id: "00000000-0000-4000-8000-000000000075",
      source: "netease",
      sourceTrackId: "fixture-harvest-moon",
      title: "Harvest Moon",
      artist: "Neil Young",
      album: "Harvest Moon",
      durationMs: 303_000,
      lyricStatus: "available",
    },
    {
      id: "00000000-0000-4000-8000-000000000076",
      source: "netease",
      sourceTrackId: "fixture-river-man",
      title: "River Man",
      artist: "Nick Drake",
      album: "Five Leaves Left",
      durationMs: 260_000,
      lyricStatus: "unavailable",
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
    {
      id: "00000000-0000-4000-8000-000000000077",
      kind: "track",
      position: 1,
      trackId: "00000000-0000-4000-8000-000000000075",
      resolvedAudioRef: "https://media.example.test/harvest-moon.mp3",
      durationMs: 303_000,
    },
    {
      id: "00000000-0000-4000-8000-000000000078",
      kind: "track",
      position: 2,
      trackId: "00000000-0000-4000-8000-000000000076",
      resolvedAudioRef: "https://media.example.test/river-man.mp3",
      durationMs: 260_000,
    },
  ],
};

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
    await page.getByRole("textbox", { name: /电台名称/ }).fill("Radio E2E");
    await page.getByRole("textbox", { name: /你的昵称/ }).fill("Listener");
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

async function mockRadio(
  page: Page,
  options: {
    generation?: boolean;
    program?: boolean;
    theme?: "dark" | "light";
  },
): Promise<void> {
  await page.route(/\/api\/v1\/profiles$/, (route) =>
    route.fulfill({ json: { items: [profile] } }),
  );
  await page.route(/\/api\/v1\/profiles\/current$/, (route) =>
    route.fulfill({
      json: {
        current: {
          profile,
          preferences: {
            profileId: profile.id,
            themeMode: options.theme ?? "dark",
            djLanguage: "zh-CN",
            djVoiceStyle: "natural-radio",
            updatedAt: "2026-07-17T08:00:00.000Z",
          },
        },
      },
    }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/programs\/current$/, (route) =>
    route.fulfill({
      json: { program: options.program === true ? program : null },
    }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/programs\/(?!current$)[^/?]+$/, (route) =>
    route.fulfill({ json: program }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/playback$/, (route) =>
    route.fulfill({
      status: 404,
      json: {
        code: "PLAYBACK_SNAPSHOT_NOT_FOUND",
        message: "Playback snapshot was not found",
        retryable: false,
        correlationId: "00000000-0000-4000-8000-000000000099",
      },
    }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/playback\/checkpoints$/, async (route) => {
    const command = route.request().postDataJSON() as {
      profileId: string;
      programId: string;
      timelineItemId: string;
      positionMs: number;
      volume: number;
      status: string;
    };
    await route.fulfill({
      json: {
        profileId: command.profileId,
        programId: command.programId,
        timelineItemId: command.timelineItemId,
        positionMs: command.positionMs,
        volume: command.volume,
        status: command.status,
        savedAt: "2026-07-19T08:00:00.000Z",
      },
    });
  });
  await page.route("https://media.example.test/**", (route) =>
    route.fulfill({
      body: wav(20_000),
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
    }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/program-generations$/, (route) =>
    route.fulfill({
      status: 202,
      json: { jobId: "00000000-0000-4000-8000-000000000074" },
    }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/program-generations\/[^/?]+$/, (route) =>
    route.fulfill({
      json: {
        jobId: "00000000-0000-4000-8000-000000000074",
        profileId: profile.id,
        status: "running",
        stage: "resolving_tracks",
        sequence: 2,
        createdAt: "2026-07-17T08:00:00.000Z",
        updatedAt: "2026-07-17T08:00:01.000Z",
      },
    }),
  );
  await page.goto(`${appOrigin}/radio`);
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeFocused();
  if (options.program === true) {
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
  }
  if (options.generation === true) {
    await page
      .getByRole("textbox", { name: "告诉 DJ 当前场景" })
      .fill("今晚写东西，安静但不要太困");
    await page.getByRole("button", { name: "发送给 DJ" }).click();
    await expect(page.getByRole("heading", { name: "TUNING YOUR STATION..." })).toBeVisible();
  }
  await page.locator(".radio-time__clock").evaluate((element) => {
    element.textContent = "22:47";
  });
  await page.locator(".radio-time__date").evaluate((element) => {
    element.textContent = "SUNDAY · JUL 19";
  });
}

test("generates and commits a program through the deterministic Mock backend", async ({
  browserName,
  page,
}) => {
  await ensureProfile(page);
  await page.getByRole("button", { name: "切换档案" }).click();
  await page.getByRole("button", { name: /创建新的电台档案/ }).click();
  await page.getByRole("textbox", { name: /电台名称/ }).fill(`Radio Generation ${browserName}`);
  await page.getByRole("textbox", { name: /你的昵称/ }).fill(`Listener ${browserName}`);
  await page.getByRole("button", { name: "保存并进入 Koradio" }).click();
  await expect(page.getByText("NO SESSION ON AIR")).toBeVisible();
  await page
    .getByRole("textbox", { name: "告诉 DJ 当前场景" })
    .fill("今晚写作，保持安静但不要沉闷");
  const generationRequest = page.waitForRequest(
    (request) => request.url().endsWith("/program-generations") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "发送给 DJ" }).click();
  const request = await generationRequest;
  expect(request.headers()).toHaveProperty("idempotency-key");
  await expect(
    page.getByRole("region", { name: "播放队列" }).getByText("Space Song", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ON AIR")).toBeVisible();
});

for (const state of ["empty", "generating", "playing"] as const) {
  test(`Radio ${state} state matches the frozen shared skeleton`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "visual baseline is captured once in Chromium");
    await page.setViewportSize({ width: 960, height: 1600 });
    await mockRadio(page, { generation: state === "generating", program: state !== "empty" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot(`radio-${state}-dark.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });
}

test("Radio playing state matches the frozen light theme", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "visual baseline is captured once in Chromium");
  await page.setViewportSize({ width: 960, height: 1600 });
  await mockRadio(page, { program: true, theme: "light" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page).toHaveScreenshot("radio-playing-light.png", {
    animations: "disabled",
    fullPage: false,
  });
});

test("Radio queue collapse reflows the DJ area without leaving a gap", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 1600 });
  await mockRadio(page, { program: true });

  const queue = page.getByRole("region", { name: "播放队列" });
  const status = page.getByRole("button", { name: "打开当前节目详情" });
  const dialogue = page.getByRole("region", { name: "DJ 对话" });
  const input = page.getByRole("textbox", { name: "告诉 DJ 当前场景" }).locator("..");
  const transitionDuration = await queue.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(transitionDuration).toContain("0.32s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await queue.getByRole("button", { name: "HIDE" }).click();
  await expect(queue.getByRole("button", { name: "LIST" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  const [queueBox, statusBox, dialogueBox, inputBox] = await Promise.all([
    queue.boundingBox(),
    status.boundingBox(),
    dialogue.boundingBox(),
    input.boundingBox(),
  ]);
  expect(queueBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(dialogueBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(queueBox?.y).toBeCloseTo(656, 0);
  expect(queueBox?.height).toBeCloseTo(60, 0);
  expect(statusBox?.y).toBeCloseTo(740, 0);
  expect(dialogueBox?.y).toBeCloseTo(828, 0);
  expect(dialogueBox?.height).toBeCloseTo(520, 0);
  expect(inputBox?.y).toBeCloseTo(1372, 0);
  expect((statusBox?.y ?? 0) - ((queueBox?.y ?? 0) + (queueBox?.height ?? 0))).toBeCloseTo(24, 0);
  expect((dialogueBox?.y ?? 0) - ((statusBox?.y ?? 0) + (statusBox?.height ?? 0))).toBeCloseTo(
    24,
    0,
  );
  expect((inputBox?.y ?? 0) - ((dialogueBox?.y ?? 0) + (dialogueBox?.height ?? 0))).toBeCloseTo(
    24,
    0,
  );

  const typography = await page.evaluate(() => {
    const user = document.querySelector<HTMLElement>(".radio-user-bubble");
    const dj = document.querySelector<HTMLElement>(".radio-dj-copy > div > p");
    if (user === null || dj === null) throw new Error("Dialogue typography is unavailable");
    const userStyle = getComputedStyle(user);
    const djStyle = getComputedStyle(dj);
    return {
      dj: { fontSize: djStyle.fontSize, lineHeight: djStyle.lineHeight },
      user: { fontSize: userStyle.fontSize, lineHeight: userStyle.lineHeight },
    };
  });
  expect(typography.user).toEqual(typography.dj);
  expect(await queue.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    "0s",
  );

  if (browserName === "chromium") {
    await expect(page).toHaveScreenshot("radio-playing-queue-collapsed.png", {
      animations: "disabled",
      fullPage: false,
    });
  }
});

const responsiveViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1194 },
  { name: "desktop", width: 1440, height: 1200 },
] as const;

for (const viewport of responsiveViewports) {
  test(`Radio playing state preserves hierarchy at ${viewport.name}`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "responsive baseline is captured once in Chromium");
    await page.setViewportSize(viewport);
    await mockRadio(page, { program: true });
    await expect(page.getByRole("heading", { name: "If" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "告诉 DJ 当前场景" })).toBeVisible();
    await expect(page).toHaveScreenshot(`radio-playing-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });
}

const standaloneViewports = [
  { name: "internal-full", width: 1440, height: 801 },
  { name: "desktop-medium", width: 960, height: 720 },
  { name: "desktop-compact", width: 720, height: 650 },
  { name: "desktop-narrow", width: 560, height: 600 },
] as const;

for (const viewport of standaloneViewports) {
  test(`Radio standalone desktop PWA adapts without page scrolling at ${viewport.name}`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "standalone baseline is captured once in Chromium");
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
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await mockRadio(page, { program: true });

    const canvas = page.locator(".desktop-canvas");
    const queue = page.locator(".radio-queue ol");
    const dialogue = page.locator(".radio-dialogue");
    await expect(canvas).toBeVisible();
    await expect(queue).toBeVisible();
    await expect(dialogue).toBeVisible();
    await expect(page).toHaveScreenshot(`radio-playing-standalone-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: false,
    });

    const metrics = await page.evaluate(() => {
      const selectors = ["html", "body", "#root", ".desktop-canvas"] as const;
      const targetSelector = [
        ".radio-scene-input button",
        ".radio-player button",
        ".radio-queue header button",
        ".radio-dj-status",
        ".primary-nav__item",
      ].join(",");
      const element = (selector: string): HTMLElement => {
        const match = document.querySelector<HTMLElement>(selector);
        if (match === null) throw new Error(`${selector} is unavailable`);
        return match;
      };
      const rect = (selector: string): DOMRect => {
        return element(selector).getBoundingClientRect();
      };
      return {
        anchors: {
          input: rect(".radio-scene-input"),
          nav: rect(".primary-nav"),
          topbar: rect(".radio-page__topbar"),
        },
        canvas: rect(".desktop-canvas"),
        dialogueFontSize: getComputedStyle(element(".radio-dj-copy > div > p")).fontSize,
        outerOverflow: selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (element === null) throw new Error(`${selector} is unavailable`);
          return {
            clientHeight: element.clientHeight,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            scrollWidth: element.scrollWidth,
          };
        }),
        queueFontSize: getComputedStyle(element(".radio-queue__track small")).fontSize,
        targets: Array.from(document.querySelectorAll<HTMLElement>(targetSelector)).map(
          (element) => {
            const target = element.getBoundingClientRect();
            return { height: target.height, width: target.width };
          },
        ),
        transform: getComputedStyle(element(".desktop-canvas__content")).transform,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(metrics.canvas.height).toBe(metrics.viewportHeight);
    expect(metrics.canvas.width).toBe(Math.min(960, metrics.viewportWidth));
    expect(metrics.outerOverflow).toEqual(
      metrics.outerOverflow.map((item) => ({
        ...item,
        scrollHeight: item.clientHeight,
        scrollWidth: item.clientWidth,
      })),
    );
    expect(metrics.transform).toBe("none");
    expect(metrics.dialogueFontSize).toBe("20px");
    expect(metrics.queueFontSize).toBe("16px");
    expect(metrics.targets.length).toBeGreaterThan(0);
    expect(metrics.targets.every((target) => target.height >= 44 && target.width >= 44)).toBe(true);
    expect(metrics.anchors.topbar.y).toBeGreaterThanOrEqual(0);
    expect(metrics.anchors.input.y).toBeGreaterThan(metrics.anchors.topbar.y);
    expect(metrics.anchors.input.y + metrics.anchors.input.height).toBeLessThan(
      metrics.anchors.nav.y,
    );
    expect(metrics.anchors.nav.y + metrics.anchors.nav.height).toBeLessThanOrEqual(
      metrics.viewportHeight,
    );

    await queue.focus();
    await page.keyboard.press("PageDown");
    expect(await queue.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await dialogue.focus();
    await page.keyboard.press("PageDown");
    expect(await dialogue.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await dialogue.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
      "0s",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("Radio standalone desktop PWA remains operable at 200% visual zoom", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "Chromium exposes deterministic page zoom emulation");
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
  await page.setViewportSize({ width: 1440, height: 801 });
  await mockRadio(page, { program: true });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });

  await expect(page.getByRole("textbox", { name: "告诉 DJ 当前场景" })).toBeVisible();
  await expect(page.locator(".primary-nav")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight === document.documentElement.clientHeight &&
        document.documentElement.scrollWidth === document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
