import type { HealthResponse } from "@koradio/contracts";

export function createMockHealthSnapshot(now: Date = new Date()): HealthResponse {
  return {
    service: "koradio",
    status: "ready",
    mode: "mock",
    providers: {
      codex: "available",
      netease: "available",
      tts: "available",
    },
    checkedAt: now.toISOString(),
  };
}
