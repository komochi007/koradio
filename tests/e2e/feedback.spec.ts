import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page, type Request, type Route } from "@playwright/test";

import { installPlayableMedia } from "./playable-media.js";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
const feedbackRoute = /\/api\/v1\/profiles\/[^/]+\/feedback-events$/;
const feedbackRouteGlob = "**/api/v1/profiles/*/feedback-events";

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

async function enterRadio(page: Page): Promise<void> {
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
    await page.getByRole("textbox", { name: /电台名称/ }).fill("Feedback Bootstrap");
    await page.getByRole("textbox", { name: /你的昵称/ }).fill("Feedback");
    await page.getByRole("button", { name: "保存并进入 Koradio" }).click();
  }
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeVisible();
}

async function createFeedbackProfile(page: Page, suffix: string): Promise<void> {
  await page.getByRole("button", { name: "切换档案" }).click();
  await page.getByRole("button", { name: /创建新的电台档案/ }).click();
  await page.getByRole("textbox", { name: /电台名称/ }).fill(`Feedback ${suffix}`);
  await page.getByRole("textbox", { name: /你的昵称/ }).fill("Feedback");
  await page.getByRole("button", { name: "保存并进入 Koradio" }).click();
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeVisible();
}

async function generateProgram(page: Page): Promise<void> {
  await page
    .getByRole("textbox", { name: "告诉 DJ 当前场景" })
    .fill("今晚写作，保持安静但不要沉闷");
  await page.getByRole("button", { name: "发送给 DJ" }).click();
  await expect(page.getByRole("heading", { name: "Space Song" })).toBeVisible({
    timeout: 15_000,
  });
  const playControl = page.getByRole("button", { name: /^(?:播放|暂停)$/ });
  if ((await playControl.getAttribute("aria-label")) === "播放") await playControl.click();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
}

async function feedbackRequest(page: Page, action: () => Promise<void>): Promise<Request> {
  const requestPromise = page.waitForRequest(
    (request) => feedbackRoute.test(new URL(request.url()).pathname) && request.method() === "POST",
  );
  await action();
  const request = await requestPromise;
  expect(request.headers()).toHaveProperty("idempotency-key");
  return request;
}

test("persists seven feedback events, rolls back failures, and keeps playback running", async ({
  browserName,
  page,
}) => {
  test.setTimeout(60_000);
  await installPlayableMedia(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 960, height: 1600 });
  await page.route("https://media.example.invalid/**", (route) =>
    route.fulfill({
      body: wav(60_000),
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
    }),
  );
  await enterRadio(page);
  await createFeedbackProfile(page, browserName);
  await generateProgram(page);

  if (browserName !== "webkit") {
    const failureHandler = async (route: Route) => {
      await route.fulfill({
        status: 500,
        json: {
          code: "FEEDBACK_PERSIST_FAILED",
          message: "Feedback could not be saved",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000099",
        },
      });
    };
    await page.route(feedbackRouteGlob, failureHandler);
    await page.getByRole("button", { name: "喜欢当前歌曲" }).press("Space");
    await expect(page.getByRole("button", { name: "取消喜欢当前歌曲" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("反馈保存失败，已恢复原状态")).toBeVisible({ timeout: 4_000 });
    await expect(page.getByRole("button", { name: "喜欢当前歌曲" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByRole("heading", { name: "Space Song" })).toBeVisible();
    await page.unroute(feedbackRouteGlob, failureHandler);
  }

  const eventTypes: string[] = [];
  const likeRequest = await feedbackRequest(page, () =>
    page.getByRole("button", { name: "喜欢当前歌曲" }).press("Space"),
  );
  eventTypes.push((likeRequest.postDataJSON() as { type: string }).type);
  await expect(page.getByRole("button", { name: "取消喜欢当前歌曲" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("已记住你的偏好")).toBeVisible();
  await expect(page.getByText("已记住你的偏好")).toBeHidden({ timeout: 4_000 });

  const pause = page.getByRole("button", { name: "暂停", exact: true });
  if (await pause.isVisible()) await pause.click();
  await page.getByRole("slider", { name: "播放进度" }).fill("4000");
  await expect(page.getByRole("slider", { name: "播放进度" })).toHaveValue("4000");
  await page.locator(".radio-time__clock").evaluate((element) => {
    element.textContent = "22:47";
  });
  await page.locator(".radio-time__date").evaluate((element) => {
    element.textContent = "SUNDAY · JUL 19";
  });
  const more = page.getByRole("button", { name: "更多播放操作" });
  await more.focus();
  await more.press("Enter");
  await expect(page.getByRole("menuitem", { name: "不喜欢当前歌曲" })).toBeVisible();
  await more.press("Escape");
  await expect(page.getByRole("menuitem")).toBeHidden();
  await more.press("Enter");
  if (browserName === "chromium") {
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot("feedback-radio-dark.png", {
      animations: "disabled",
      fullPage: false,
    });
  }

  const dislikeRequest = await feedbackRequest(page, () =>
    page.getByRole("menuitem", { name: "不喜欢当前歌曲" }).press("Enter"),
  );
  eventTypes.push((dislikeRequest.postDataJSON() as { type: string }).type);
  await more.press("Enter");
  const dislikeRemovedRequest = await feedbackRequest(page, () =>
    page.getByRole("menuitem", { name: "撤销不喜欢当前歌曲" }).press("Enter"),
  );
  eventTypes.push((dislikeRemovedRequest.postDataJSON() as { type: string }).type);

  const likeRemovedRequest = await feedbackRequest(page, () =>
    page.getByRole("button", { name: "取消喜欢当前歌曲" }).press("Space"),
  );
  eventTypes.push((likeRemovedRequest.postDataJSON() as { type: string }).type);
  const skipRequest = await feedbackRequest(page, () =>
    page.getByRole("button", { name: "跳过当前歌曲" }).click(),
  );
  eventTypes.push((skipRequest.postDataJSON() as { type: string }).type);

  await page.getByRole("button", { name: "Programs" }).click();
  await expect(page.getByRole("heading", { name: "节目", exact: true })).toBeFocused();
  const favoriteRequest = await feedbackRequest(page, () =>
    page.getByRole("button", { name: /^收藏节目 / }).press("Space"),
  );
  eventTypes.push((favoriteRequest.postDataJSON() as { type: string }).type);
  await expect(page.getByRole("button", { name: /^取消收藏节目 / })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const favoriteRemovedRequest = await feedbackRequest(page, () =>
    page.getByRole("button", { name: /^取消收藏节目 / }).click(),
  );
  eventTypes.push((favoriteRemovedRequest.postDataJSON() as { type: string }).type);

  expect(eventTypes).toEqual([
    "track_liked",
    "track_disliked",
    "track_dislike_removed",
    "track_like_removed",
    "track_skipped",
    "program_favorited",
    "program_favorite_removed",
  ]);
});
