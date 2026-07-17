import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  audioResolutionRequestSchema,
  audioResolutionSchema,
  createFeedbackRequestSchema,
  createLibraryItemRequestSchema,
  createDataRootMigrationRequestSchema,
  createProfileRequestSchema,
  currentProfileResponseSchema,
  errorEnvelopeSchema,
  feedbackEventSchema,
  feedbackPersistedEventSchema,
  generateProgramRequestSchema,
  healthResponseSchema,
  jobAcceptedResponseSchema,
  libraryItemSchema,
  libraryListRequestSchema,
  libraryListResponseSchema,
  musicSearchRequestSchema,
  musicSearchResponseSchema,
  playlistImportSnapshotRequestSchema,
  playlistImportSnapshotSchema,
  playbackCheckpointSchema,
  playbackSnapshotRequestSchema,
  programDetailRequestSchema,
  programDetailSchema,
  programGenerationSnapshotRequestSchema,
  programGenerationSnapshotSchema,
  programListRequestSchema,
  programListResponseSchema,
  profileAvatarUploadResponseSchema,
  profileIdParamsSchema,
  profileListResponseSchema,
  profileSchema,
  selectCurrentProfileRequestSchema,
  savePlaybackCheckpointRequestSchema,
  serviceHealthListResponseSchema,
  serviceHealthChangedEventSchema,
  sessionAuthenticateSchema,
  sessionBootstrapResponseSchema,
  trackLyricsRequestSchema,
  trackLyricsSchema,
  tasteResponseSchema,
  importPlaylistRequestSchema,
  updateDeviceSettingsRequestSchema,
  updateProfileRequestSchema,
  updateProfilePreferencesRequestSchema,
  updateTasteOverridesRequestSchema,
} from "@koradio/contracts";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import { createMockCodexProvider, createMockTtsProvider } from "../integrations/index.js";

import {
  DataRootMigrationConflictError,
  createDataRootMigrationService,
  type DataRootMigrationRuntimeCoordinator,
  type DataRootRestartRequest,
} from "../modules/device-settings/data-root-migration.js";
import { createHealthService } from "../modules/device-settings/health.js";
import { createDeviceSettingsService } from "../modules/device-settings/index.js";
import {
  FeedbackDataError,
  FeedbackTargetNotFoundError,
  createFeedbackRepository,
  createFeedbackService,
  type FeedbackTargetResolver,
} from "../modules/feedback/index.js";
import {
  ProfilePreferencesNotFoundError,
  createProfilePreferencesService,
} from "../modules/profile-preferences/index.js";
import {
  LibraryCursorError,
  LibraryDataError,
  LibraryTrackNotFoundError,
  MusicProviderResponseError,
  MusicProviderUnavailableError,
  PlaylistImportNotFoundError,
  createLibraryRepository,
  createLibraryService,
  createMockMusicProvider,
  type MusicProvider,
} from "../modules/library/index.js";
import {
  PlaybackDataError,
  PlaybackPolicyError,
  PlaybackTargetNotFoundError,
  PlaybackWriteError,
  createPlaybackCheckpointService,
  createPlaybackRepository,
  createPlaybackTimelineService,
} from "../modules/playback/index.js";
import {
  ProgramCursorError,
  ProgramDataError,
  ProgramGenerationConflictError,
  ProgramGenerationDataError,
  ProgramGenerationNotFoundError,
  ProgramNotFoundError,
  createProgramGenerationRepository,
  createProgramGenerationService,
  createProgramRepository,
  createProgramService,
  type CodexProvider,
  type TtsProvider,
} from "../modules/programs/index.js";
import {
  AvatarUploadError,
  AvatarReferenceError,
  ProfileDataError,
  ProfileNotFoundError,
  ProfileSwitchError,
  createAvatarUploadService,
  createProfileContextService,
  createProfileRepository,
  createProfileService,
  type ProfileSwitchRuntimeCoordinator,
} from "../modules/profiles/index.js";
import {
  TasteDataError,
  TasteNotFoundError,
  createTasteDefaultsService,
  createTasteRepository,
  createTasteService,
} from "../modules/taste/index.js";
import { bootstrapDatabase } from "../platform/db/database.js";
import {
  readCurrentProfileId,
  resolveDataRootBootstrapPath,
  writeCurrentProfileId,
} from "../platform/db/data-root.js";
import { createEventHub } from "../platform/events/index.js";
import { FileStoreError, createLocalFileStore } from "../platform/files/index.js";
import { createAllowedOrigins, type RuntimeConfig } from "./config.js";
import { enforceApiSecurity, isAllowedOrigin } from "./security.js";
import { createSessionState, type SessionState } from "./session.js";

export interface CreateAppOptions {
  config: RuntimeConfig;
  selectedPort: number;
  migrationRuntimeCoordinator?: DataRootMigrationRuntimeCoordinator;
  profileSwitchRuntimeCoordinator?: ProfileSwitchRuntimeCoordinator;
  musicProvider?: MusicProvider;
  codexProvider?: CodexProvider;
  generationTimeoutMs?: number;
  programFeedbackTargets?: Pick<FeedbackTargetResolver, "programExists">;
  requestRestart?: (request: DataRootRestartRequest) => Promise<void>;
  session?: SessionState;
  ttsProvider?: TtsProvider;
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
  const bootstrapPath =
    options.config.dataRootBootstrapPath ??
    resolveDataRootBootstrapPath(options.config.initialDataRoot ?? options.config.dataRoot);
  const deviceSettings = createDeviceSettingsService({
    client: database.client,
    dataRoot: options.config.dataRoot,
  });
  deviceSettings.initialize();
  const profilePreferences = createProfilePreferencesService({ client: database.client });
  const tasteDefaults = createTasteDefaultsService(database.client);
  const tasteRepository = createTasteRepository(database.client);
  const taste = createTasteService({ repository: tasteRepository });
  const avatarUpload = createAvatarUploadService(
    createLocalFileStore({ dataRoot: options.config.dataRoot }),
  );
  const profiles = createProfileService({
    avatarReferences: avatarUpload,
    client: database.client,
    preferences: profilePreferences,
    repository: createProfileRepository(database.client),
    tasteDefaults,
  });
  let cancelProgramGeneration: (profileId: string) => Promise<void> = () => Promise.resolve();
  const profileContext = createProfileContextService({
    profiles,
    preferences: profilePreferences,
    readCurrentProfileId: () =>
      readCurrentProfileId(
        options.config.initialDataRoot ?? options.config.dataRoot,
        bootstrapPath,
      ),
    runtimeCoordinator: {
      async cancelGeneration(profileId) {
        await cancelProgramGeneration(profileId);
        await options.profileSwitchRuntimeCoordinator?.cancelGeneration(profileId);
      },
      checkpointPlayback: (profileId) =>
        options.profileSwitchRuntimeCoordinator?.checkpointPlayback(profileId) ?? Promise.resolve(),
      discardLateEvents: (profileId) =>
        options.profileSwitchRuntimeCoordinator?.discardLateEvents(profileId) ?? Promise.resolve(),
      stopPlayback: (profileId) =>
        options.profileSwitchRuntimeCoordinator?.stopPlayback(profileId) ?? Promise.resolve(),
    },
    writeCurrentProfileId: (profileId) =>
      writeCurrentProfileId(bootstrapPath, options.config.dataRoot, profileId),
  });
  const library = createLibraryService({
    provider: options.musicProvider ?? createMockMusicProvider(),
    repository: createLibraryRepository(database.client),
  });
  const playbackRepository = createPlaybackRepository(database.client);
  const playbackTimeline = createPlaybackTimelineService(playbackRepository);
  const programs = createProgramService({
    client: database.client,
    repository: createProgramRepository(database.client),
    timeline: playbackTimeline,
    tracks: library,
  });
  const playback = createPlaybackCheckpointService({
    client: database.client,
    programs,
    repository: playbackRepository,
  });
  const feedback = createFeedbackService({
    client: database.client,
    repository: createFeedbackRepository(database.client),
    targets: {
      programExists:
        options.programFeedbackTargets?.programExists ??
        ((profileId, programId) => programs.hasProgram(profileId, programId)),
      trackExists: (_profileId, trackId) => library.hasTrack(trackId),
    },
    tasteRepository,
  });
  const health = createHealthService({
    deviceSettings,
    mode: options.config.providerMode,
  });
  const eventHub = createEventHub();
  const programGeneration = createProgramGenerationService({
    codex: options.codexProvider ?? createMockCodexProvider(),
    events: eventHub,
    library,
    preferences: profilePreferences,
    programs,
    repository: createProgramGenerationRepository(database.client),
    taste,
    ...(options.generationTimeoutMs === undefined
      ? {}
      : { timeoutMs: options.generationTimeoutMs }),
    tts: options.ttsProvider ?? createMockTtsProvider(),
  });
  cancelProgramGeneration = (profileId) => programGeneration.cancelProfile(profileId);
  const dataRootMigration = createDataRootMigrationService({
    bootstrapPath,
    checkpointDatabase: () => {
      database.client.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      return Promise.resolve();
    },
    deviceSettings,
    publish(event) {
      eventHub.publish(event);
    },
    ...(options.requestRestart === undefined ? {} : { requestRestart: options.requestRestart }),
    runtimeCoordinator: {
      checkpointPlayback:
        options.migrationRuntimeCoordinator?.checkpointPlayback ??
        (() => {
          database.client.exec("PRAGMA wal_checkpoint(TRUNCATE)");
          return Promise.resolve();
        }),
      async pauseGenerationAndPlayback() {
        await programGeneration.close();
        await options.migrationRuntimeCoordinator?.pauseGenerationAndPlayback();
      },
    },
    sourceDataRoot: options.config.dataRoot,
  });
  const allowedOrigins = createAllowedOrigins(options.config, options.selectedPort);
  const session = options.session ?? createSessionState();
  const webSocketAuthenticationTimeoutMs = options.webSocketAuthenticationTimeoutMs ?? 2_000;

  app.addHook("onClose", async () => {
    await programGeneration.close();
    await library.close();
    database.close();
  });

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || isAllowedOrigin(origin, allowedOrigins));
    },
    methods: ["GET", "PATCH", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
  });
  await app.register(multipart, {
    throwFileSizeLimit: true,
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

  app.get("/api/v1/profiles", () => profileListResponseSchema.parse(profiles.list()));

  app.post("/api/v1/profiles", async (request, reply) => {
    const parsed = createProfileRequestSchema.safeParse({
      headers: {
        "idempotency-key": request.headers["idempotency-key"],
      },
      body: request.body,
    });

    if (!parsed.success) {
      return sendApiError(reply, 400, "PROFILE_VALIDATION_FAILED", "Profile is invalid", false);
    }

    try {
      return await reply
        .status(201)
        .send(
          profileSchema.parse(
            await profiles.create(parsed.data.body, parsed.data.headers["idempotency-key"]),
          ),
        );
    } catch (error) {
      if (error instanceof AvatarReferenceError) {
        return sendApiError(
          reply,
          400,
          "PROFILE_AVATAR_INVALID",
          "Profile avatar reference is invalid",
          false,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/current", async (_request, reply) => {
    try {
      return currentProfileResponseSchema.parse(await profileContext.getCurrent());
    } catch (error) {
      if (
        error instanceof ProfileNotFoundError ||
        error instanceof ProfilePreferencesNotFoundError ||
        error instanceof ProfileDataError
      ) {
        return sendApiError(
          reply,
          409,
          "CURRENT_PROFILE_UNAVAILABLE",
          "Current profile could not be loaded",
          false,
        );
      }
      throw error;
    }
  });

  app.put("/api/v1/profiles/current", async (request, reply) => {
    const parsed = selectCurrentProfileRequestSchema.safeParse({
      body: request.body,
    });

    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROFILE_SELECTION_VALIDATION_FAILED",
        "Profile selection is invalid",
        false,
      );
    }

    try {
      return currentProfileResponseSchema.parse(
        await profileContext.select(parsed.data.body.profileId),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProfilePreferencesNotFoundError || error instanceof ProfileDataError) {
        return sendApiError(reply, 500, "PROFILE_UNREADABLE", "Profile could not be read", false);
      }
      if (error instanceof ProfileSwitchError) {
        return sendApiError(
          reply,
          500,
          "PROFILE_SWITCH_FAILED",
          "Profile switch could not be completed",
          true,
        );
      }
      throw error;
    }
  });

  app.post("/api/v1/profile-avatars", async (request, reply) => {
    if (!request.isMultipart()) {
      return sendApiError(
        reply,
        400,
        "AVATAR_UPLOAD_VALIDATION_FAILED",
        "Avatar upload is invalid",
        false,
      );
    }

    try {
      let uploaded:
        | {
            content: Buffer;
            mimeType: string;
          }
        | undefined;

      for await (const part of request.parts({
        limits: {
          fields: 0,
          fileSize: 5 * 1_048_576,
          files: 1,
          parts: 1,
        },
      })) {
        if (part.type !== "file" || part.fieldname !== "avatar" || uploaded !== undefined) {
          throw new AvatarUploadError();
        }
        uploaded = {
          content: await part.toBuffer(),
          mimeType: part.mimetype,
        };
      }

      if (uploaded === undefined) {
        throw new AvatarUploadError();
      }

      return await reply.status(201).send(
        profileAvatarUploadResponseSchema.parse({
          avatarRef: await avatarUpload.store(uploaded.content, uploaded.mimeType),
        }),
      );
    } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
        return sendApiError(reply, 413, "AVATAR_FILE_TOO_LARGE", "Avatar file is too large", false);
      }
      if (
        error instanceof AvatarUploadError ||
        error instanceof app.multipartErrors.FilesLimitError ||
        error instanceof app.multipartErrors.FieldsLimitError ||
        error instanceof app.multipartErrors.PartsLimitError
      ) {
        return sendApiError(
          reply,
          400,
          "AVATAR_UPLOAD_VALIDATION_FAILED",
          "Avatar upload is invalid",
          false,
        );
      }
      if (error instanceof FileStoreError) {
        return sendApiError(
          reply,
          500,
          "AVATAR_STORAGE_FAILED",
          "Avatar could not be stored",
          true,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId", (request, reply) => {
    const parsed = profileIdParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROFILE_VALIDATION_FAILED",
        "Profile request is invalid",
        false,
      );
    }

    try {
      return profileSchema.parse(profiles.get(parsed.data.profileId));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProfileDataError) {
        return sendApiError(reply, 500, "PROFILE_UNREADABLE", "Profile could not be read", false);
      }
      throw error;
    }
  });

  app.patch("/api/v1/profiles/:profileId", async (request, reply) => {
    const parsed = updateProfileRequestSchema.safeParse({
      params: request.params,
      body: request.body,
    });

    if (!parsed.success) {
      return sendApiError(reply, 400, "PROFILE_VALIDATION_FAILED", "Profile is invalid", false);
    }

    try {
      return profileSchema.parse(
        await profiles.update(parsed.data.params.profileId, parsed.data.body),
      );
    } catch (error) {
      if (error instanceof AvatarReferenceError) {
        return sendApiError(
          reply,
          400,
          "PROFILE_AVATAR_INVALID",
          "Profile avatar reference is invalid",
          false,
        );
      }
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProfileDataError) {
        return sendApiError(reply, 500, "PROFILE_UNREADABLE", "Profile could not be read", false);
      }
      throw error;
    }
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

    try {
      profiles.get(parsed.data.profileId);
      return profilePreferences.get(parsed.data.profileId);
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProfilePreferencesNotFoundError || error instanceof ProfileDataError) {
        return sendApiError(reply, 500, "PROFILE_UNREADABLE", "Profile could not be read", false);
      }
      throw error;
    }
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

    try {
      profiles.get(parsed.data.params.profileId);
      return profilePreferences.update(parsed.data.params.profileId, parsed.data.body);
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProfilePreferencesNotFoundError || error instanceof ProfileDataError) {
        return sendApiError(reply, 500, "PROFILE_UNREADABLE", "Profile could not be read", false);
      }
      throw error;
    }
  });

  app.post("/api/v1/profiles/:profileId/program-generations", (request, reply) => {
    const parsed = generateProgramRequestSchema.safeParse({
      params: request.params,
      headers: {
        "idempotency-key": request.headers["idempotency-key"],
      },
      body: request.body,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROGRAM_GENERATION_VALIDATION_FAILED",
        "Program generation request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      const snapshot = programGeneration.start(
        parsed.data.params.profileId,
        parsed.data.body,
        parsed.data.headers["idempotency-key"],
      );
      return reply.status(202).send(jobAcceptedResponseSchema.parse({ jobId: snapshot.jobId }));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProgramGenerationConflictError) {
        return sendApiError(
          reply,
          409,
          "PROGRAM_GENERATION_ALREADY_RUNNING",
          "Another program generation is already running",
          true,
        );
      }
      if (error instanceof ProgramGenerationDataError) {
        return sendApiError(
          reply,
          500,
          "PROGRAM_GENERATION_UNAVAILABLE",
          "Program generation could not be started",
          true,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/program-generations/:jobId", (request, reply) => {
    const parsed = programGenerationSnapshotRequestSchema.safeParse({
      params: request.params,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROGRAM_GENERATION_VALIDATION_FAILED",
        "Program generation request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return programGenerationSnapshotSchema.parse(
        programGeneration.get(parsed.data.params.profileId, parsed.data.params.jobId),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProgramGenerationNotFoundError) {
        return sendApiError(
          reply,
          404,
          "PROGRAM_GENERATION_NOT_FOUND",
          "Program generation was not found",
          false,
        );
      }
      if (error instanceof ProgramGenerationDataError) {
        return sendApiError(
          reply,
          500,
          "PROGRAM_GENERATION_UNREADABLE",
          "Program generation could not be read",
          true,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/programs", (request, reply) => {
    const parsed = programListRequestSchema.safeParse({
      params: request.params,
      query: request.query,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROGRAM_LIST_VALIDATION_FAILED",
        "Program list request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return programListResponseSchema.parse(
        programs.list(
          parsed.data.params.profileId,
          parsed.data.query.cursor,
          parsed.data.query.limit,
        ),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProgramCursorError) {
        return sendApiError(
          reply,
          400,
          "PROGRAM_CURSOR_INVALID",
          "Program cursor is invalid",
          false,
        );
      }
      if (error instanceof ProgramDataError) {
        return sendApiError(reply, 500, "PROGRAMS_UNREADABLE", "Programs could not be read", true);
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/programs/:programId", (request, reply) => {
    const parsed = programDetailRequestSchema.safeParse({ params: request.params });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PROGRAM_DETAIL_VALIDATION_FAILED",
        "Program detail request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return programDetailSchema.parse(
        programs.get(parsed.data.params.profileId, parsed.data.params.programId),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof ProgramNotFoundError) {
        return sendApiError(reply, 404, "PROGRAM_NOT_FOUND", "Program was not found", false);
      }
      if (error instanceof ProgramDataError) {
        return sendApiError(reply, 500, "PROGRAM_UNREADABLE", "Program could not be read", true);
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/playback", (request, reply) => {
    const parsed = playbackSnapshotRequestSchema.safeParse({ params: request.params });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PLAYBACK_SNAPSHOT_VALIDATION_FAILED",
        "Playback snapshot request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      const checkpoint = playback.get(parsed.data.params.profileId);
      if (checkpoint === null) {
        return sendApiError(
          reply,
          404,
          "PLAYBACK_SNAPSHOT_NOT_FOUND",
          "Playback snapshot was not found",
          false,
        );
      }
      return playbackCheckpointSchema.parse(checkpoint);
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof PlaybackDataError) {
        return sendApiError(
          reply,
          500,
          "PLAYBACK_SNAPSHOT_UNREADABLE",
          "Playback snapshot could not be read",
          true,
        );
      }
      throw error;
    }
  });

  app.put("/api/v1/profiles/:profileId/playback/checkpoints", (request, reply) => {
    const parsed = savePlaybackCheckpointRequestSchema.safeParse({
      params: request.params,
      body: request.body,
    });
    if (!parsed.success || parsed.data.params.profileId !== parsed.data.body.profileId) {
      return sendApiError(
        reply,
        400,
        "PLAYBACK_CHECKPOINT_VALIDATION_FAILED",
        "Playback checkpoint is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return playbackCheckpointSchema.parse(
        playback.save(parsed.data.params.profileId, parsed.data.body),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof PlaybackTargetNotFoundError) {
        return sendApiError(
          reply,
          404,
          "PLAYBACK_TARGET_NOT_FOUND",
          "Playback target was not found",
          false,
        );
      }
      if (error instanceof PlaybackPolicyError) {
        if (error.code === "PLAYBACK_LEASE_STALE") {
          return sendApiError(reply, 409, "PLAYBACK_LEASE_STALE", "Playback lease is stale", false);
        }
        return sendApiError(
          reply,
          400,
          "PLAYBACK_CHECKPOINT_INVALID",
          "Playback checkpoint is invalid",
          false,
        );
      }
      if (error instanceof PlaybackDataError || error instanceof PlaybackWriteError) {
        return sendApiError(
          reply,
          500,
          "PLAYBACK_CHECKPOINT_WRITE_FAILED",
          "Playback checkpoint could not be stored",
          true,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/taste", (request, reply) => {
    const parsed = profileIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendApiError(reply, 400, "TASTE_VALIDATION_FAILED", "Taste request is invalid", false);
    }

    try {
      profiles.get(parsed.data.profileId);
      return tasteResponseSchema.parse(taste.get(parsed.data.profileId));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (
        error instanceof ProfileDataError ||
        error instanceof TasteDataError ||
        error instanceof TasteNotFoundError
      ) {
        return sendApiError(reply, 500, "TASTE_UNREADABLE", "Taste could not be read", false);
      }
      throw error;
    }
  });

  app.patch("/api/v1/profiles/:profileId/taste", (request, reply) => {
    const parsed = updateTasteOverridesRequestSchema.safeParse({
      params: request.params,
      body: request.body,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "TASTE_VALIDATION_FAILED",
        "Taste overrides are invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return tasteResponseSchema.parse(
        taste.updateOverrides(parsed.data.params.profileId, parsed.data.body),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (
        error instanceof ProfileDataError ||
        error instanceof TasteDataError ||
        error instanceof TasteNotFoundError
      ) {
        return sendApiError(reply, 500, "TASTE_UNREADABLE", "Taste could not be read", false);
      }
      throw error;
    }
  });

  app.post("/api/v1/profiles/:profileId/feedback-events", (request, reply) => {
    const parsed = createFeedbackRequestSchema.safeParse({
      params: request.params,
      headers: {
        "idempotency-key": request.headers["idempotency-key"],
      },
      body: request.body,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "FEEDBACK_VALIDATION_FAILED",
        "Feedback request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      const result = feedback.create(
        parsed.data.params.profileId,
        parsed.data.body,
        parsed.data.headers["idempotency-key"],
      );
      if (result.created) {
        eventHub.publish(
          feedbackPersistedEventSchema.parse({
            eventId: randomUUID(),
            eventType: "feedback.persisted",
            version: 1,
            profileId: parsed.data.params.profileId,
            correlationId: parsed.data.params.profileId,
            sequence: result.projection.sourceVersion,
            occurredAt: result.event.createdAt,
            payload: result.event,
          }),
        );
      }
      return reply.status(201).send(feedbackEventSchema.parse(result.event));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof FeedbackTargetNotFoundError) {
        return sendApiError(
          reply,
          404,
          "FEEDBACK_TARGET_NOT_FOUND",
          "Feedback target was not found",
          false,
        );
      }
      if (
        error instanceof ProfileDataError ||
        error instanceof FeedbackDataError ||
        error instanceof TasteDataError ||
        error instanceof TasteNotFoundError
      ) {
        return sendApiError(
          reply,
          500,
          "FEEDBACK_WRITE_FAILED",
          "Feedback could not be stored",
          true,
        );
      }
      return sendApiError(
        reply,
        500,
        "FEEDBACK_WRITE_FAILED",
        "Feedback could not be stored",
        true,
      );
    }
  });

  app.post("/api/v1/profiles/:profileId/music-searches", async (request, reply) => {
    const parsed = musicSearchRequestSchema.safeParse({
      params: request.params,
      body: request.body,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "MUSIC_SEARCH_VALIDATION_FAILED",
        "Music search request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return musicSearchResponseSchema.parse(await library.search(parsed.data.body.keyword));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof MusicProviderResponseError) {
        return sendApiError(
          reply,
          502,
          "MUSIC_PROVIDER_RESPONSE_INVALID",
          "Music provider returned an invalid response",
          true,
        );
      }
      if (error instanceof MusicProviderUnavailableError) {
        return sendApiError(
          reply,
          503,
          "MUSIC_PROVIDER_UNAVAILABLE",
          "Music provider is unavailable",
          true,
        );
      }
      throw error;
    }
  });

  app.post("/api/v1/profiles/:profileId/library-items", (request, reply) => {
    const parsed = createLibraryItemRequestSchema.safeParse({
      params: request.params,
      headers: {
        "idempotency-key": request.headers["idempotency-key"],
      },
      body: request.body,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "LIBRARY_ITEM_VALIDATION_FAILED",
        "Library item request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return reply
        .status(201)
        .send(
          libraryItemSchema.parse(
            library.addItem(
              parsed.data.params.profileId,
              parsed.data.body.trackId,
              parsed.data.headers["idempotency-key"],
            ),
          ),
        );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof LibraryTrackNotFoundError) {
        return sendApiError(
          reply,
          404,
          "MUSIC_TRACK_NOT_FOUND",
          "Music track was not found",
          false,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/library", (request, reply) => {
    const parsed = libraryListRequestSchema.safeParse({
      params: request.params,
      query: request.query,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "LIBRARY_LIST_VALIDATION_FAILED",
        "Library list request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return libraryListResponseSchema.parse(
        library.list(
          parsed.data.params.profileId,
          parsed.data.query.cursor,
          parsed.data.query.limit,
        ),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof LibraryCursorError) {
        return sendApiError(
          reply,
          400,
          "LIBRARY_CURSOR_INVALID",
          "Library cursor is invalid",
          false,
        );
      }
      if (error instanceof LibraryDataError) {
        return sendApiError(reply, 500, "LIBRARY_UNREADABLE", "Library could not be read", false);
      }
      throw error;
    }
  });

  app.post("/api/v1/profiles/:profileId/playlist-imports", (request, reply) => {
    const parsed = importPlaylistRequestSchema.safeParse({
      params: request.params,
      headers: {
        "idempotency-key": request.headers["idempotency-key"],
      },
      body: request.body,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PLAYLIST_IMPORT_VALIDATION_FAILED",
        "Playlist import request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      const snapshot = library.importPlaylist(
        parsed.data.params.profileId,
        parsed.data.body.playlistRef,
        parsed.data.headers["idempotency-key"],
      );
      return reply.status(202).send(jobAcceptedResponseSchema.parse({ jobId: snapshot.jobId }));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/playlist-imports/:jobId", (request, reply) => {
    const parsed = playlistImportSnapshotRequestSchema.safeParse({
      params: request.params,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "PLAYLIST_IMPORT_VALIDATION_FAILED",
        "Playlist import request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return playlistImportSnapshotSchema.parse(
        library.getImport(parsed.data.params.profileId, parsed.data.params.jobId),
      );
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof PlaylistImportNotFoundError) {
        return sendApiError(
          reply,
          404,
          "PLAYLIST_IMPORT_NOT_FOUND",
          "Playlist import was not found",
          false,
        );
      }
      if (error instanceof LibraryDataError) {
        return sendApiError(reply, 500, "LIBRARY_UNREADABLE", "Library could not be read", false);
      }
      throw error;
    }
  });

  app.get("/api/v1/profiles/:profileId/tracks/:trackId/lyrics", async (request, reply) => {
    const parsed = trackLyricsRequestSchema.safeParse({
      params: request.params,
    });
    if (!parsed.success) {
      return sendApiError(
        reply,
        400,
        "TRACK_LYRICS_VALIDATION_FAILED",
        "Track lyrics request is invalid",
        false,
      );
    }

    try {
      profiles.get(parsed.data.params.profileId);
      return trackLyricsSchema.parse(await library.getLyrics(parsed.data.params.trackId));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
      }
      if (error instanceof LibraryTrackNotFoundError) {
        return sendApiError(
          reply,
          404,
          "MUSIC_TRACK_NOT_FOUND",
          "Music track was not found",
          false,
        );
      }
      if (error instanceof MusicProviderResponseError) {
        return sendApiError(
          reply,
          502,
          "MUSIC_PROVIDER_RESPONSE_INVALID",
          "Music provider returned an invalid response",
          true,
        );
      }
      if (error instanceof MusicProviderUnavailableError) {
        return sendApiError(
          reply,
          503,
          "MUSIC_PROVIDER_UNAVAILABLE",
          "Music provider is unavailable",
          true,
        );
      }
      throw error;
    }
  });

  app.post(
    "/api/v1/profiles/:profileId/tracks/:trackId/audio-resolutions",
    async (request, reply) => {
      const parsed = audioResolutionRequestSchema.safeParse({
        params: request.params,
      });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "AUDIO_RESOLUTION_VALIDATION_FAILED",
          "Audio resolution request is invalid",
          false,
        );
      }

      try {
        profiles.get(parsed.data.params.profileId);
        reply.header("Cache-Control", "no-store");
        return audioResolutionSchema.parse(await library.resolveAudio(parsed.data.params.trackId));
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
        }
        if (error instanceof LibraryTrackNotFoundError) {
          return sendApiError(
            reply,
            404,
            "MUSIC_TRACK_NOT_FOUND",
            "Music track was not found",
            false,
          );
        }
        if (error instanceof MusicProviderResponseError) {
          return sendApiError(
            reply,
            502,
            "MUSIC_PROVIDER_RESPONSE_INVALID",
            "Music provider returned an invalid response",
            true,
          );
        }
        if (error instanceof MusicProviderUnavailableError) {
          return sendApiError(
            reply,
            503,
            "MUSIC_PROVIDER_UNAVAILABLE",
            "Music provider is unavailable",
            true,
          );
        }
        throw error;
      }
    },
  );

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
