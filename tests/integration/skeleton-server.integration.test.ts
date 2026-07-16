import {
  healthResponseSchema,
  serviceHealthChangedEventSchema,
  sessionBootstrapResponseSchema,
} from "@koradio/contracts";
import "@fastify/websocket";
import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../apps/server/src/bootstrap/app.js";
import type { RuntimeConfig } from "../../apps/server/src/bootstrap/config.js";

const origin = "http://127.0.0.1:49373";
const config: RuntimeConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 49373,
  webPort: 5173,
  providerMode: "mock",
  strictPort: true,
  webRoot: "unused-in-test",
};

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe("S1 skeleton server", () => {
  it("returns a validated Mock Provider health snapshot", async () => {
    const app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json<unknown>())).toMatchObject({
      service: "koradio",
      status: "ready",
      mode: "mock",
    });
  });

  it("bootstraps a no-store session and authenticates the event connection", async () => {
    const app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/api/v1/session/bootstrap",
      headers: { origin },
    });
    const bootstrap = sessionBootstrapResponseSchema.parse(bootstrapResponse.json<unknown>());

    expect(bootstrapResponse.statusCode).toBe(200);
    expect(bootstrapResponse.headers["cache-control"]).toBe("no-store");
    expect(bootstrapResponse.headers["set-cookie"]).toBeUndefined();

    const connection = await app.injectWS("/api/v1/events", { headers: { origin } });
    const eventPromise = new Promise<unknown>((resolve, reject) => {
      connection.once("message", (message) => {
        try {
          const serialized = Array.isArray(message)
            ? Buffer.concat(message).toString("utf8")
            : message instanceof ArrayBuffer
              ? Buffer.from(message).toString("utf8")
              : message.toString("utf8");
          resolve(JSON.parse(serialized) as unknown);
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

  it("rejects session bootstrap from an unapproved origin", async () => {
    const app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/session/bootstrap",
      headers: { origin: "http://localhost:5173" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects an event connection that sends an invalid first-message token", async () => {
    const app = await createApp({ config, selectedPort: config.port });
    openApps.push(app);

    const connection = await app.injectWS("/api/v1/events", { headers: { origin } });
    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      connection.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString("utf8") });
      });
    });

    connection.send(
      JSON.stringify({
        type: "session.authenticate",
        accessToken: "invalid-token".repeat(4),
      }),
    );

    await expect(closePromise).resolves.toEqual({ code: 1008, reason: "Authentication failed" });
  });
});
