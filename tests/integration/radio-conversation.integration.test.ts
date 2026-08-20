import {
  activeProgramGenerationResponseSchema,
  jobAcceptedResponseSchema,
  profileSchema,
  programDetailSchema,
  programGenerationSnapshotSchema,
  radioConversationSchema,
  radioSpeechGenerationSchema,
  radioTurnSchema,
  sessionBootstrapResponseSchema,
} from "@koradio/contracts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import type { RadioAssistantProvider } from "../../apps/server/src/modules/radio/index.js";
import type { MusicProvider, ProviderTrack } from "../../apps/server/src/modules/library/index.js";

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("UX-11 Radio conversation", () => {
  it("keeps DJ recommendation cards on the original studio recording", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-radio-original-version-"));
    const dataRoot = join(parent, "data");
    const tracks: ProviderTrack[] = [
      {
        source: "netease",
        sourceTrackId: "cover",
        title: "Space Song (Cover)",
        artist: "Cover Singer",
        album: "Beach House Tribute",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "untimed",
        playable: true,
      },
      {
        source: "netease",
        sourceTrackId: "sped-up",
        title: "Space Song (Sped Up)",
        artist: "Beach House",
        album: "Single",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "untimed",
        playable: true,
      },
      {
        source: "netease",
        sourceTrackId: "original",
        title: "Space Song",
        artist: "Beach House",
        album: "Depression Cherry",
        artworkUrl: null,
        durationMs: 180_000,
        lyricStatus: "untimed",
        playable: true,
      },
    ];
    const music: MusicProvider = {
      source: "netease",
      search() {
        return Promise.resolve({ items: tracks });
      },
      importPlaylist() {
        return Promise.resolve({
          source: "netease",
          sourcePlaylistId: "fixture",
          title: "Fixture",
          tracks,
        });
      },
      getLyrics() {
        return Promise.resolve({ status: "unavailable" as const, content: null });
      },
      resolveAudio(sourceTrackId) {
        return Promise.resolve({
          resolvedAudioRef: `https://media.example.test/${sourceTrackId}.mp3`,
          expiresAt: "2099-01-01T00:00:00.000Z",
        });
      },
    };
    const app = await createApp({
      config: {
        environment: "test",
        host: "127.0.0.1",
        port: 49373,
        webPort: 5173,
        providerMode: "mock",
        strictPort: true,
        dataRoot,
        initialDataRoot: dataRoot,
        dataRootBootstrapPath: join(parent, "bootstrap.json"),
        webRoot: "unused-in-test",
      },
      musicProvider: music,
      radioAssistantProvider: {
        respond() {
          return Promise.resolve({
            decision: "single_track",
            reply: "这首保留原来的录音室版本。",
            musicQuery: "Space Song Beach House",
            musicQueries: [],
          });
        },
      },
      selectedPort: 49373,
    });
    openApps.push(app);
    const session = sessionBootstrapResponseSchema.parse(
      (
        await app.inject({ method: "POST", url: "/api/v1/session/bootstrap", headers: { origin } })
      ).json<unknown>(),
    );
    const headers = { authorization: `Bearer ${session.accessToken}`, origin };
    const profile = profileSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/profiles",
          headers: { ...headers, "idempotency-key": "original-version-profile" },
          payload: { radioName: "Night Signals", nickname: "Klein" },
        })
      ).json<unknown>(),
    );
    const turn = radioTurnSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/profiles/${profile.id}/radio-turns`,
          headers: { ...headers, "idempotency-key": "original-version-turn" },
          payload: { content: "推荐一首歌" },
        })
      ).json<unknown>(),
    );
    expect(turn.track).toMatchObject({ title: "Space Song", artist: "Beach House" });
  });

  it("persists chat, returns a single-track card and starts programs only for explicit program intent", async () => {
    const parent = await mkdtemp(join(tmpdir(), "koradio-radio-conversation-"));
    const dataRoot = join(parent, "data");
    const config: RuntimeConfig = {
      environment: "test",
      host: "127.0.0.1",
      port: 49373,
      webPort: 5173,
      providerMode: "mock",
      strictPort: true,
      dataRoot,
      initialDataRoot: dataRoot,
      dataRootBootstrapPath: join(parent, "bootstrap.json"),
      webRoot: "unused-in-test",
    };
    const assistant: RadioAssistantProvider = {
      respond(context) {
        const content = (context as { content: string }).content;
        if (content.includes("其他类似")) {
          return Promise.resolve({
            decision: "recommendations",
            reply: "有，我再补几首相近气质的歌。",
            musicQuery: null,
            musicQueries: ["Space Song Beach House", "Midnight City M83", "Space Song Beach House"],
          });
        }
        if (content.includes("推荐5首")) {
          return Promise.resolve({
            decision: "recommendations",
            reply: "我挑了五首，先从最贴近此刻的一首开始。",
            musicQuery: null,
            musicQueries: [
              "Midnight City M83",
              ...Array.from({ length: 4 }, () => "Space Song Beach House"),
            ],
          });
        }
        if (content.includes("一首")) {
          return Promise.resolve({
            decision: "single_track",
            reply: "先听这一首。",
            musicQuery: "Space Song Beach House",
          });
        }
        if (content.includes("节目")) {
          return Promise.resolve({
            decision: "program",
            reply: "我来做一档完整节目。",
            musicQuery: null,
          });
        }
        return Promise.resolve({
          decision: "chat",
          reply: "我在，继续说吧。",
          musicQuery: null,
        });
      },
    };
    const app = await createApp({ config, radioAssistantProvider: assistant, selectedPort: 49373 });
    openApps.push(app);
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/v1/session/bootstrap",
      headers: { origin },
    });
    const session = sessionBootstrapResponseSchema.parse(sessionResponse.json<unknown>());
    const headers = { authorization: `Bearer ${session.accessToken}`, origin };
    const profileResponse = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      headers: { ...headers, "idempotency-key": "radio-profile" },
      payload: { radioName: "Night Signals", nickname: "Klein" },
    });
    const profile = profileSchema.parse(profileResponse.json<unknown>());

    const noActiveGeneration = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/program-generations/active`,
      headers,
    });
    expect(noActiveGeneration.statusCode).toBe(200);
    expect(activeProgramGenerationResponseSchema.parse(noActiveGeneration.json<unknown>())).toEqual(
      {
        active: null,
      },
    );

    const send = (content: string, key: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/profiles/${profile.id}/radio-turns`,
        headers: { ...headers, "idempotency-key": key },
        payload: { content },
      });
    const chat = radioTurnSchema.parse((await send("今天有点累", "chat-1")).json<unknown>());
    expect(chat.decision).toBe("chat");
    expect(chat.programJobId).toBeNull();
    expect(chat.track).toBeNull();

    const single = radioTurnSchema.parse((await send("推荐一首歌", "single-1")).json<unknown>());
    expect(single.decision).toBe("single_track");
    expect(single.track?.title).toBe("Space Song");
    expect(single.programJobId).toBeNull();

    const recommendationsResponse = await send("推荐5首Beach House的歌", "recommendations-1");
    expect(recommendationsResponse.statusCode).toBe(201);
    const recommendations = radioTurnSchema.parse(recommendationsResponse.json<unknown>());
    expect(recommendations.decision).toBe("recommendations");
    expect(recommendations.recommendedTracks).toHaveLength(1);
    expect(recommendations.recommendedTracks?.[0]?.artist).toBe("Beach House");
    expect(recommendations.programJobId).toBeNull();

    const invalidCount = radioTurnSchema.parse(
      (await send("做一档 5 首歌的节目", "program-invalid-count")).json<unknown>(),
    );
    expect(invalidCount.decision).toBe("clarify");
    expect(invalidCount.programJobId).toBeNull();

    const program = radioTurnSchema.parse(
      (await send("做一档 10 首歌的写作节目", "program-1")).json<unknown>(),
    );
    expect(program.decision).toBe("program");
    expect(program.programJobId).not.toBeNull();

    let generation = programGenerationSnapshotSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/profiles/${profile.id}/program-generations/${program.programJobId ?? ""}`,
          headers,
        })
      ).json<unknown>(),
    );
    for (let attempt = 0; attempt < 100 && generation.status !== "succeeded"; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      generation = programGenerationSnapshotSchema.parse(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/profiles/${profile.id}/program-generations/${program.programJobId ?? ""}`,
            headers,
          })
        ).json<unknown>(),
      );
    }
    expect(generation).toMatchObject({ status: "succeeded" });
    const detail = programDetailSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/profiles/${profile.id}/programs/${generation.programId ?? ""}`,
          headers,
        })
      ).json<unknown>(),
    );
    expect(detail.tracks).toHaveLength(10);

    const similar = radioTurnSchema.parse(
      (await send("有没有其他类似的歌曲推荐", "recommendations-follow-up")).json<unknown>(),
    );
    expect(similar.decision).toBe("recommendations");
    expect(similar.recommendedTracks).toHaveLength(2);
    expect(similar.programJobId).toBeNull();

    const naturalProgram = radioTurnSchema.parse(
      (
        await send("前几天刚过立秋，有没有什么适合秋日晴天听的音乐", "program-natural-scene")
      ).json<unknown>(),
    );
    expect(naturalProgram.decision).toBe("program");
    expect(naturalProgram.assistantMessage.content).not.toContain("收到，我会围绕");
    expect(naturalProgram.assistantMessage.content).toContain("秋日");
    expect(naturalProgram.programJobId).not.toBeNull();

    const scenarioProgram = radioTurnSchema.parse(
      (await send("今晚写作，保持安静但不要沉闷", "program-scenario-only")).json<unknown>(),
    );
    expect(scenarioProgram.decision).toBe("program");
    expect(scenarioProgram.programJobId).not.toBeNull();

    const speechAccepted = jobAcceptedResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/profiles/${profile.id}/radio-messages/${chat.assistantMessage.id}/speech-generations`,
          headers: { ...headers, "idempotency-key": "speech-chat-1" },
        })
      ).json<unknown>(),
    );
    let speech = radioSpeechGenerationSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/profiles/${profile.id}/radio-speech-generations/${speechAccepted.jobId}`,
          headers,
        })
      ).json<unknown>(),
    );
    for (let attempt = 0; attempt < 20 && speech.status !== "succeeded"; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      speech = radioSpeechGenerationSchema.parse(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/profiles/${profile.id}/radio-speech-generations/${speechAccepted.jobId}`,
            headers,
          })
        ).json<unknown>(),
      );
    }
    expect(speech).toMatchObject({ status: "succeeded", messageId: chat.assistantMessage.id });
    expect(speech.audioRef).toMatch(/^tts\//u);

    const conversationResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${profile.id}/radio-conversation`,
      headers,
    });
    const conversation = radioConversationSchema.parse(conversationResponse.json<unknown>());
    expect(conversation.turns.map((turn) => turn.decision)).toEqual([
      "chat",
      "single_track",
      "recommendations",
      "clarify",
      "program",
      "recommendations",
      "program",
      "program",
    ]);
    expect(conversation.turns[1]?.track?.title).toBe("Space Song");

    const cleared = await app.inject({
      method: "DELETE",
      url: `/api/v1/profiles/${profile.id}/radio-conversation`,
      headers,
      payload: { confirmed: true },
    });
    expect(cleared.statusCode).toBe(204);
    const empty = radioConversationSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/profiles/${profile.id}/radio-conversation`,
          headers,
        })
      ).json<unknown>(),
    );
    expect(empty.turns).toEqual([]);
  });
});
