import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
const profileId = "00000000-0000-4000-8000-000000000010";
const profile = {
  id: profileId,
  radioName: "After Midnight",
  nickname: "Komo",
  avatarRef: null,
  frequentGenres: ["Dream Pop", "Ambient"],
  defaultScenario: "今晚写东西，安静但不要太困。",
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
};
const tracks = [
  ["If", "Bread", "Manna", 155_000],
  ["Space Song", "Beach House", "Depression Cherry", 320_000],
  ["Mystery of Love", "Sufjan Stevens", "Call Me by Your Name", 248_000],
  ["Moon Song", "Phoebe Bridgers", "Punisher", 277_000],
  ["Show Me How", "Men I Trust", "Oncle Jazz", 215_000],
].map(([title, artist, album, durationMs], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
  source: "netease",
  sourceTrackId: `source-${String(index + 1)}`,
  title,
  artist,
  album,
  durationMs,
  lyricStatus: "available",
}));

function health(netease: "available" | "unavailable") {
  return {
    service: "koradio",
    status: "ready",
    mode: "mock",
    providers: { codex: "available", netease, tts: "degraded" },
    checkedAt: "2026-07-19T08:00:00.000Z",
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

async function mockLibraryWorkspace(
  page: Page,
  options: { netease?: "available" | "unavailable"; searchFails?: boolean } = {},
): Promise<void> {
  let importReads = 0;
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({ json: health(options.netease ?? "available") }),
  );
  await page.route("**/api/v1/profiles", (route) => route.fulfill({ json: { items: [profile] } }));
  await page.route("**/api/v1/profiles/current", (route) =>
    route.fulfill({
      json: {
        current: {
          profile,
          preferences: {
            profileId,
            themeMode: "dark",
            djLanguage: "zh-CN",
            djVoiceStyle: "british-soft-radio",
            updatedAt: "2026-07-19T08:00:00.000Z",
          },
        },
      },
    }),
  );
  await page.route("**/api/v1/profiles/*/library?*", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    await route.fulfill({
      json:
        cursor === "next"
          ? {
              items: [
                {
                  track: tracks[1],
                  addedAt: "2026-07-19T08:01:00.000Z",
                  playlistSourceId: null,
                },
              ],
            }
          : {
              items: [
                {
                  track: tracks[0],
                  addedAt: "2026-07-19T08:00:00.000Z",
                  playlistSourceId: null,
                },
              ],
              nextCursor: "next",
            },
    });
  });
  await page.route("**/api/v1/profiles/*/music-searches", async (route) => {
    const body = route.request().postDataJSON() as { keyword: string };
    if (options.searchFails === true) {
      await route.fulfill({
        status: 503,
        json: {
          code: "MUSIC_PROVIDER_UNAVAILABLE",
          message: "Music provider is unavailable",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000099",
        },
      });
      return;
    }
    await route.fulfill({ json: { items: body.keyword === "missing" ? [] : tracks } });
  });
  await page.route("**/api/v1/profiles/*/library-items", async (route) => {
    expect(route.request().headers()).toHaveProperty("idempotency-key");
    const body = route.request().postDataJSON() as { trackId: string };
    await route.fulfill({
      status: 201,
      json: {
        track: tracks.find((track) => track.id === body.trackId) ?? tracks[0],
        addedAt: "2026-07-19T08:02:00.000Z",
        playlistSourceId: null,
      },
    });
  });
  await page.route("**/api/v1/profiles/*/tracks/*/audio-resolutions", (route) =>
    route.fulfill({
      json: {
        trackId: tracks[1]?.id,
        resolvedAudioRef: "https://media.example.invalid/library-preview.wav",
        expiresAt: "2026-07-19T09:00:00.000Z",
      },
    }),
  );
  await page.route("https://media.example.invalid/**", (route) =>
    route.fulfill({ body: wav(5_000), contentType: "audio/wav" }),
  );
  await page.route("**/api/v1/profiles/*/playlist-imports", async (route) => {
    expect(route.request().headers()).toHaveProperty("idempotency-key");
    await route.fulfill({
      status: 202,
      json: { jobId: "00000000-0000-4000-8000-000000000030" },
    });
  });
  await page.route("**/api/v1/profiles/*/playlist-imports/*", (route) => {
    importReads += 1;
    const succeeded = importReads > 1;
    return route.fulfill({
      json: {
        jobId: "00000000-0000-4000-8000-000000000030",
        profileId,
        status: succeeded ? "succeeded" : "running",
        playlistRef: "40112818",
        progress: succeeded
          ? { total: 3, processed: 3, imported: 2, unavailable: 1 }
          : { total: 3, processed: 1, imported: 1, unavailable: 0 },
        playlistSource: succeeded
          ? {
              id: "00000000-0000-4000-8000-000000000031",
              source: "netease",
              sourcePlaylistId: "40112818",
              title: "夜晚写作",
              importedAt: "2026-07-19T08:03:00.000Z",
              availableTrackCount: 2,
              unavailableTrackCount: 1,
            }
          : null,
        createdAt: "2026-07-19T08:02:00.000Z",
        updatedAt: "2026-07-19T08:03:00.000Z",
      },
    });
  });
}

test("searches, previews, adds, paginates and imports Library music", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "受控 Provider 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 960, height: 1600 });
  await mockLibraryWorkspace(page);
  await page.goto(`${appOrigin}/library`);

  await expect(page.getByRole("heading", { name: "音乐库", exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "搜索歌曲、歌手或专辑" });
  await page.keyboard.press("Meta+k");
  await expect(search).toBeFocused();
  await search.fill("Beach House");
  await search.press("Enter");
  await expect(page.getByText("Space Song", { exact: true })).toBeVisible();
  await expect(page.getByText("搜索结果 · 5")).toBeVisible();
  if (browserName === "chromium") {
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot("library-results-dark.png", {
      animations: "disabled",
      fullPage: false,
    });
  }

  const preview = page.getByRole("button", { name: "试听 Space Song" });
  await preview.click();
  await expect(page.getByRole("button", { name: "停止试听 Space Song" })).toBeVisible();
  await page.getByRole("button", { name: "停止试听 Space Song" }).click();
  await expect(preview).toBeVisible();

  await page.getByRole("button", { name: "加入候选池" }).nth(1).click();
  await expect(page.getByText("已加入本地音乐库")).toBeVisible();
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.getByRole("button", { name: "加载更多" }).click();
  await expect(page.getByText("Space Song", { exact: true })).toBeVisible();

  const playlist = page.getByRole("textbox", { name: "网易云歌单链接或 ID" });
  await playlist.fill("invalid");
  await page.getByRole("button", { name: "导入歌单" }).click();
  await expect(page.getByText("请输入有效的网易云歌单链接或 ID")).toBeVisible();
  await playlist.fill("40112818");
  await page.getByRole("button", { name: "导入歌单" }).click();
  await expect(page.getByText("已导入 2 首可用歌曲，1 首暂不可播放。")).toBeVisible();
});

test("keeps no-results recoverable without horizontal mobile overflow", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "受控 Provider 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLibraryWorkspace(page);
  await page.goto(`${appOrigin}/library`);
  const search = page.getByRole("searchbox", { name: "搜索歌曲、歌手或专辑" });
  await search.fill("missing");
  await search.press("Enter");
  await expect(page.getByText("没有找到相关歌曲")).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});

test("preserves search input when the provider fails", async ({ browserName, page }) => {
  test.skip(browserName === "webkit", "受控 Provider 路由由 Chromium 与 Firefox 验收");
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLibraryWorkspace(page, { searchFails: true });
  await page.goto(`${appOrigin}/library`);
  const retainedSearch = page.getByRole("searchbox", { name: "搜索歌曲、歌手或专辑" });
  await retainedSearch.fill("Beach House");
  await retainedSearch.press("Enter");
  await expect(page.getByText("网易云 API 暂不可用")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新搜索" })).toBeVisible();
  await expect(retainedSearch).toHaveValue("Beach House");
});
