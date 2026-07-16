import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  healthResponseSchema,
  serviceHealthChangedEventSchema,
  sessionAuthenticateSchema,
  sessionBootstrapResponseSchema,
} from "@koradio/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import { createMockHealthSnapshot } from "../integrations/mock-provider-health.js";
import { bootstrapDatabase } from "../platform/db/database.js";
import { createAllowedOrigins, type RuntimeConfig } from "./config.js";
import { createSessionState } from "./session.js";

export interface CreateAppOptions {
  config: RuntimeConfig;
  selectedPort: number;
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  return origin !== undefined && allowedOrigins.has(origin);
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const database = await bootstrapDatabase({ dataRoot: options.config.dataRoot });
  const allowedOrigins = createAllowedOrigins(options.config, options.selectedPort);
  const session = createSessionState();

  app.addHook("onClose", () => {
    database.close();
  });

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
  });
  await app.register(websocket);

  app.get("/api/v1/health", () => healthResponseSchema.parse(createMockHealthSnapshot()));

  app.post("/api/v1/session/bootstrap", async (request, reply) => {
    if (!isAllowedOrigin(request.headers.origin, allowedOrigins)) {
      return reply.code(403).send({
        code: "ORIGIN_NOT_ALLOWED",
        message: "Origin is not allowed",
      });
    }

    reply.header("Cache-Control", "no-store");
    return sessionBootstrapResponseSchema.parse(session.bootstrap);
  });

  app.get("/api/v1/events", { websocket: true }, (socket, request) => {
    if (!isAllowedOrigin(request.headers.origin, allowedOrigins)) {
      socket.close(1008, "Origin not allowed");
      return;
    }

    const authenticationTimeout = setTimeout(() => {
      socket.close(1008, "Authentication required");
    }, 2_000);

    socket.once("message", (rawMessage) => {
      let decoded: unknown;

      try {
        const serialized = Array.isArray(rawMessage)
          ? Buffer.concat(rawMessage).toString("utf8")
          : rawMessage instanceof ArrayBuffer
            ? Buffer.from(rawMessage).toString("utf8")
            : rawMessage.toString("utf8");
        decoded = JSON.parse(serialized);
      } catch {
        clearTimeout(authenticationTimeout);
        socket.close(1008, "Invalid authentication message");
        return;
      }

      const command = sessionAuthenticateSchema.safeParse(decoded);
      if (!command.success || !session.isValid(command.data.accessToken)) {
        clearTimeout(authenticationTimeout);
        socket.close(1008, "Authentication failed");
        return;
      }

      clearTimeout(authenticationTimeout);
      socket.send(
        JSON.stringify(
          serviceHealthChangedEventSchema.parse({
            eventId: randomUUID(),
            eventType: "service.health.changed",
            version: 1,
            correlationId: randomUUID(),
            sequence: 0,
            occurredAt: new Date().toISOString(),
            payload: createMockHealthSnapshot(),
          }),
        ),
      );
    });
  });

  if (options.config.environment === "production") {
    await app.register(fastifyStatic, {
      root: options.config.webRoot,
      wildcard: false,
    });
  }

  await app.ready();
  return app;
}
