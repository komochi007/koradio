import {
  errorEnvelopeSchema,
  healthResponseSchema,
  serviceHealthChangedEventSchema,
  sessionBootstrapResponseSchema,
  type SessionBootstrapResponse,
} from "@koradio/contracts";
import "@fastify/websocket";
import { Buffer } from "node:buffer";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";
import { createSessionState } from "../../apps/server/src/bootstrap/session.js";

const origin = "http://127.0.0.1:49373";
const dataRoot = await mkdtemp(join(tmpdir(), "koradio-skeleton-server-"));
const config: RuntimeConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 49373,
  webPort: 5173,
  providerMode: "mock",
  strictPort: true,
  dataRoot,
  webRoot: "unused-in-test",
};

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

async function createTestApp(
  options: Omit<Parameters<typeof createApp>[0], "config" | "selectedPort"> = {},
) {
  const app = await createApp({
    config,
    selectedPort: config.port,
    webSocketAuthenticationTimeoutMs: 50,
    ...options,
  });
  openApps.push(app);
  return app;
}

async function bootstrapSession(
  app: Awaited<ReturnType<typeof createApp>>,
): Promise<SessionBootstrapResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/session/bootstrap",
    headers: { origin },
  });
  expect(response.statusCode).toBe(200);
  return sessionBootstrapResponseSchema.parse(response.json<unknown>());
}

function decodeSocketMessage(message: Buffer | ArrayBuffer | Buffer[]): unknown {
  const serialized = Array.isArray(message)
    ? Buffer.concat(message).toString("utf8")
    : message instanceof ArrayBuffer
      ? Buffer.from(message).toString("utf8")
      : message.toString("utf8");
  return JSON.parse(serialized) as unknown;
}

describe("S2 local session and Origin security", () => {
  it("protects REST health with the same short-lived Bearer session", async () => {
    const app = await createTestApp();

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { origin },
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(unauthenticated.json<unknown>())).toMatchObject({
      code: "SESSION_REQUIRED",
      retryable: true,
    });
    expect(unauthenticated.headers["www-authenticate"]).toBe("Bearer");

    const bootstrap = await bootstrapSession(app);
    const authenticated = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: {
        authorization: `Bearer ${bootstrap.accessToken}`,
        origin,
      },
    });

    expect(authenticated.statusCode).toBe(200);
    expect(healthResponseSchema.parse(authenticated.json<unknown>())).toMatchObject({
      service: "koradio",
      status: "ready",
      mode: "mock",
    });
  });

  it("returns a no-store bootstrap without cookie, redirect or reflected token headers", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/session/bootstrap",
      headers: { origin },
    });
    const bootstrap = sessionBootstrapResponseSchema.parse(response.json<unknown>());
    const serializedHeaders = JSON.stringify(response.headers);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers.vary).toContain("Origin");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers.location).toBeUndefined();
    expect(serializedHeaders).not.toContain(bootstrap.accessToken);
  });

  it("converts parser failures into a stable error envelope without raw diagnostics", async () => {
    const app = await createTestApp();
    const bootstrap = await bootstrapSession(app);
    const sensitiveBody = '{"radioName":"private scenario",';
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      headers: {
        authorization: `Bearer ${bootstrap.accessToken}`,
        "content-type": "application/json",
        origin,
      },
      payload: sensitiveBody,
    });
    const serialized = response.body;

    expect(response.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(response.json<unknown>())).toMatchObject({
      code: "REQUEST_INVALID",
      message: "Request is invalid",
      retryable: false,
    });
    expect(serialized).not.toContain("private scenario");
    expect(serialized).not.toContain("SyntaxError");
    expect(serialized).not.toContain("stack");
  });

  it("rejects malformed, unapproved and cross-site Origins", async () => {
    const app = await createTestApp();
    const developmentApp = await createApp({
      config: { ...config, environment: "development" },
      selectedPort: config.port,
    });
    openApps.push(developmentApp);

    const developmentOrigin = await developmentApp.inject({
      method: "POST",
      url: "/api/v1/session/bootstrap",
      headers: { origin: "http://127.0.0.1:5173" },
    });
    expect(developmentOrigin.statusCode).toBe(200);

    for (const rejectedOrigin of [
      "http://localhost:5173",
      "HTTP://127.0.0.1:49373",
      "http://127.0.0.1:49373/",
      "null",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/session/bootstrap",
        headers: { origin: rejectedOrigin },
      });

      expect(response.statusCode).toBe(403);
      expect(errorEnvelopeSchema.parse(response.json<unknown>())).toMatchObject({
        code: "ORIGIN_NOT_ALLOWED",
      });
    }

    const bootstrap = await bootstrapSession(app);
    const crossSite = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: {
        authorization: `Bearer ${bootstrap.accessToken}`,
        "sec-fetch-site": "cross-site",
      },
    });
    expect(crossSite.statusCode).toBe(403);
    expect(errorEnvelopeSchema.parse(crossSite.json<unknown>())).toMatchObject({
      code: "ORIGIN_NOT_ALLOWED",
    });
  });

  it("rejects URL, bootstrap-header and malformed Bearer token transports", async () => {
    const app = await createTestApp();

    const urlToken = await app.inject({
      method: "GET",
      url: `/api/v1/health?access_token=${"a".repeat(48)}`,
      headers: { origin },
    });
    expect(urlToken.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(urlToken.json<unknown>())).toMatchObject({
      code: "SESSION_TOKEN_URL_NOT_ALLOWED",
    });

    const bootstrapHeader = await app.inject({
      method: "POST",
      url: "/api/v1/session/bootstrap",
      headers: {
        authorization: `Bearer ${"a".repeat(48)}`,
        origin,
      },
    });
    expect(bootstrapHeader.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(bootstrapHeader.json<unknown>())).toMatchObject({
      code: "SESSION_TOKEN_TRANSPORT_NOT_ALLOWED",
    });

    const malformedBearer = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: {
        authorization: `bearer ${"a".repeat(48)}`,
        origin,
      },
    });
    expect(malformedBearer.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(malformedBearer.json<unknown>())).toMatchObject({
      code: "SESSION_REQUIRED",
    });
  });

  it("rejects expired and previous-process REST tokens", async () => {
    let now = new Date("2026-07-16T08:00:00.000Z");
    const session = createSessionState({
      clock: () => now,
      lifetimeMs: 10,
      processSecret: new Uint8Array(32).fill(3),
    });
    const app = await createTestApp({ session });
    const bootstrap = await bootstrapSession(app);

    now = new Date("2026-07-16T08:00:00.010Z");
    const expired = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: {
        authorization: `Bearer ${bootstrap.accessToken}`,
        origin,
      },
    });
    expect(expired.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(expired.json<unknown>())).toMatchObject({
      code: "SESSION_EXPIRED",
    });

    const otherSession = createSessionState({
      processSecret: new Uint8Array(32).fill(4),
    });
    const otherApp = await createTestApp({ session: otherSession });
    const previousProcess = await otherApp.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: {
        authorization: `Bearer ${bootstrap.accessToken}`,
        origin,
      },
    });
    expect(previousProcess.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(previousProcess.json<unknown>())).toMatchObject({
      code: "SESSION_INVALID",
    });
  });

  it("authenticates WebSocket only after a valid first text message", async () => {
    const app = await createTestApp({ webSocketAuthenticationTimeoutMs: 200 });
    const bootstrap = await bootstrapSession(app);
    const connection = await app.injectWS("/api/v1/events", { headers: { origin } });
    let eventReceived = false;
    connection.once("message", () => {
      eventReceived = true;
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(eventReceived).toBe(false);

    const eventPromise = new Promise<unknown>((resolve, reject) => {
      connection.once("message", (message) => {
        try {
          resolve(decodeSocketMessage(message));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Failed to decode event"));
        }
      });
    });
    connection.send(
      JSON.stringify({
        type: "session.authenticate",
        accessToken: bootstrap.accessToken,
      }),
    );

    const event = serviceHealthChangedEventSchema.parse(await eventPromise);
    expect(event.eventType).toBe("service.health.changed");
    expect(event.payload.mode).toBe("mock");
    connection.close();
  });

  it("rejects invalid, expired and missing WebSocket first-message authentication", async () => {
    const app = await createTestApp();

    const invalidConnection = await app.injectWS("/api/v1/events", { headers: { origin } });
    const invalidClose = new Promise<{ code: number; reason: string }>((resolve) => {
      invalidConnection.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString("utf8") });
      });
    });
    invalidConnection.send(
      JSON.stringify({
        type: "session.authenticate",
        accessToken: "invalid-token".repeat(4),
      }),
    );
    await expect(invalidClose).resolves.toEqual({
      code: 1008,
      reason: "Authentication failed",
    });

    const missingConnection = await app.injectWS("/api/v1/events", { headers: { origin } });
    const missingClose = new Promise<{ code: number; reason: string }>((resolve) => {
      missingConnection.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString("utf8") });
      });
    });
    await expect(missingClose).resolves.toEqual({
      code: 1008,
      reason: "Authentication required",
    });

    let now = new Date("2026-07-16T08:00:00.000Z");
    const expiringSession = createSessionState({
      clock: () => now,
      lifetimeMs: 10,
      processSecret: new Uint8Array(32).fill(5),
    });
    const expiringApp = await createTestApp({ session: expiringSession });
    const bootstrap = await bootstrapSession(expiringApp);
    now = new Date("2026-07-16T08:00:00.010Z");
    const expiredConnection = await expiringApp.injectWS("/api/v1/events", {
      headers: { origin },
    });
    const expiredClose = new Promise<{ code: number; reason: string }>((resolve) => {
      expiredConnection.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString("utf8") });
      });
    });
    expiredConnection.send(
      JSON.stringify({
        type: "session.authenticate",
        accessToken: bootstrap.accessToken,
      }),
    );
    await expect(expiredClose).resolves.toEqual({
      code: 1008,
      reason: "Authentication failed",
    });
  });

  it("rejects WebSocket URL/header token transports and invalid Origins before events", async () => {
    const app = await createTestApp();

    await expect(
      app.injectWS(`/api/v1/events?token=${"a".repeat(48)}`, {
        headers: { origin },
      }),
    ).rejects.toThrow();
    await expect(
      app.injectWS("/api/v1/events", {
        headers: {
          authorization: `Bearer ${"a".repeat(48)}`,
          origin,
        },
      }),
    ).rejects.toThrow();
    await expect(
      app.injectWS("/api/v1/events", {
        headers: { origin: "http://localhost:5173" },
      }),
    ).rejects.toThrow();
  });
});
