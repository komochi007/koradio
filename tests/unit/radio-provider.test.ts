import { describe, expect, it } from "vitest";

import { createMockRadioAssistantProvider } from "../../apps/server/src/modules/radio/providers.js";

describe("UX-11 mock Radio intent routing", () => {
  const provider = createMockRadioAssistantProvider();
  const respond = (content: string) =>
    provider.respond(
      { content, recentMessages: [] },
      { correlationId: "00000000-0000-4000-8000-000000000001" },
    );

  it("keeps one-song requests separate from multi-song programs", async () => {
    await expect(respond("推荐一首歌")).resolves.toMatchObject({
      decision: "single_track",
      musicQuery: "Space Song Beach House",
    });
    await expect(respond("推荐八首歌做成节目")).resolves.toMatchObject({ decision: "program" });
    await expect(respond("来点音乐")).resolves.toMatchObject({ decision: "clarify" });
    await expect(respond("今天有点累")).resolves.toMatchObject({ decision: "chat" });
  });
});
