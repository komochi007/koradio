import type { DjScriptSegment, RadioTurn } from "@koradio/contracts";
import { describe, expect, it } from "vitest";

import { buildDialogueTimeline } from "../../apps/web/src/features/radio/dialogue-timeline.js";

const profileId = "00000000-0000-4000-8000-000000000001";

function turn(id: string, createdAt: string): RadioTurn {
  return {
    id,
    profileId,
    decision: "chat",
    userMessage: { id, profileId, role: "user", content: id, trackId: null, createdAt },
    assistantMessage: {
      id: `${id}-assistant`,
      profileId,
      role: "assistant",
      content: id,
      trackId: null,
      createdAt,
    },
    track: null,
    programJobId: null,
    createdAt,
  };
}

function script(id: string): DjScriptSegment {
  return {
    id,
    programId: "00000000-0000-4000-8000-000000000002",
    type: "intro",
    language: "zh-CN",
    text: id,
    displayText: id,
    estimatedTiming: false,
    ttsAudioRef: null,
  };
}

describe("buildDialogueTimeline", () => {
  it("keeps revealed DJ scripts between older and newer conversation turns", () => {
    const entries = buildDialogueTimeline(
      [turn("older", "2026-08-12T07:00:00.000Z"), turn("newer", "2026-08-12T07:02:00.000Z")],
      [{ script: script("script"), occurredAt: "2026-08-12T07:01:00.000Z" }],
    );

    expect(
      entries.map((entry) => (entry.kind === "turn" ? entry.turn.id : entry.script.id)),
    ).toEqual(["older", "script", "newer"]);
  });
});
