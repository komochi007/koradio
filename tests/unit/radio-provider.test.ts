import { describe, expect, it } from "vitest";

import { createMockRadioAssistantProvider } from "../../apps/server/src/modules/radio/providers.js";
import {
  createRadioService,
  isAnchorProgramRequest,
  parseAnchorTrack,
  parseProgramListeningIntent,
} from "../../apps/server/src/modules/radio/service.js";

describe("UX-11 mock Radio intent routing", () => {
  const provider = createMockRadioAssistantProvider();
  const respond = (content: string) =>
    provider.respond(
      { content, currentProgram: null, recentMessages: [] },
      { correlationId: "00000000-0000-4000-8000-000000000001" },
    );

  it("keeps one-song requests, five-track recommendations, and multi-song programs separate", async () => {
    await expect(respond("推荐一首歌")).resolves.toMatchObject({
      decision: "single_track",
      musicQuery: "Space Song Beach House",
    });
    await expect(respond("推荐八首歌做成节目")).resolves.toMatchObject({ decision: "program" });
    await expect(respond("推荐5首keshi的歌")).resolves.toMatchObject({
      decision: "recommendations",
    });
    await expect(respond("来点音乐")).resolves.toMatchObject({ decision: "clarify" });
    await expect(respond("今天有点累")).resolves.toMatchObject({ decision: "chat" });
  });

  it("extracts an anchor song and keeps Chinese vocal requests explicit", () => {
    expect(isAnchorProgramRequest("围绕《半句再见》规划一档华语相似歌单")).toBe(true);
    expect(parseAnchorTrack("围绕《半句再见》规划一档华语相似歌单")).toEqual({
      title: "半句再见",
      artist: null,
    });
    expect(parseAnchorTrack("围绕华语歌曲规划一档歌单")).toBeNull();
    expect(
      parseProgramListeningIntent("围绕《半句再见》规划一档华语相似歌单，重点关注旋律和音色"),
    ).toEqual({
      anchorTrack: { title: "半句再见", artist: null },
      similarityDimensions: ["melody", "timbre"],
      languageConstraint: "chinese-vocal",
    });
  });

  it("starts an anchor program without waiting for a second routing call", async () => {
    let capturedCommand: unknown;
    const service = createRadioService({
      assistant: {
        respond() {
          throw new Error("deterministic program requests must not call the assistant");
        },
      },
      currentProgram: { current: () => null },
      library: {
        resolveAudio: () => Promise.reject(new Error("not used")),
        search: () => Promise.reject(new Error("not used")),
      },
      now: () => new Date("2026-08-19T10:00:00.000Z"),
      programs: {
        start: (_profileId, command) => {
          capturedCommand = command;
          return { jobId: "10000000-0000-4000-8000-000000000002" } as never;
        },
      },
      randomId: () => "10000000-0000-4000-8000-000000000001",
      repository: {
        clear() {},
        findById() {
          return null;
        },
        findByIdempotency() {
          return null;
        },
        insert() {},
        list() {
          return [];
        },
      },
    });

    const turn = await service.create(
      "20000000-0000-4000-8000-000000000001",
      { content: "围绕《Space Song》规划一档相似歌单" },
      "anchor-program-001",
    );

    expect(turn.decision).toBe("program");
    expect(capturedCommand).toEqual({
      scenarioText: "围绕《Space Song》规划一档相似歌单",
      listeningIntent: {
        anchorTrack: { title: "Space Song", artist: null },
        similarityDimensions: ["melody", "arrangement", "timbre", "emotion", "rhythm", "era"],
        languageConstraint: "any",
      },
    });
  });
});
