import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import type { ProgramDetail } from "@koradio/contracts";

import {
  s6DegradedProgram,
  s6EventJobId,
  s6GenerationFailureCases,
  s6OldProgram,
  s6Profile,
} from "../fixtures/s6-failure-matrix.js";

const appOrigin = `http://127.0.0.1:${process.env.KORADIO_E2E_PORT ?? "49373"}`;

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

function emptyTaste() {
  return {
    projection: {
      profileId: s6Profile.id,
      tags: [],
      affinities: [],
      avoidSignals: [],
      sourceVersion: 0,
      updatedAt: "2026-07-20T12:00:00.000Z",
    },
    overrides: {
      profileId: s6Profile.id,
      tags: [],
      avoidRules: [],
      sceneRules: [],
      updatedAt: "2026-07-20T12:00:00.000Z",
    },
    effective: {
      profileId: s6Profile.id,
      projectionVersion: 0,
      overrideVersion: 0,
      resolvedTaste: {
        tags: [],
        affinities: [],
        avoidRules: [],
        sceneRules: [],
      },
    },
  };
}

async function mockProgram(
  page: Page,
  options: {
    media: "all-fail" | "first-fails" | "working";
    program: ProgramDetail;
  },
): Promise<unknown[]> {
  const checkpoints: unknown[] = [];
  await page.route(/\/api\/v1\/profiles$/, (route) =>
    route.fulfill({ json: { items: [s6Profile] } }),
  );
  await page.route(/\/api\/v1\/profiles\/current$/, (route) =>
    route.fulfill({
      json: {
        current: {
          profile: s6Profile,
          preferences: {
            profileId: s6Profile.id,
            themeMode: "dark",
            djLanguage: "zh-CN",
            djVoiceStyle: "british-soft-radio",
            updatedAt: "2026-07-20T12:00:00.000Z",
          },
        },
      },
    }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/programs\?limit=1$/, (route) =>
    route.fulfill({ json: { items: [options.program.program] } }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/programs\/[^/?]+$/, (route) =>
    route.fulfill({ json: options.program }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/playback$/, (route) =>
    route.fulfill({
      status: 404,
      json: {
        code: "PLAYBACK_SNAPSHOT_NOT_FOUND",
        message: "Playback snapshot was not found",
        retryable: false,
        correlationId: "60000000-0000-4000-8000-000000000090",
      },
    }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/playback\/checkpoints$/, async (route) => {
    const command = route.request().postDataJSON() as {
      leaseEpoch: number;
      positionMs: number;
      profileId: string;
      programId: string;
      status: string;
      timelineItemId: string;
      volume: number;
    };
    checkpoints.push(command);
    await route.fulfill({
      json: {
        ...command,
        savedAt: "2026-07-20T12:00:00.000Z",
      },
    });
  });
  await page.route(/\/api\/v1\/profiles\/[^/]+\/taste$/, (route) =>
    route.fulfill({ json: emptyTaste() }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/tracks\/[^/]+\/lyrics$/, (route) =>
    route.fulfill({
      status: 404,
      json: {
        code: "LYRICS_UNAVAILABLE",
        message: "Lyrics are unavailable",
        retryable: false,
        correlationId: "60000000-0000-4000-8000-000000000091",
      },
    }),
  );
  await page.route("https://media.example.invalid/**", async (route) => {
    const firstTrack = route.request().url().endsWith("s6-first.wav");
    if (options.media === "all-fail" || (options.media === "first-fails" && firstTrack)) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      body: wav(30_000),
      contentType: "audio/wav",
      headers: { "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
    });
  });
  return checkpoints;
}

async function openRadio(page: Page): Promise<void> {
  await page.goto(`${appOrigin}/radio`);
  await expect(page.getByRole("heading", { name: "Radio", exact: true })).toBeFocused();
}

test("invalid Codex output and exhausted search keep the old Program and Audio state", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "WebKit cannot stably route the controlled S6 API matrix");
  test.setTimeout(45_000);
  await mockProgram(page, { media: "working", program: s6OldProgram });
  let accepted = 0;
  await page.route(/\/api\/v1\/profiles\/[^/]+\/program-generations$/, async (route) => {
    const failure = s6GenerationFailureCases[accepted];
    accepted += 1;
    if (failure === undefined) throw new Error("Unexpected S6 generation request");
    await route.fulfill({ status: 202, json: { jobId: failure.jobId } });
  });
  await page.route(/\/api\/v1\/profiles\/[^/]+\/program-generations\/[^/?]+$/, async (route) => {
    const jobId = new URL(route.request().url()).pathname.split("/").at(-1);
    if (jobId === undefined) throw new Error("S6 generation job id is missing");
    const failure = s6GenerationFailureCases.find((candidate) => candidate.jobId === jobId);
    if (failure === undefined) throw new Error(`Unexpected S6 generation job: ${jobId}`);
    await route.fulfill({
      json: {
        jobId: failure.jobId,
        profileId: s6Profile.id,
        status: "failed",
        stage: failure.code.includes("PLAN") ? "planning" : "resolving_tracks",
        sequence: 3,
        errorCode: failure.code,
        createdAt: "2026-07-20T12:00:00.000Z",
        updatedAt: "2026-07-20T12:00:01.000Z",
      },
    });
  });
  await openRadio(page);
  await expect(page.getByRole("heading", { name: "First Safe Track" })).toBeVisible();
  await expect(page.getByText("这段已提交的节目不会被失败任务覆盖。")).toBeVisible();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();

  for (const failure of s6GenerationFailureCases) {
    const scene = page.getByRole("textbox", { name: "告诉 DJ 当前场景" });
    await scene.fill(failure.scenarioText);
    await page.getByRole("button", { name: "发送给 DJ" }).click();
    await expect(page.getByRole("alert").getByText(failure.title)).toBeVisible();
    await expect(scene).toHaveValue(failure.scenarioText);
    await expect(page.getByRole("heading", { name: "First Safe Track" })).toBeVisible();
    await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
  }
});

test("TTS and lyrics degradation keep a text-only Program playable", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "WebKit cannot stably route the controlled S6 API matrix");
  await mockProgram(page, { media: "working", program: s6DegradedProgram });
  await openRadio(page);
  await expect(page.getByText("语音不可用时，这段文字仍然保留。")).toBeVisible();
  await expect(page.getByText("JUST NOW · TEXT SESSION")).toBeVisible();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "打开当前节目详情" }).click();
  const detail = page.getByRole("dialog", { name: "Text Still On Air" });
  await expect(detail).toBeVisible();
  await expect(page.getByText("暂无歌词，正在播放 DJ 推荐曲目")).toBeVisible();
  await expect(detail.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
});

test("a failed track advances while an exhausted queue reaches a stable failed state", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "WebKit cannot stably route the controlled S6 media matrix");
  const checkpoints = await mockProgram(page, { media: "first-fails", program: s6OldProgram });
  await openRadio(page);
  await expect(page.getByRole("heading", { name: "Second Safe Track" })).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(() =>
      checkpoints.some(
        (checkpoint) =>
          (checkpoint as { status: string; timelineItemId: string }).status === "failed" &&
          (checkpoint as { status: string; timelineItemId: string }).timelineItemId ===
            s6OldProgram.timeline[0]?.id,
      ),
    )
    .toBe(true);

  await page.unroute("https://media.example.invalid/**");
  await page.route("https://media.example.invalid/**", (route) => route.abort("failed"));
  await page.reload();
  const takeover = page.getByRole("button", { name: "接管并播放" });
  if (browserName === "firefox") {
    await expect(takeover).toBeVisible();
    await takeover.click();
  }
  await expect(page.getByText("当前队列无法继续播放，请重新生成节目")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("heading", { name: "Second Safe Track" })).toBeVisible();
  await expect(page.getByText("这段已提交的节目不会被失败任务覆盖。")).toBeVisible();
  await expect
    .poll(
      () =>
        new Set(
          checkpoints
            .filter((checkpoint) => (checkpoint as { status: string }).status === "failed")
            .map((checkpoint) => (checkpoint as { timelineItemId: string }).timelineItemId),
        ).size,
    )
    .toBe(s6OldProgram.timeline.length);
});

test("feedback failure rolls back UI without stopping the active Program", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "WebKit cannot stably route the controlled S6 API matrix");
  await mockProgram(page, { media: "working", program: s6OldProgram });
  let failedWrites = 0;
  await page.route(/\/api\/v1\/profiles\/[^/]+\/feedback-events$/, async (route) => {
    failedWrites += 1;
    await route.fulfill({
      status: 500,
      json: {
        code: "FEEDBACK_WRITE_FAILED",
        message: "Feedback could not be saved",
        retryable: true,
        correlationId: "60000000-0000-4000-8000-000000000092",
      },
    });
  });
  await openRadio(page);
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("button", { name: "喜欢当前歌曲" }).click();
  await expect(page.getByRole("button", { name: "取消喜欢当前歌曲" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("反馈保存失败，已恢复原状态")).toBeVisible({ timeout: 4_000 });
  await expect(page.getByRole("button", { name: "喜欢当前歌曲" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeEnabled();
  expect(failedWrites).toBe(1);
});

test("out-of-order events stay fenced across reconnect until a newer commit arrives", async ({
  browserName,
  page,
}) => {
  test.skip(browserName === "webkit", "WebKit cannot stably route the controlled S6 event matrix");
  test.setTimeout(45_000);
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/api\/v1\/events$/, (socket) => {
    const connectionSequence = sockets.length + 1;
    sockets.push(socket);
    socket.onMessage(() => {
      socket.send(
        JSON.stringify({
          eventId: `60000000-0000-4000-8000-${String(100 + connectionSequence).padStart(12, "0")}`,
          eventType: "service.health.changed",
          version: 1,
          correlationId: "60000000-0000-4000-8000-000000000100",
          sequence: connectionSequence,
          occurredAt: "2026-07-20T12:00:00.000Z",
          payload: {
            service: "koradio",
            status: "ready",
            mode: "mock",
            providers: { codex: "available", netease: "available", tts: "degraded" },
            checkedAt: "2026-07-20T12:00:00.000Z",
          },
        }),
      );
    });
  });
  await mockProgram(page, { media: "working", program: s6OldProgram });
  await page.route(/\/api\/v1\/profiles\/[^/]+\/program-generations$/, (route) =>
    route.fulfill({ status: 202, json: { jobId: s6EventJobId } }),
  );
  await page.route(/\/api\/v1\/profiles\/[^/]+\/program-generations\/[^/?]+$/, (route) =>
    route.fulfill({
      json: {
        jobId: s6EventJobId,
        profileId: s6Profile.id,
        status: "running",
        stage: "planning",
        sequence: 1,
        createdAt: "2026-07-20T12:00:00.000Z",
        updatedAt: "2026-07-20T12:00:01.000Z",
      },
    }),
  );
  await openRadio(page);
  await expect.poll(() => sockets.length).toBe(1);
  await page.getByRole("textbox", { name: "告诉 DJ 当前场景" }).fill("事件恢复必须保持旧节目");
  const snapshotRequest = page.waitForRequest((request) =>
    request.url().includes(`/program-generations/${s6EventJobId}`),
  );
  await page.getByRole("button", { name: "发送给 DJ" }).click();
  await snapshotRequest;
  await expect(page.getByRole("heading", { name: "TUNING YOUR STATION..." })).toBeVisible();

  const tracksResolved = {
    eventId: "60000000-0000-4000-8000-000000000103",
    eventType: "generation.tracks-resolved",
    version: 1,
    profileId: s6Profile.id,
    correlationId: s6EventJobId,
    sequence: 3,
    occurredAt: "2026-07-20T12:00:03.000Z",
    payload: { jobId: s6EventJobId, trackCount: 1 },
  };
  sockets[0]?.send(JSON.stringify(tracksResolved));
  await expect(page.getByText("Searching for tracks that fit the room.")).toBeVisible();
  sockets[0]?.send(
    JSON.stringify({
      eventId: "60000000-0000-4000-8000-000000000102",
      eventType: "generation.planned",
      version: 1,
      profileId: s6Profile.id,
      correlationId: s6EventJobId,
      sequence: 2,
      occurredAt: "2026-07-20T12:00:02.000Z",
      payload: { jobId: s6EventJobId },
    }),
  );
  await expect(page.getByText("Searching for tracks that fit the room.")).toBeVisible();

  await sockets[0]?.close({ code: 1012, reason: "S6 reconnect injection" });
  await expect(page.getByText("EVENTS RECONNECTING · SNAPSHOT ACTIVE")).toBeVisible();
  await expect.poll(() => sockets.length, { timeout: 5_000 }).toBe(2);
  await expect(page.getByText("EVENTS RECONNECTING · SNAPSHOT ACTIVE")).toBeHidden();
  sockets[1]?.send(JSON.stringify(tracksResolved));
  await expect(page.getByText("Searching for tracks that fit the room.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Text Still On Air" })).toBeHidden();

  sockets[1]?.send(
    JSON.stringify({
      eventId: "60000000-0000-4000-8000-000000000104",
      eventType: "program.committed",
      version: 1,
      profileId: s6Profile.id,
      correlationId: s6EventJobId,
      sequence: 4,
      occurredAt: "2026-07-20T12:00:04.000Z",
      payload: s6DegradedProgram,
    }),
  );
  await expect(page.getByRole("heading", { name: "Text Still On Air" })).toBeVisible();
});
