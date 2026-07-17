import { describe, expect, it } from "vitest";

import { resolveAppRoute } from "../../apps/web/src/app/router.js";
import { createEventSequenceGuard } from "../../apps/web/src/shared/event-sequence.js";

const baseEvent = {
  eventId: "00000000-0000-4000-8000-000000000001",
  eventType: "service.health.changed" as const,
  version: 1 as const,
  correlationId: "00000000-0000-4000-8000-000000000002",
  occurredAt: "2026-07-17T08:00:00.000Z",
  payload: {
    service: "koradio" as const,
    status: "ready" as const,
    mode: "mock" as const,
    providers: {
      codex: "available" as const,
      netease: "available" as const,
      tts: "available" as const,
    },
    checkedAt: "2026-07-17T08:00:00.000Z",
  },
};

describe("web app shell foundations", () => {
  it("normalizes root and unknown paths to Radio", () => {
    expect(resolveAppRoute("/").id).toBe("radio");
    expect(resolveAppRoute("/unknown").path).toBe("/radio");
    expect(resolveAppRoute("/settings").id).toBe("settings");
  });

  it("drops duplicate and out-of-order events per correlation", () => {
    const guard = createEventSequenceGuard();

    expect(guard.accept({ ...baseEvent, sequence: 2 })).toBe(true);
    expect(guard.accept({ ...baseEvent, sequence: 2 })).toBe(false);
    expect(guard.accept({ ...baseEvent, sequence: 1 })).toBe(false);
    expect(guard.accept({ ...baseEvent, sequence: 3 })).toBe(true);

    guard.reset();
    expect(guard.accept({ ...baseEvent, sequence: 1 })).toBe(true);
  });
});
