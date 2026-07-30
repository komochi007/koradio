import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import {
  serviceHealthChangedEventSchema,
  sessionAuthenticateSchema,
  sessionBootstrapResponseSchema,
} from "@koradio/contracts";
import type { FastifyPluginAsync } from "fastify";

import type { HealthService } from "../../modules/device-settings/health.js";
import type { EventHub } from "../../platform/events/index.js";
import type { SessionState } from "../session.js";

export function createSessionEventRoutes(options: {
  authenticationTimeoutMs: number;
  eventHub: EventHub;
  health: HealthService;
  session: SessionState;
}): FastifyPluginAsync {
  return async (app) => {
    app.post("/api/v1/session/bootstrap", (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
      reply.header("Vary", "Origin");
      return sessionBootstrapResponseSchema.parse(options.session.issue());
    });

    app.get("/api/v1/events", { websocket: true }, (socket) => {
      const authenticationTimeout = setTimeout(() => {
        socket.close(1008, "Authentication required");
      }, options.authenticationTimeoutMs);
      authenticationTimeout.unref();
      socket.once("close", () => {
        clearTimeout(authenticationTimeout);
      });

      socket.once("message", (rawMessage, isBinary) => {
        let decoded: unknown;
        try {
          if (isBinary) throw new TypeError("Authentication message must be a text frame");
          const serialized = Array.isArray(rawMessage)
            ? Buffer.concat(rawMessage).toString("utf8")
            : rawMessage instanceof ArrayBuffer
              ? Buffer.from(rawMessage).toString("utf8")
              : rawMessage.toString("utf8");
          if (Buffer.byteLength(serialized) > 4_096) {
            throw new TypeError("Authentication message is too large");
          }
          decoded = JSON.parse(serialized);
        } catch {
          clearTimeout(authenticationTimeout);
          socket.close(1008, "Invalid authentication message");
          return;
        }

        const command = sessionAuthenticateSchema.safeParse(decoded);
        if (
          !command.success ||
          options.session.validate(command.data.accessToken).status !== "valid"
        ) {
          clearTimeout(authenticationTimeout);
          socket.close(1008, "Authentication failed");
          return;
        }

        clearTimeout(authenticationTimeout);
        options.eventHub.add(socket);
        socket.once("close", () => {
          options.eventHub.remove(socket);
        });
        socket.send(
          JSON.stringify(
            serviceHealthChangedEventSchema.parse({
              eventId: randomUUID(),
              eventType: "service.health.changed",
              version: 1,
              correlationId: randomUUID(),
              sequence: 0,
              occurredAt: new Date().toISOString(),
              payload: options.health.getHealth(),
            }),
          ),
        );
      });
    });
  };
}
