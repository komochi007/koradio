import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  createDataRootMigrationRequestSchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  jobAcceptedResponseSchema,
  profileIdParamsSchema,
  serviceHealthListResponseSchema,
  serviceHealthChangedEventSchema,
  sessionAuthenticateSchema,
  sessionBootstrapResponseSchema,
  updateDeviceSettingsRequestSchema,
  updateProfilePreferencesRequestSchema,
} from "@koradio/contracts";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import {
  DataRootMigrationConflictError,
  createDataRootMigrationService,
  type DataRootMigrationRuntimeCoordinator,
  type DataRootRestartRequest,
} from "../modules/device-settings/data-root-migration.js";
import { createHealthService } from "../modules/device-settings/health.js";
import { createDeviceSettingsService } from "../modules/device-settings/index.js";
import { createProfilePreferencesService } from "../modules/profile-preferences/index.js";
import { bootstrapDatabase } from "../platform/db/database.js";
import { resolveDataRootBootstrapPath } from "../platform/db/data-root.js";
import { createEventHub } from "../platform/events/index.js";
import { createAllowedOrigins, type RuntimeConfig } from "./config.js";
import { enforceApiSecurity, isAllowedOrigin } from "./security.js";
import { createSessionState, type SessionState } from "./session.js";

export interface CreateAppOptions {
  config: RuntimeConfig;
  selectedPort: number;
  migrationRuntimeCoordinator?: DataRootMigrationRuntimeCoordinator;
  requestRestart?: (request: DataRootRestartRequest) => Promise<void>;
  session?: SessionState;
  webSocketAuthenticationTimeoutMs?: number;
}

function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  retryable: boolean,
): FastifyReply {
  return reply.status(statusCode).send(
    errorEnvelopeSchema.parse({
      code,
      message,
      retryable,
      correlationId: randomUUID(),
    }),
  );
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const database = await bootstrapDatabase({ dataRoot: options.config.dataRoot });
  const deviceSettings = createDeviceSettingsService({
    client: database.client,
    dataRoot: options.config.dataRoot,
  });
  deviceSettings.initialize();
  const profilePreferences = createProfilePreferencesService({ client: database.client });
  const health = createHealthService({
    deviceSettings,
    mode: options.config.providerMode,
  });
  const eventHub = createEventHub();
  const dataRootMigration = createDataRootMigrationService({
    bootstrapPath:
      options.config.dataRootBootstrapPath ??
      resolveDataRootBootstrapPath(options.config.initialDataRoot ?? options.config.dataRoot),
    checkpointDatabase: () => {
      database.client.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      return Promise.resolve();
    },
    deviceSettings,
    publish(event) {
      eventHub.publish(event);
    },
    ...(options.requestRestart === undefined ? {} : { requestRestart: options.requestRestart }),
    runtimeCoordinator: options.migrationRuntimeCoordinator ?? {
      checkpointPlayback: () => {
        database.client.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        return Promise.resolve();
      },
      pauseGenerationAndPlayback: () => Promise.resolve(),
    },
    sourceDataRoot: options.config.dataRoot,
  });
  const allowedOrigins = createAllowedOrigins(options.config, options.selectedPort);
  const session = options.session ?? createSessionState();
  const webSocketAuthenticationTimeoutMs = options.webSocketAuthenticationTimeoutMs ?? 2_000;

  app.addHook("onClose", () => {
    database.close();
  });

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || isAllowedOrigin(origin, allowedOrigins));
    },
    methods: ["GET", "PATCH", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
  });
  await app.register(websocket);

  app.addHook("preValidation", (request, reply, done) => {
    if (enforceApiSecurity(request, reply, { allowedOrigins, session })) {
      done();
    }
  });

  app.get("/api/v1/health", () => healthResponseSchema.parse(health.getHealth()));

  app.get("/api/v1/health/services", () =>
    serviceHealthListResponseSchema.parse(health.getServiceHealth()),
  );

  app.get("/api/v1/device-settings", () => deviceSettings.get());

  app.patch("/api/v1/device-settings", (request, reply) => {
    const parsed = updateDeviceSettingsRequestSchema.safeParse({
      body: request.body,
    });

    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "DEVICE_SETTINGS_VALIDATION_FAILED",
        "Device settings are invalid",
        false,
      );
    }

    return deviceSettings.update(parsed.data.body);
  });

  app.get("/api/v1/profiles/:profileId/preferences", (request, reply) => {
    const parsed = profileIdParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROFILE_PREFERENCES_VALIDATION_FAILED",
        "Profile preferences request is invalid",
        false,
      );
    }

    return profilePreferences.get(parsed.data.profileId);
  });

  app.patch("/api/v1/profiles/:profileId/preferences", (request, reply) => {
    const parsed = updateProfilePreferencesRequestSchema.safeParse({
      params: request.params,
      body: request.body,
    });

    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROFILE_PREFERENCES_VALIDATION_FAILED",
        "Profile preferences are invalid",
        false,
      );
    }

    return profilePreferences.update(parsed.data.params.profileId, parsed.data.body);
  });

  app.post("/api/v1/device-settings/data-root-migrations", (request, reply) => {
    const parsed = createDataRootMigrationRequestSchema.safeParse({
      headers: {
        "idempotency-key": request.headers["idempotency-key"],
      },
      body: request.body,
    });

    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "DATA_ROOT_MIGRATION_VALIDATION_FAILED",
        "Data root migration request is invalid",
        false,
      );
    }

    try {
      const result = dataRootMigration.create(
        parsed.data.body,
        parsed.data.headers["idempotency-key"],
      );
      return reply.status(202).send(jobAcceptedResponseSchema.parse({ jobId: result.jobId }));
    } catch (error) {
      if (error instanceof DataRootMigrationConflictError) {
        return sendApiError(
          reply,
          409,
          "DATA_ROOT_MIGRATION_ALREADY_RUNNING",
          "Another data root migration is already running",
          true,
        );
      }

      throw error;
    }
  });

  app.post("/api/v1/session/bootstrap", (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Pragma", "no-cache");
    reply.header("Vary", "Origin");
    return sessionBootstrapResponseSchema.parse(session.issue());
  });

  app.get("/api/v1/events", { websocket: true }, (socket) => {
    const authenticationTimeout = setTimeout(() => {
      socket.close(1008, "Authentication required");
    }, webSocketAuthenticationTimeoutMs);
    authenticationTimeout.unref();
    socket.once("close", () => {
      clearTimeout(authenticationTimeout);
    });

    socket.once("message", (rawMessage, isBinary) => {
      let decoded: unknown;

      try {
        if (isBinary) {
          throw new TypeError("Authentication message must be a text frame");
        }
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
      if (!command.success || session.validate(command.data.accessToken).status !== "valid") {
        clearTimeout(authenticationTimeout);
        socket.close(1008, "Authentication failed");
        return;
      }

      clearTimeout(authenticationTimeout);
      eventHub.add(socket);
      socket.once("close", () => {
        eventHub.remove(socket);
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
            payload: health.getHealth(),
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
