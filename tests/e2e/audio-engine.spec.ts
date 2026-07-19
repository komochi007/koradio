import { expect, test, type BrowserContext } from "@playwright/test";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;
const profileId = "00000000-0000-4000-8000-000000000210";
const programId = "00000000-0000-4000-8000-000000000270";

const profile = {
  id: profileId,
  radioName: "Lease Radio",
  nickname: "Lease",
  avatarRef: null,
  frequentGenres: ["Ambient"],
  defaultScenario: "双标签测试",
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
};

const program = {
  program: {
    id: programId,
    profileId,
    scenarioText: "双标签测试",
    title: "One Owner Only",
    status: "ready",
    trackIds: ["00000000-0000-4000-8000-000000000271", "00000000-0000-4000-8000-000000000272"],
    createdAt: "2026-07-19T08:00:00.000Z",
  },
  djScripts: [
    {
      id: "00000000-0000-4000-8000-000000000280",
      programId,
      type: "intro",
      language: "zh-CN",
      text: "一次只由一个标签页播放。",
      displayText: "一次只由一个标签页播放。",
      estimatedTiming: true,
      ttsAudioRef: null,
    },
  ],
  tracks: [
    {
      id: "00000000-0000-4000-8000-000000000271",
      source: "netease",
      sourceTrackId: "lease-one",
      title: "First Lease",
      artist: "Koradio",
      album: "S4",
      durationMs: 20_000,
      lyricStatus: "unavailable",
    },
    {
      id: "00000000-0000-4000-8000-000000000272",
      source: "netease",
      sourceTrackId: "lease-two",
      title: "Second Lease",
      artist: "Koradio",
      album: "S4",
      durationMs: 20_000,
      lyricStatus: "unavailable",
    },
  ],
  timeline: [
    {
      id: "00000000-0000-4000-8000-000000000273",
      kind: "track",
      position: 0,
      trackId: "00000000-0000-4000-8000-000000000271",
      resolvedAudioRef: "https://media.example.test/lease-one.wav",
      durationMs: 20_000,
    },
    {
      id: "00000000-0000-4000-8000-000000000274",
      kind: "track",
      position: 1,
      trackId: "00000000-0000-4000-8000-000000000272",
      resolvedAudioRef: "https://media.example.test/lease-two.wav",
      durationMs: 20_000,
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

async function mockPlayback(context: BrowserContext, checkpoints: unknown[]): Promise<void> {
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
            themeMode: "dark",
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
  await context.route(/\/api\/v1\/profiles\/[^/]+\/playback$/, (route) =>
    route.fulfill({
      status: 404,
      json: {
        code: "PLAYBACK_SNAPSHOT_NOT_FOUND",
        message: "Playback snapshot was not found",
        retryable: false,
        correlationId: "00000000-0000-4000-8000-000000000299",
      },
    }),
  );
  await context.route(/\/api\/v1\/profiles\/[^/]+\/playback\/checkpoints$/, async (route) => {
    const body: unknown = route.request().postDataJSON();
    checkpoints.push(body);
    const command = body as {
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
        savedAt: new Date().toISOString(),
      },
    });
  });
  await context.route("https://media.example.test/**", (route) =>
    route.fulfill({
      body: wav(20_000),
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
    }),
  );
}

test("two tabs hand off only after the original owner checkpoints and stops", async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const checkpoints: unknown[] = [];
  await mockPlayback(context, checkpoints);
  const first = await context.newPage();
  const second = await context.newPage();

  await first.goto(`${appOrigin}/radio`);
  await expect(first.getByRole("heading", { name: "First Lease" })).toBeVisible();
  await second.goto(`${appOrigin}/radio`);
  await expect(second.getByRole("heading", { name: "First Lease" })).toBeVisible();

  await expect(first.getByRole("button", { name: "播放", exact: true })).toBeEnabled();
  await expect(second.getByRole("button", { name: "接管并播放" })).toBeEnabled();
  const initialOwner = await first.evaluate(() => {
    const lease = window.localStorage.getItem("koradio.playback.lease.v1");
    return lease === null ? null : (JSON.parse(lease) as { ownerId: string }).ownerId;
  });
  await first.getByRole("button", { name: "播放", exact: true }).click();
  await expect(first.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();

  await second.getByRole("button", { name: "接管并播放" }).click();
  await expect(first.getByRole("button", { name: "接管并播放" })).toBeEnabled();
  await second.evaluate(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "koradio.playback.takeover.v1",
        newValue: null,
      }),
    );
  });
  await expect
    .poll(
      () =>
        second.evaluate((previousOwner) => {
          const lease = window.localStorage.getItem("koradio.playback.lease.v1");
          return (
            lease !== null && (JSON.parse(lease) as { ownerId: string }).ownerId !== previousOwner
          );
        }, initialOwner),
      { timeout: 7_000 },
    )
    .toBe(true);
  const newOwnerControl = second.getByRole("button", { name: /^(?:播放|暂停)$/ });
  await expect(newOwnerControl).toBeEnabled({ timeout: 7_000 });
  if ((await newOwnerControl.getAttribute("aria-label")) === "播放") {
    await newOwnerControl.click();
  }
  await expect(second.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
  await second.getByRole("button", { name: "暂停", exact: true }).click();

  await expect.poll(() => checkpoints.length).toBeGreaterThanOrEqual(2);
  const epochs = checkpoints.map((checkpoint) => (checkpoint as { leaseEpoch: number }).leaseEpoch);
  expect(epochs.at(-1)).toBeGreaterThan(epochs[0] ?? 0);
  await context.close();
});
