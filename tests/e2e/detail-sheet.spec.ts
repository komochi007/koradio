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

const lyricLines = [
  "夜色落在窗边，灯还醒着",
  "The room is quiet but the melody stays",
  "我们把未写完的话留给和弦",
  "A little rhythm keeps the hours moving",
  "风经过键盘，也经过旧照片",
  "Every note returns with warmer colors",
  "不急着抵达，也不害怕停留",
  "The city hums beneath a softer voice",
  "把今天折好，放进下一小节",
  "We let the chorus carry what remains",
  "远处的车灯像缓慢的星群",
  "A steady groove is drawing us along",
  "这一刻正好，不需要答案",
  "The middle of the song opens its hands",
  "吉他留下木头与指尖的温度",
  "The piano answers gently from the hall",
  "我们听见呼吸落在鼓点之间",
  "No hurry now, the night is still awake",
  "让旋律替沉默找到一个名字",
  "A human voice makes every shadow clear",
  "故事转弯，却仍然保持明亮",
  "The final verse remembers where we came",
  "天快亮了，余韵还没有散",
  "One last chord stays warm after the song",
] as const;

const timedLyrics = lyricLines
  .map((line, index) => {
    const seconds = index * 10;
    const minute = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const second = (seconds % 60).toString().padStart(2, "0");
    return `[${minute}:${second}.00]${line}`;
  })
  .join("\n");

function detailProgram(mode: "speaking" | "lyrics", scriptText?: string) {
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
        text:
          scriptText ??
          "今晚不必急着找到答案。先让声音替房间留一点呼吸。这一首会慢慢展开，但不会把你带得太远。",
        displayText:
          scriptText ??
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
    lyricContent?: string;
    mode: "speaking" | "lyrics";
    playback?: boolean;
    scriptText?: string;
    theme?: "dark" | "light";
  },
): Promise<void> {
  const context = page.context();
  const program = detailProgram(options.mode, options.scriptText);
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
            djVoiceStyle: "natural-radio",
            updatedAt: "2026-07-19T08:00:00.000Z",
          },
        },
      },
    }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/programs\/current$/, (route) =>
    route.fulfill({ json: { program } }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/programs\/(?!current$)[^/?]+$/, (route) =>
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
              content: options.lyricContent ?? timedLyrics,
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
    await expect(
      page.getByText(
        options.lyricContent?.replace(/^\[\d{2}:\d{2}\.\d{2}\]/u, "") ?? lyricLines[0],
      ),
    ).toBeVisible();
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
    "先让声音替房间留一点呼吸",
  );
});

test("Detail keeps English DJ copy whole and inside the compact card", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 652 });
  await openDetail(page, {
    mode: "speaking",
    playback: false,
    scriptText:
      "Coming right up. We're keeping the groove crisp, the melodies bright and the energy comfortably below, accidentally dancing through a video call. Settle in and let the next stretch of work find its rhythm.",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.electronCanvas = "true";
  });
  const copy = page.getByRole("article", { name: "DJ 串讲词" });
  const lines = copy.locator(".detail-copy__line p");
  await expect(lines).toHaveCount(8);
  await expect(lines).toHaveText([
    "Coming right up",
    "We're keeping the groove crisp",
    "the melodies bright and the energy",
    "comfortably below",
    "accidentally dancing through a",
    "video call",
    "Settle in and let the next stretch",
    "of work find its rhythm",
  ]);
  expect(
    await lines.evaluateAll((elements) =>
      elements.every((element) => element.scrollWidth <= element.clientWidth),
    ),
  ).toBe(true);
});

test("Detail keeps the enlarged narrow-window lyric inside its card without splitting words", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 652 });
  await openDetail(page, {
    mode: "lyrics",
    playback: false,
    lyricContent: "[00:00.00]But then again I don't remember you at all",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.electronCanvas = "true";
  });
  const metrics = await page.locator(".detail-copy__line--current").evaluate((line) => {
    const scroller = line.closest<HTMLElement>(".detail-copy__scroller");
    if (scroller === null) throw new Error("Expected Detail lyric scroller");
    const lineRect = line.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const style = getComputedStyle(line);
    return {
      lineRight: lineRect.right,
      overflowWrap: style.overflowWrap,
      scrollerContentRight:
        scrollerRect.right - Number.parseFloat(getComputedStyle(scroller).paddingRight),
      text: line.textContent,
      wordBreak: style.wordBreak,
    };
  });
  expect(metrics.text).toBe("But then again I don't remember you at all");
  expect(metrics.overflowWrap).toBe("normal");
  expect(metrics.wordBreak).toBe("normal");
  expect(metrics.lineRight).toBeLessThanOrEqual(metrics.scrollerContentRight + 0.5);
});

test("Detail keeps long lyrics scrollable, hides scrollbars and centers the current line", async ({
  browserName,
  page,
}) => {
  await openDetail(page, { mode: "lyrics" });
  const copy = page.getByRole("article", { name: "跟随歌词" });
  const scroller = copy.locator(".detail-copy__scroller");
  const lineByText = (text: string) =>
    copy.locator(".detail-copy__line").filter({ hasText: text }).first();
  const first = lineByText(lyricLines[0]);
  const next = lineByText(lyricLines[1]);
  const last = lineByText(lyricLines.at(-1) ?? "");

  const metrics = await scroller.evaluate((element) => {
    const style = getComputedStyle(element);
    const webkitScrollbar = getComputedStyle(element, "::-webkit-scrollbar");
    return {
      clientHeight: element.clientHeight,
      overflowY: style.overflowY,
      scrollHeight: element.scrollHeight,
      scrollbarWidth: style.scrollbarWidth,
      webkitDisplay: webkitScrollbar.display,
    };
  });
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.overflowY).toBe("auto");
  expect(metrics.scrollbarWidth).toBe("none");
  if (browserName !== "firefox") expect(metrics.webkitDisplay).toBe("none");
  await expect(scroller).not.toHaveCSS("mask-image", "none");

  const [currentSize, normalSize] = await Promise.all([
    first.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    next.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ]);
  expect(currentSize).toBeGreaterThan(normalSize);

  await scroller.evaluate((element) => {
    element.style.scrollBehavior = "auto";
    element.scrollTop = 0;
  });
  await expect(first).toBeInViewport();
  const [firstRect, copyRect] = await Promise.all([
    first.evaluate((element) => element.getBoundingClientRect()),
    copy.evaluate((element) => element.getBoundingClientRect()),
  ]);
  expect(firstRect.top).toBeGreaterThanOrEqual(copyRect.top);
  expect(firstRect.bottom).toBeLessThanOrEqual(copyRect.bottom);
  await scroller.evaluate((element) => {
    element.style.scrollBehavior = "auto";
    element.scrollTop = element.scrollHeight;
  });
  await expect(last).toBeInViewport();
  const lastRect = await last.evaluate((element) => element.getBoundingClientRect());
  expect(lastRect.top).toBeGreaterThanOrEqual(copyRect.top);
  expect(lastRect.bottom).toBeLessThanOrEqual(copyRect.bottom);
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
    await handle.evaluate((element) => {
      Object.defineProperties(element, {
        releasePointerCapture: { value: () => undefined },
        setPointerCapture: { value: () => undefined },
      });
      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientY: 40, pointerId: 1 }),
      );
      element.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientY: 200, pointerId: 1 }),
      );
      element.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, clientY: 200, pointerId: 1 }),
      );
    });
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
  const waveformCurve = page.locator(".detail-waveform__curve");
  if ((await waveformCurve.count()) > 0) {
    await expect(waveformCurve).toHaveCSS("animation-name", "none");
  } else {
    await expect(page.getByText("WAVEFORM UNAVAILABLE")).toBeVisible();
  }
});

test("Detail keeps the Electron compact composition aligned and balanced", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "compact visual baseline is captured once in Chromium");
  await page.setViewportSize({ width: 430, height: 652 });
  await openDetail(page, { mode: "lyrics", playback: false });
  await page.evaluate(() => {
    document.documentElement.dataset.electronCanvas = "true";
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );

  const metrics = await page.evaluate(() => {
    const status = document.querySelector<HTMLElement>(".detail-status");
    const title = document.querySelector<HTMLElement>(".detail-paper h1");
    const waveform = document.querySelector<HTMLElement>(".detail-waveform");
    const paper = document.querySelector<HTMLElement>(".detail-paper");
    const track = document.querySelector<HTMLElement>(".detail-track");
    const copy = document.querySelector<HTMLElement>(".detail-copy");
    const copyScroller = document.querySelector<HTMLElement>(".detail-copy__scroller");
    const close = document.querySelector<HTMLElement>(".detail-close");
    const play = document.querySelector<HTMLElement>(".detail-play");
    const progress = document.querySelector<HTMLElement>(".detail-program-progress");
    if (
      status === null ||
      title === null ||
      waveform === null ||
      paper === null ||
      track === null ||
      copy === null ||
      copyScroller === null ||
      close === null ||
      play === null ||
      progress === null
    ) {
      throw new Error("Detail compact metrics are unavailable");
    }
    const statusRect = status.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const waveformRect = waveform.getBoundingClientRect();
    const paperRect = paper.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    const playRect = play.getBoundingClientRect();
    const closeVisual = close.querySelector<HTMLElement>(".detail-close__visual");
    const waveformCurve = waveform.querySelector<SVGPathElement>(".detail-waveform__curve");
    const waveformCurveRect = waveformCurve?.getBoundingClientRect() ?? null;
    if (closeVisual === null) throw new Error("Detail compact close metrics are unavailable");
    const closeIcon = closeVisual.querySelector<SVGElement>("svg");
    if (closeIcon === null) {
      throw new Error("Detail compact close icon is unavailable");
    }
    const closeVisualRect = closeVisual.getBoundingClientRect();
    const closeIconRect = closeIcon.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const trackStyle = getComputedStyle(track);
    const copyStyle = getComputedStyle(copyScroller);
    return {
      closeBottom: closeRect.bottom,
      closeHeight: closeRect.height,
      closeIconCenterX: closeIconRect.left + closeIconRect.width / 2,
      closeIconCenterY: closeIconRect.top + closeIconRect.height / 2,
      closeVisualCenterX: closeVisualRect.left + closeVisualRect.width / 2,
      closeVisualCenterY: closeVisualRect.top + closeVisualRect.height / 2,
      closeTop: closeRect.top,
      closeWidth: closeRect.width,
      closeVisualSize: closeVisualRect.width,
      copyHeight: copy.getBoundingClientRect().height,
      copyPaddingBottom: Number.parseFloat(copyStyle.paddingBottom),
      copyPaddingTop: Number.parseFloat(copyStyle.paddingTop),
      copyScrollPaddingBottom: Number.parseFloat(copyStyle.scrollPaddingBottom),
      copyScrollPaddingTop: Number.parseFloat(copyStyle.scrollPaddingTop),
      waveformCurveBottom: waveformCurveRect === null ? null : waveformCurveRect.bottom,
      paperTop: paperRect.top,
      playHeight: playRect.height,
      playWidth: playRect.width,
      playVisualSize: getComputedStyle(play, "::before").width,
      progressHeight: progress.getBoundingClientRect().height,
      titleFontSize: Number.parseFloat(titleStyle.fontSize),
      trackFontSize: Number.parseFloat(trackStyle.fontSize),
      trackProgressHeight: document
        .querySelector<HTMLElement>(".detail-track-progress")
        ?.getBoundingClientRect().height,
      statusBottom: statusRect.bottom,
      statusLeft: statusRect.left,
      statusTop: statusRect.top,
      titleLeft: titleRect.left,
      waveformBottom: waveformRect.bottom,
      waveformTop: waveformRect.top,
    };
  });
  expect(metrics.statusLeft).toBeCloseTo(metrics.titleLeft, 0);
  expect(metrics.statusTop).toBeCloseTo(metrics.closeTop, 0);
  expect(metrics.statusBottom).toBeCloseTo(metrics.closeBottom, 0);
  expect(metrics.statusBottom).toBeLessThan(metrics.waveformTop);
  expect(metrics.waveformBottom).toBeGreaterThan(metrics.paperTop);
  if (metrics.waveformCurveBottom !== null) {
    expect(metrics.waveformCurveBottom).toBeGreaterThan(metrics.paperTop);
  } else {
    await expect(page.getByText("WAVEFORM UNAVAILABLE")).toBeVisible();
  }
  expect(metrics.closeIconCenterX).toBeCloseTo(metrics.closeVisualCenterX, 0);
  expect(metrics.closeIconCenterY).toBeCloseTo(metrics.closeVisualCenterY, 0);
  expect(metrics.closeWidth).toBe(44);
  expect(metrics.closeHeight).toBe(44);
  expect(metrics.closeVisualSize).toBe(32);
  expect(metrics.playWidth).toBe(44);
  expect(metrics.playHeight).toBe(44);
  expect(metrics.playVisualSize).toBe("32px");
  expect(metrics.progressHeight).toBe(32);
  expect(metrics.titleFontSize).toBeLessThanOrEqual(30);
  expect(metrics.trackFontSize).toBe(13);
  expect(metrics.trackProgressHeight).toBe(20);
  expect(metrics.copyPaddingTop).toBeGreaterThanOrEqual(32);
  expect(metrics.copyPaddingBottom).toBeGreaterThanOrEqual(32);
  expect(metrics.copyScrollPaddingTop).toBeGreaterThanOrEqual(32);
  expect(metrics.copyScrollPaddingBottom).toBeGreaterThanOrEqual(32);
  expect(metrics.copyHeight).toBeGreaterThan(260);
  await expect(page).toHaveScreenshot("detail-lyrics-electron-compact.png", {
    animations: "disabled",
    fullPage: false,
  });
});

test("Detail keeps Electron top controls aligned at the reference viewport", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "Electron geometry is captured once in Chromium");
  await page.setViewportSize({ width: 960, height: 1600 });
  await openDetail(page, { mode: "lyrics", playback: false });
  await page.evaluate(() => {
    document.documentElement.dataset.electronCanvas = "true";
  });
  const metrics = await page.evaluate(() => {
    const status = document.querySelector<HTMLElement>(".detail-status");
    const title = document.querySelector<HTMLElement>(".detail-paper h1");
    const track = document.querySelector<HTMLElement>(".detail-track");
    const close = document.querySelector<HTMLElement>(".detail-close");
    const copy = document.querySelector<HTMLElement>(".detail-copy");
    const waveform = document.querySelector<HTMLElement>(".detail-waveform");
    const trackProgress = document.querySelector<HTMLElement>(".detail-track-progress");
    const play = document.querySelector<HTMLElement>(".detail-play");
    const progress = document.querySelector<HTMLElement>(".detail-program-progress");
    if (
      status === null ||
      title === null ||
      track === null ||
      close === null ||
      copy === null ||
      waveform === null ||
      trackProgress === null ||
      play === null ||
      progress === null
    ) {
      throw new Error("Detail reference metrics are unavailable");
    }
    const statusRect = status.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const waveformRect = waveform.getBoundingClientRect();
    const playRect = play.getBoundingClientRect();
    const progressRect = progress.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const trackStyle = getComputedStyle(track);
    return {
      closeBottom: closeRect.bottom,
      closeHeight: closeRect.height,
      closeTop: closeRect.top,
      closeWidth: closeRect.width,
      copyHeight: copyRect.height,
      playHeight: playRect.height,
      playLeft: playRect.left,
      playWidth: playRect.width,
      progressBottom: progressRect.bottom,
      progressRight: progressRect.right,
      progressWidth: progressRect.width,
      statusBottom: statusRect.bottom,
      statusLeft: statusRect.left,
      statusTop: statusRect.top,
      titleLeft: titleRect.left,
      titleFontSize: Number.parseFloat(titleStyle.fontSize),
      trackFontSize: Number.parseFloat(trackStyle.fontSize),
      trackProgressHeight: trackProgress.getBoundingClientRect().height,
      waveformLeft: waveformRect.left,
      waveformRight: waveformRect.right,
    };
  });
  expect(metrics.statusLeft).toBeCloseTo(metrics.titleLeft, 0);
  expect(metrics.statusTop).toBeCloseTo(metrics.closeTop, 0);
  expect(metrics.statusBottom).toBeCloseTo(metrics.closeBottom, 0);
  expect(metrics.closeWidth).toBe(56);
  expect(metrics.closeHeight).toBe(56);
  expect(metrics.playWidth).toBe(48);
  expect(metrics.playHeight).toBe(48);
  expect(metrics.playLeft - metrics.progressRight).toBe(16);
  expect(metrics.progressWidth).toBeGreaterThan(760);
  expect(metrics.titleFontSize).toBeLessThanOrEqual(40);
  expect(metrics.trackFontSize).toBeLessThanOrEqual(16);
  expect(metrics.trackProgressHeight).toBe(20);
  expect(metrics.copyHeight).toBeGreaterThan(800);
  expect(metrics.waveformLeft).toBe(0);
  expect(metrics.waveformRight).toBe(960);
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
