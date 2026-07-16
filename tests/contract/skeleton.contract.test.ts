import {
  healthResponseSchema,
  serviceHealthChangedEventSchema,
  sessionAuthenticateSchema,
  sessionBootstrapResponseSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

const health = {
  service: "koradio",
  status: "ready",
  mode: "mock",
  providers: {
    codex: "available",
    netease: "available",
    tts: "available",
  },
  checkedAt: "2026-07-16T08:00:00.000Z",
} as const;

describe("S1 skeleton contracts", () => {
  it("accepts the mock health snapshot", () => {
    expect(healthResponseSchema.parse(health)).toEqual(health);
  });

  it("rejects unrecognized provider states", () => {
    expect(() =>
      healthResponseSchema.parse({
        ...health,
        providers: { ...health.providers, netease: "unknown" },
      }),
    ).toThrow();
  });

  it("accepts an in-memory session bootstrap and authenticate command", () => {
    const accessToken = "a".repeat(48);

    expect(
      sessionBootstrapResponseSchema.parse({
        accessToken,
        expiresAt: "2026-07-16T08:05:00.000Z",
      }),
    ).toEqual({ accessToken, expiresAt: "2026-07-16T08:05:00.000Z" });
    expect(sessionAuthenticateSchema.parse({ type: "session.authenticate", accessToken })).toEqual({
      type: "session.authenticate",
      accessToken,
    });
  });

  it("accepts a versioned health event envelope", () => {
    const event = {
      eventId: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdfef",
      eventType: "service.health.changed",
      version: 1,
      correlationId: "0190f4b5-3c44-7b1a-9c69-2d8c4b1bdff0",
      sequence: 0,
      occurredAt: "2026-07-16T08:00:00.000Z",
      payload: health,
    } as const;

    expect(serviceHealthChangedEventSchema.parse(event)).toEqual(event);
  });
});
