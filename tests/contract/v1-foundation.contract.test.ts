import {
  asyncJobSnapshotSchema,
  controlledFileRefSchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  idempotencyKeyHeadersSchema,
  idempotencyKeySchema,
  jobAcceptedResponseSchema,
  pageQuerySchema,
  profileIdParamsSchema,
  serviceHealthListResponseSchema,
  sessionAuthenticateSchema,
  sessionBootstrapResponseSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

import { health, ids, now } from "./v1-contract-fixtures.js";

describe("v1 foundation contracts", () => {
  it("accepts identifiers, pagination, controlled refs and idempotency headers", () => {
    expect(profileIdParamsSchema.parse({ profileId: ids.profile })).toEqual({
      profileId: ids.profile,
    });
    expect(pageQuerySchema.parse({ cursor: "next_page-01", limit: 25 })).toEqual({
      cursor: "next_page-01",
      limit: 25,
    });
    expect(controlledFileRefSchema.parse("avatars/profile/avatar.webp")).toBe(
      "avatars/profile/avatar.webp",
    );
    expect(idempotencyKeySchema.parse("command:01/attempt=1")).toBe("command:01/attempt=1");
    expect(idempotencyKeyHeadersSchema.parse({ "idempotency-key": "command-001" })).toEqual({
      "idempotency-key": "command-001",
    });
  });

  it("rejects malformed identifiers, pagination, paths and idempotency keys", () => {
    expect(profileIdParamsSchema.safeParse({ profileId: "current" }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ limit: 20, offset: 0 }).success).toBe(false);
    expect(controlledFileRefSchema.safeParse("/Users/name/avatar.png").success).toBe(false);
    expect(controlledFileRefSchema.safeParse("avatars/../secret.json").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("contains spaces").success).toBe(false);
    expect(idempotencyKeyHeadersSchema.safeParse({}).success).toBe(false);
  });

  it("accepts health and redacted service snapshots", () => {
    expect(healthResponseSchema.parse(health)).toEqual(health);
    expect(
      serviceHealthListResponseSchema.parse({
        items: [
          {
            service: "codex",
            status: "available",
            checkedAt: now,
            redactedSummary: "Codex executable is available",
          },
          {
            service: "tts",
            status: "degraded",
            checkedAt: now,
            redactedSummary: "No matching standard voice",
          },
        ],
      }).items,
    ).toHaveLength(2);
  });

  it("rejects unsafe or provider-specific health fields", () => {
    expect(
      healthResponseSchema.safeParse({
        ...health,
        providers: { ...health.providers, cookie: "secret" },
      }).success,
    ).toBe(false);
    expect(
      serviceHealthListResponseSchema.safeParse({
        items: [
          {
            service: "netease",
            status: "available",
            checkedAt: now,
            redactedSummary: "",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("represents a fully offline last-known health snapshot without sensitive diagnostics", () => {
    const offline = serviceHealthListResponseSchema.parse({
      items: [
        {
          service: "local-service",
          status: "unavailable",
          checkedAt: now,
          redactedSummary: "Local Service is not connected",
        },
        {
          service: "codex",
          status: "unavailable",
          checkedAt: now,
          redactedSummary: "Last known status is unavailable",
        },
        {
          service: "netease",
          status: "unavailable",
          checkedAt: now,
          redactedSummary: "Last known status is unavailable",
        },
        {
          service: "tts",
          status: "unavailable",
          checkedAt: now,
          redactedSummary: "Last known status is unavailable",
        },
      ],
    });

    expect(offline.items).toHaveLength(4);
    expect(
      serviceHealthListResponseSchema.safeParse({
        items: [
          {
            ...offline.items[0],
            dataRoot: "/Users/private/Library/Application Support/Koradio",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts session bootstrap and WebSocket authentication commands", () => {
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

  it("rejects short tokens and unknown session fields", () => {
    expect(
      sessionBootstrapResponseSchema.safeParse({
        accessToken: "short",
        expiresAt: "2026-07-16T08:05:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      sessionAuthenticateSchema.safeParse({
        type: "session.authenticate",
        accessToken: "a".repeat(48),
        persist: true,
      }).success,
    ).toBe(false);
  });

  it("accepts stable safe error envelopes", () => {
    expect(
      errorEnvelopeSchema.parse({
        code: "PROFILE_VALIDATION_FAILED",
        message: "档案字段无效",
        retryable: false,
        correlationId: ids.correlation,
        fieldErrors: [
          {
            field: "radioName",
            code: "TOO_SHORT",
            message: "请输入 2-24 个字符的电台名",
          },
        ],
      }),
    ).toMatchObject({ code: "PROFILE_VALIDATION_FAILED", retryable: false });
  });

  it("rejects raw errors, unstable codes and invalid field errors", () => {
    expect(
      errorEnvelopeSchema.safeParse({
        code: "provider.error",
        message: "failed",
        retryable: true,
        correlationId: ids.correlation,
      }).success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        code: "PROVIDER_FAILED",
        message: "failed",
        retryable: true,
        correlationId: ids.correlation,
        stack: "raw stack",
      }).success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        code: "PROFILE_VALIDATION_FAILED",
        message: "invalid",
        retryable: false,
        correlationId: ids.correlation,
        fieldErrors: [{ field: "", code: "INVALID", message: "invalid" }],
      }).success,
    ).toBe(false);
  });

  it("accepts async job responses and rejects unknown statuses", () => {
    expect(jobAcceptedResponseSchema.parse({ jobId: ids.job })).toEqual({ jobId: ids.job });
    expect(
      asyncJobSnapshotSchema.parse({
        jobId: ids.job,
        kind: "program_generation",
        status: "failed",
        createdAt: now,
        updatedAt: now,
        errorCode: "CODEX_INVALID_OUTPUT",
      }),
    ).toMatchObject({ status: "failed" });
    expect(
      asyncJobSnapshotSchema.safeParse({
        jobId: ids.job,
        kind: "program_generation",
        status: "sleeping",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(false);
  });
});
