import {
  healthResponseSchema,
  serviceHealthChangedEventSchema,
  sessionAuthenticateSchema,
  sessionBootstrapResponseSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

import { health, ids, now } from "./v1-contract-fixtures.js";

describe("v1 compatibility guard", () => {
  it("keeps all S1 health and session fixtures valid", () => {
    const accessToken = "a".repeat(48);

    expect(healthResponseSchema.parse(health)).toEqual(health);
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

  it("keeps the S1 service health event valid without profileId", () => {
    const event = {
      eventId: ids.event,
      eventType: "service.health.changed",
      version: 1,
      correlationId: ids.correlation,
      sequence: 0,
      occurredAt: now,
      payload: health,
    } as const;

    expect(serviceHealthChangedEventSchema.parse(event)).toEqual(event);
  });

  it("requires a major version change for incompatible event envelopes", () => {
    expect(
      serviceHealthChangedEventSchema.safeParse({
        eventId: ids.event,
        eventType: "service.health.changed",
        version: 2,
        correlationId: ids.correlation,
        sequence: 0,
        occurredAt: now,
        payload: health,
      }).success,
    ).toBe(false);
  });
});
