import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { installPlayableMedia } from "./playable-media.js";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
const profileId = "00000000-0000-4000-8000-000000000510";
const programId = "00000000-0000-4000-8000-000000000570";
const trackId = "00000000-0000-4000-8000-000000000571";
const segmentId = "00000000-0000-4000-8000-000000000572";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await installPlayableMedia(page);
});

const profile = {
  id: profileId,
  radioName: "After Midnight",
  nickname: "Komo",
  avatarRef: null,
  frequentGenres: ["Dream Pop", "Ambient"],
  defaultScenario: "安静地写东西",
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
};

function detailProgram(mode: "speaking" | "lyrics") {
  const track = {
    id: trackId,
    source: "netease",
    sourceTrackId: "detail-space-song",
    title: "Space Song",
    artist: "Beach House",
    album: "Depression Cherry",
    durationMs: 1_800_000,
    lyricStatus: "available",
  };
  const dj = {
    id: "00000000-0000-4000-8000-000000000573",
    kind: "dj",
    position: 0,
    segmentId,
    audioRef: "tts/detail-intro.wav",
    durationMs: 1_800_000,
  };
  const trackItem = {
    id: "00000000-0000-4000-8000-000000000574",
    kind: "track",
    position: mode === "speaking" ? 1 : 0,
    trackId,
    resolvedAudioRef: "https://media.example.test/detail.wav",
    durationMs: 1_800_000,
  };
  return {
    program: {
      id: programId,
      profileId,
      scenarioText: "今晚写东西，安静但不要太困",
      title: "After Hours, Soft Focus",
      status: "ready",
      trackIds: [trackId],
      createdAt: "2026-07-19T08:00:00.000Z",
    },
    djScripts: [
      {
        id: segmentId,
        programId,
        type: "intro",
        language: "zh-CN",
        text: "今晚不必急着找到答案。先让声音替房间留一点呼吸。这一首会慢慢展开，但不会把你带得太远。",
        displayText:
          "今晚不必急着找到答案。先让声音替房间留一点呼吸。这一首会慢慢展开，但不会把你带得太远。",
        estimatedTiming: true,
        ttsAudioRef: "tts/detail-intro.wav",
      },
    ],
    tracks: [track],
    timeline: mode === "speaking" ? [dj, trackItem] : [trackItem],
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

async function openDetail(
  page: Page,
  options: {
    lyricStatus?: "available" | "unavailable";
    mode: "speaking" | "lyrics";
    playback?: boolean;
    theme?: "dark" | "light";
  },
): Promise<void> {
  const context = page.context();
  const program = detailProgram(options.mode);
  if (options.lyricStatus === "unavailable") {
    program.tracks = program.tracks.map((track) => ({
      ...track,
      lyricStatus: "unavailable",
    }));
  }
  await context.route(/\/api\/v1\/profiles$/, (route) =>
    route.fulfill({ json: { items: [profile] } }),
  );
  await context.route(/\/api\/v1\/profiles\/current$/, (route) =>
    route.fulfill({
      json: {
        current: {
          profile,
          preferences: {
            profileId,
            themeMode: options.theme ?? "dark",
            djLanguage: "zh-CN",
            djVoiceStyle: "british-soft-radio",
            updatedAt: "2026-07-19T08:00:00.000Z",
          },
        },
      },
    }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/programs\?limit=1$/, (route) =>
    route.fulfill({ json: { items: [program.program] } }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/programs\/[^/?]+$/, (route) =>
    route.fulfill({ json: program }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/tracks\/[^/]+\/lyrics$/, (route) =>
    route.fulfill({
      json:
        options.lyricStatus === "unavailable"
          ? { trackId, status: "unavailable", content: null }
          : {
              trackId,
              status: "available",
              content:
                "[00:00.00]It was late at night\n[00:15.00]A small light stayed awake\n[00:24.00]We let the hours move",
            },
    }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/playback$/, (route) =>
    route.fulfill({
      status: 404,
      json: {
        code: "PLAYBACK_SNAPSHOT_NOT_FOUND",
        message: "Playback snapshot was not found",
        retryable: false,
        correlationId: "00000000-0000-4000-8000-000000000599",
      },
    }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/playback\/checkpoints$/, async (route) => {
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
        ...command,
        savedAt: "2026-07-19T08:00:00.000Z",
      },
    });
  });
  await context.route("https://media.example.test/**", (route) =>
    route.fulfill({
      body: wav(30_000),
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
    }),
  );
  await context.route("**/tts/detail-intro.wav", (route) =>
    route.fulfill({
      body: wav(30_000),
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
    }),
  );
  await page.goto(`${appOrigin}/radio`);
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeVisible();
  const detailButton = page.getByRole("button", { name: "打开当前节目详情" });
  await expect(detailButton).toBeVisible();
  if (options.playback !== false) {
    const playbackControl = page
      .getByRole("region", { name: "当前节目" })
      .getByRole("button", { name: /^(播放|暂停)$/ });
    await expect(playbackControl).toBeVisible();
    if ((await playbackControl.getAttribute("aria-label")) === "播放") {
      await playbackControl.evaluate((button: HTMLButtonElement) => {
        button.click();
      });
    }
    await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
  }
  await detailButton.click();
  await expect(page.getByRole("dialog", { name: "After Hours, Soft Focus" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭节目详情，播放继续" })).toBeFocused();
  if (options.mode === "lyrics" && options.lyricStatus !== "unavailable") {
    await expect(page.getByText("It was late at night")).toBeVisible();
  }
}

test("Detail follows lyrics, traps focus and closes without interrupting playback", async ({
  page,
}) => {
  await openDetail(page, { mode: "lyrics" });
  const dialog = page.getByRole("dialog", { name: "After Hours, Soft Focus" });
  const close = page.getByRole("button", { name: "关闭节目详情，播放继续" });
  const pause = dialog.getByRole("button", { name: "暂停", exact: true });
  await page.keyboard.press("Shift+Tab");
  await expect(pause).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "打开当前节目详情" })).toBeFocused();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
});

test("Detail shows estimated DJ timing while the DJ segment is speaking", async ({ page }) => {
  await openDetail(page, { mode: "speaking" });
  await expect(page.getByText("SPEAKING NOW")).toBeVisible();
  await expect(page.getByRole("article", { name: "DJ 串讲词" })).toContainText(
    "先让声音替房间留一点呼吸。",
  );
});

test("Detail degrades clearly when lyrics are unavailable", async ({ browserName, page }) => {
  await openDetail(page, { lyricStatus: "unavailable", mode: "lyrics", playback: false });
  await expect(page.getByText("暂无歌词，正在播放 DJ 推荐曲目")).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "After Hours, Soft Focus" })
      .getByRole("button", { name: "播放", exact: true }),
  ).toBeEnabled();
  if (browserName === "chromium") {
    const handle = page.locator(".detail-drag-handle");
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 160, { steps: 8 });
      await page.mouse.up();
    }
  } else {
    await page.getByRole("button", { name: "关闭节目详情，播放继续" }).click();
  }
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "打开当前节目详情" })).toBeFocused();
});

test("Detail passes axe and stops continuous motion when Reduce Motion is enabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDetail(page, { mode: "lyrics", playback: false });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.locator(".radio-detail-layer")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".detail-waveform__bar").first()).toHaveCSS("animation-name", "none");
});

for (const mode of ["speaking", "lyrics"] as const) {
  test(`Detail ${mode} matches the frozen full-screen skeleton`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "visual baseline is captured once in Chromium");
    await page.setViewportSize({ width: 960, height: 1600 });
    await openDetail(page, { mode });
    await expect(page).toHaveScreenshot(`detail-${mode}-dark.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });
}

test("Detail lyrics preserves the fixed light-theme geometry", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "visual baseline is captured once in Chromium");
  await page.setViewportSize({ width: 960, height: 1600 });
  await openDetail(page, { mode: "lyrics", theme: "light" });
  await expect(page).toHaveScreenshot("detail-lyrics-light.png", {
    animations: "disabled",
    fullPage: false,
  });
});

const responsiveViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1194 },
  { name: "desktop", width: 1440, height: 1200 },
] as const;

for (const viewport of responsiveViewports) {
  test(`Detail lyrics preserves hierarchy at ${viewport.name}`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "responsive baseline is captured once in Chromium");
    await page.setViewportSize(viewport);
    await openDetail(page, { mode: "lyrics" });
    await expect(page.getByRole("dialog", { name: "After Hours, Soft Focus" })).toBeVisible();
    await expect(page).toHaveScreenshot(`detail-lyrics-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: false,
    });
  });
}
