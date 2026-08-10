import {
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

const origin = "http://127.0.0.1:49373";
const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("UX-11 Radio conversation", () => {
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
      "clarify",
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
