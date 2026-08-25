import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import {
  audioResolutionRequestSchema,
  audioResolutionSchema,
  createFeedbackRequestSchema,
  clearRadioConversationRequestSchema,
  createRadioTurnRequestSchema,
  createRadioSpeechGenerationRequestSchema,
  createLibraryItemRequestSchema,
  createProfileRequestSchema,
  currentProgramResponseSchema,
  activeProgramGenerationRequestSchema,
  activeProgramGenerationResponseSchema,
  activateProgramHandoffRequestSchema,
  djScriptSegmentSchema,
  currentProfileResponseSchema,
  programHandoffResponseSchema,
  deleteProgramResponseSchema,
  feedbackEventSchema,
  feedbackPersistedEventSchema,
  generateProgramRequestSchema,
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
  programDeletedEventSchema,
  programGenerationSnapshotRequestSchema,
  programGenerationSnapshotSchema,
  programListRequestSchema,
  programListResponseSchema,
  profileAvatarUploadResponseSchema,
  profileIdParamsSchema,
  radioConversationRequestSchema,
  revealDjScriptRequestSchema,
  radioConversationSchema,
  radioSpeechGenerationSchema,
  radioSpeechGenerationSnapshotRequestSchema,
  radioTurnSchema,
  radioTurnSnapshotRequestSchema,
  profileListResponseSchema,
  profileSchema,
  selectCurrentProfileRequestSchema,
  savePlaybackCheckpointRequestSchema,
  trackLyricsRequestSchema,
  trackLyricsSchema,
  tasteResponseSchema,
  importPlaylistRequestSchema,
  jobAcceptedResponseSchema,
  updateProfileRequestSchema,
  updateProfilePreferencesRequestSchema,
  updateTasteOverridesRequestSchema,
} from "@koradio/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import {
  createDataRootMigrationService,
  type DataRootMigrationRuntimeCoordinator,
  type DataRootRestartRequest,
} from "../modules/device-settings/data-root-migration.js";
import { createDeepseekCredentialService } from "../modules/device-settings/deepseek-credentials.js";
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
  ProgramHandoffNotFoundError,
  ProgramDeletionError,
  ProgramNotFoundError,
  ProgramWriteError,
  createProgramGenerationRepository,
  createProgramGenerationService,
  createPlannerReadinessService,
  createProgramDeletionService,
  createProgramRepository,
  createProgramService,
  type CodexProvider,
  type ProgramPlannerProvider,
  type TtsProvider,
} from "../modules/programs/index.js";
import {
  RadioTurnNotFoundError,
  RadioTurnUnavailableError,
  RadioSpeechGenerationNotFoundError,
  RadioSpeechMessageNotFoundError,
  createRadioService,
  createRadioSpeechRepository,
  createRadioSpeechService,
  createRadioTurnRepository,
  type RadioAssistantProvider,
} from "../modules/radio/index.js";
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
  TasteWriteError,
  createPersonalTasteBlueprint,
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
import { createMacOsKeychainSecretStore, type SecretStore } from "../platform/secrets/index.js";
import { createTtsModelService, type TtsModelService } from "../integrations/tts-model.js";
import { createAllowedOrigins, type RuntimeConfig } from "./config.js";
import { createRuntimeProviders } from "./providers.js";
import { sendApiError } from "./routes/api-error.js";
import { createHealthSettingsRoutes } from "./routes/health-settings.js";
import { createMediaRoutes } from "./routes/media.js";
import { createSessionEventRoutes } from "./routes/session-events.js";
import { createStaticPageRoutes } from "./routes/static-pages.js";
import { enforceApiSecurity, isAllowedOrigin } from "./security.js";
import { createSessionState, type SessionState } from "./session.js";
import type { SafeLogger } from "../platform/logging/index.js";

const liveProviderGenerationTimeoutMs = 6 * 60_000;

export interface CreateAppOptions {
  config: RuntimeConfig;
  selectedPort: number;
  migrationRuntimeCoordinator?: DataRootMigrationRuntimeCoordinator;
  profileSwitchRuntimeCoordinator?: ProfileSwitchRuntimeCoordinator;
  musicProvider?: MusicProvider;
  codexProvider?: CodexProvider;
  plannerProvider?: ProgramPlannerProvider;
  programMaximumTracks?: number;
  radioAssistantProvider?: RadioAssistantProvider;
  generationTimeoutMs?: number;
  logger?: Pick<SafeLogger, "warn">;
  programFeedbackTargets?: Pick<FeedbackTargetResolver, "programExists">;
  requestRestart?: (request: DataRootRestartRequest) => Promise<void>;
  secretStore?: SecretStore;
  session?: SessionState;
  ttsModelService?: TtsModelService;
  ttsProvider?: TtsProvider;
  webSocketAuthenticationTimeoutMs?: number;
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      error !== null &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return sendApiError(
        reply,
        statusCode,
        statusCode === 413 ? "REQUEST_TOO_LARGE" : "REQUEST_INVALID",
        statusCode === 413 ? "Request is too large" : "Request is invalid",
        false,
      );
    }

    return sendApiError(
      reply,
      500,
      "INTERNAL_SERVER_ERROR",
      "Request could not be completed",
      true,
    );
  });
  const database = await bootstrapDatabase({ dataRoot: options.config.dataRoot });
  const bootstrapPath =
    options.config.dataRootBootstrapPath ??
    resolveDataRootBootstrapPath(options.config.initialDataRoot ?? options.config.dataRoot);
  const deviceSettings = createDeviceSettingsService({
    client: database.client,
    dataRoot: options.config.dataRoot,
  });
  deviceSettings.initialize();
  const deepseekCredentials = createDeepseekCredentialService({
    secretStore: options.secretStore ?? createMacOsKeychainSecretStore(),
  });
  await deepseekCredentials.refresh();
  const profilePreferences = createProfilePreferencesService({ client: database.client });
  const tasteDefaults = createTasteDefaultsService(database.client);
  const tasteRepository = createTasteRepository(database.client);
  const taste = createTasteService({ repository: tasteRepository });
  const fileStore = createLocalFileStore({ dataRoot: options.config.dataRoot });
  const ttsModelService =
    options.ttsModelService ??
    (await createTtsModelService({
      dataRoot: options.config.dataRoot,
    }));
  const avatarUpload = createAvatarUploadService(fileStore);
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
  const runtimeProviders = createRuntimeProviders({
    config: options.config,
    deepseekCredentials,
    deviceSettings,
    fileStore,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    modelService: ttsModelService,
  });
  const library = createLibraryService({
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    originMode: options.config.providerMode,
    provider: options.musicProvider ?? runtimeProviders.music,
    repository: createLibraryRepository(database.client),
  });
  const playbackRepository = createPlaybackRepository(database.client);
  const playbackTimeline = createPlaybackTimelineService(playbackRepository);
  const programRepository = createProgramRepository(database.client);
  const programs = createProgramService({
    client: database.client,
    repository: programRepository,
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
    plannerConfigured: () => {
      const settings = deviceSettings.get();
      return settings.plannerProvider === "codex"
        ? settings.codexCommand !== null
        : options.config.providerMode === "mock" || deepseekCredentials.isConfigured();
    },
    ttsEnabled: () =>
      options.config.providerMode === "mock" ||
      options.ttsProvider !== undefined ||
      (options.config.ttsHelperPath !== undefined &&
        options.config.ttsPythonPath !== undefined &&
        ttsModelService.getStatus().state === "ready"),
  });
  const eventHub = createEventHub();
  const programDeletion = createProgramDeletionService({
    client: database.client,
    fileStore,
    programs,
    repository: programRepository,
  });
  await programDeletion.retryPendingCleanup();
  const programGeneration = createProgramGenerationService({
    ...(options.codexProvider === undefined ? {} : { codex: options.codexProvider }),
    events: eventHub,
    library,
    ...(options.programMaximumTracks === undefined
      ? {}
      : { maximumTracks: options.programMaximumTracks }),
    preferences: profilePreferences,
    programs,
    originMode: options.config.providerMode,
    repository: createProgramGenerationRepository(database.client),
    planner: options.plannerProvider ?? options.codexProvider ?? runtimeProviders.planner,
    taste,
    ...(options.generationTimeoutMs === undefined
      ? options.config.providerMode === "live"
        ? { timeoutMs: liveProviderGenerationTimeoutMs }
        : {}
      : { timeoutMs: options.generationTimeoutMs }),
    tts: options.ttsProvider ?? runtimeProviders.tts,
  });
  const plannerReadiness = createPlannerReadinessService({
    context: {
      library,
      now: () => new Date(),
      preferences: profilePreferences,
      programs,
      taste,
    },
    planner:
      options.plannerProvider === undefined && options.codexProvider === undefined
        ? (target) => runtimeProviders.plannerFor(target ?? deviceSettings.get())
        : () => (options.plannerProvider ?? options.codexProvider) as ProgramPlannerProvider,
    profileId: async () => (await profileContext.getCurrent()).current?.profile.id ?? null,
  });
  const radio = createRadioService({
    assistant: options.radioAssistantProvider ?? runtimeProviders.radioAssistant,
    currentProgram: programs,
    library,
    programs: programGeneration,
    repository: createRadioTurnRepository(database.client),
  });
  const radioSpeech = createRadioSpeechService({
    preferences: profilePreferences,
    repository: createRadioSpeechRepository(database.client),
    tts: options.ttsProvider ?? runtimeProviders.tts,
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
    await radioSpeech.close();
    await library.close();
    await runtimeProviders.close();
    await ttsModelService.close();
    database.close();
  });

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || isAllowedOrigin(origin, allowedOrigins));
    },
    methods: ["GET", "PATCH", "POST", "PUT", "DELETE", "OPTIONS"],
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

  await app.register(
    createMediaRoutes({
      fileStore,
      providerMode: options.config.providerMode,
    }),
  );

  await app.register(async (app) => {
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
          return sendApiError(
            reply,
            413,
            "AVATAR_FILE_TOO_LARGE",
            "Avatar file is too large",
            false,
          );
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
    await app.after();
  });

  await app.register(async (app) => {
    app.post("/api/v1/profiles/:profileId/radio-turns", async (request, reply) => {
      const parsed = createRadioTurnRequestSchema.safeParse({
        params: request.params,
        headers: { "idempotency-key": request.headers["idempotency-key"] },
        body: request.body,
      });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "RADIO_TURN_VALIDATION_FAILED",
          "Radio message is invalid",
          false,
        );
      }
      try {
        profiles.get(parsed.data.params.profileId);
        const turn = await radio.create(
          parsed.data.params.profileId,
          parsed.data.body,
          parsed.data.headers["idempotency-key"],
        );
        return await reply.status(201).send(radioTurnSchema.parse(turn));
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
        if (error instanceof RadioTurnUnavailableError) {
          return sendApiError(reply, 503, "RADIO_TURN_UNAVAILABLE", "DJ could not respond", true);
        }
        throw error;
      }
    });

    app.get("/api/v1/profiles/:profileId/radio-turns/:turnId", (request, reply) => {
      const parsed = radioTurnSnapshotRequestSchema.safeParse({ params: request.params });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "RADIO_TURN_VALIDATION_FAILED",
          "Radio turn is invalid",
          false,
        );
      }
      try {
        profiles.get(parsed.data.params.profileId);
        return radioTurnSchema.parse(
          radio.get(parsed.data.params.profileId, parsed.data.params.turnId),
        );
      } catch (error) {
        if (error instanceof ProfileNotFoundError || error instanceof RadioTurnNotFoundError) {
          return sendApiError(
            reply,
            404,
            "RADIO_TURN_NOT_FOUND",
            "Radio turn was not found",
            false,
          );
        }
        throw error;
      }
    });

    app.post(
      "/api/v1/profiles/:profileId/radio-messages/:messageId/speech-generations",
      (request, reply) => {
        const parsed = createRadioSpeechGenerationRequestSchema.safeParse({
          params: request.params,
          headers: { "idempotency-key": request.headers["idempotency-key"] },
        });
        if (!parsed.success) {
          return sendApiError(
            reply,
            400,
            "RADIO_SPEECH_VALIDATION_FAILED",
            "Speech request is invalid",
            false,
          );
        }
        try {
          profiles.get(parsed.data.params.profileId);
          const snapshot = radioSpeech.start(
            parsed.data.params.profileId,
            parsed.data.params.messageId,
            parsed.data.headers["idempotency-key"],
          );
          return reply.status(202).send(jobAcceptedResponseSchema.parse({ jobId: snapshot.jobId }));
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
          }
          if (error instanceof RadioSpeechMessageNotFoundError) {
            return sendApiError(
              reply,
              404,
              "RADIO_MESSAGE_NOT_FOUND",
              "Radio message was not found",
              false,
            );
          }
          throw error;
        }
      },
    );

    app.get("/api/v1/profiles/:profileId/radio-speech-generations/:jobId", (request, reply) => {
      const parsed = radioSpeechGenerationSnapshotRequestSchema.safeParse({
        params: request.params,
      });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "RADIO_SPEECH_VALIDATION_FAILED",
          "Speech request is invalid",
          false,
        );
      }
      try {
        profiles.get(parsed.data.params.profileId);
        return radioSpeechGenerationSchema.parse(
          radioSpeech.get(parsed.data.params.profileId, parsed.data.params.jobId),
        );
      } catch (error) {
        if (
          error instanceof ProfileNotFoundError ||
          error instanceof RadioSpeechGenerationNotFoundError
        ) {
          return sendApiError(
            reply,
            404,
            "RADIO_SPEECH_NOT_FOUND",
            "Speech generation was not found",
            false,
          );
        }
        throw error;
      }
    });

    app.get("/api/v1/profiles/:profileId/radio-conversation", (request, reply) => {
      const parsed = radioConversationRequestSchema.safeParse({ params: request.params });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "RADIO_CONVERSATION_VALIDATION_FAILED",
          "Profile is invalid",
          false,
        );
      }
      try {
        profiles.get(parsed.data.params.profileId);
        return radioConversationSchema.parse(radio.list(parsed.data.params.profileId));
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
        }
        throw error;
      }
    });

    app.delete("/api/v1/profiles/:profileId/radio-conversation", (request, reply) => {
      const parsed = clearRadioConversationRequestSchema.safeParse({
        params: request.params,
        body: request.body,
      });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "RADIO_CONVERSATION_CONFIRMATION_REQUIRED",
          "Confirmation is required",
          false,
        );
      }
      try {
        profiles.get(parsed.data.params.profileId);
        radio.clear(parsed.data.params.profileId);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
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

    app.get("/api/v1/profiles/:profileId/program-generations/active", (request, reply) => {
      const parsed = activeProgramGenerationRequestSchema.safeParse({ params: request.params });
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
        return activeProgramGenerationResponseSchema.parse({
          active: programGeneration.active(parsed.data.params.profileId),
        });
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
        }
        if (error instanceof ProgramGenerationDataError) {
          return sendApiError(
            reply,
            500,
            "PROGRAM_GENERATION_UNAVAILABLE",
            "Program generation could not be read",
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
          return sendApiError(
            reply,
            500,
            "PROGRAMS_UNREADABLE",
            "Programs could not be read",
            true,
          );
        }
        throw error;
      }
    });

    app.get("/api/v1/profiles/:profileId/programs/current", (request, reply) => {
      const parsed = profileIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "PROGRAM_CURRENT_VALIDATION_FAILED",
          "Current program request is invalid",
          false,
        );
      }
      try {
        profiles.get(parsed.data.profileId);
        return currentProgramResponseSchema.parse({
          program: programs.current(parsed.data.profileId),
        });
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
        }
        if (error instanceof ProgramDataError) {
          return sendApiError(reply, 500, "PROGRAM_UNREADABLE", "Program could not be read", true);
        }
        throw error;
      }
    });

    app.get("/api/v1/profiles/:profileId/program-handoff", (request, reply) => {
      const parsed = profileIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "PROGRAM_HANDOFF_VALIDATION_FAILED",
          "Program handoff request is invalid",
          false,
        );
      }
      try {
        profiles.get(parsed.data.profileId);
        return programHandoffResponseSchema.parse({
          program: programs.pendingHandoff(parsed.data.profileId),
        });
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
        }
        if (error instanceof ProgramDataError) {
          return sendApiError(reply, 500, "PROGRAM_UNREADABLE", "Program could not be read", true);
        }
        throw error;
      }
    });

    app.post(
      "/api/v1/profiles/:profileId/program-handoff/:programId/activate",
      (request, reply) => {
        const parsed = activateProgramHandoffRequestSchema.safeParse({ params: request.params });
        if (!parsed.success) {
          return sendApiError(
            reply,
            400,
            "PROGRAM_HANDOFF_VALIDATION_FAILED",
            "Program handoff request is invalid",
            false,
          );
        }
        try {
          profiles.get(parsed.data.params.profileId);
          return programDetailSchema.parse(
            programs.activateHandoff(parsed.data.params.profileId, parsed.data.params.programId),
          );
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
          }
          if (error instanceof ProgramHandoffNotFoundError) {
            return sendApiError(
              reply,
              409,
              "PROGRAM_HANDOFF_UNAVAILABLE",
              "Program handoff is no longer available",
              false,
            );
          }
          if (error instanceof ProgramDataError || error instanceof ProgramWriteError) {
            return sendApiError(
              reply,
              500,
              "PROGRAM_UNREADABLE",
              "Program could not be read",
              true,
            );
          }
          throw error;
        }
      },
    );

    app.put(
      "/api/v1/profiles/:profileId/programs/:programId/dj-scripts/:segmentId/reveal",
      (request, reply) => {
        const parsed = revealDjScriptRequestSchema.safeParse({ params: request.params });
        if (!parsed.success) {
          return sendApiError(
            reply,
            400,
            "DJ_SCRIPT_REVEAL_VALIDATION_FAILED",
            "DJ script reveal request is invalid",
            false,
          );
        }
        try {
          profiles.get(parsed.data.params.profileId);
          return djScriptSegmentSchema.parse(
            programs.revealDjScript(
              parsed.data.params.profileId,
              parsed.data.params.programId,
              parsed.data.params.segmentId,
            ),
          );
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
          }
          if (error instanceof ProgramNotFoundError) {
            return sendApiError(
              reply,
              404,
              "DJ_SCRIPT_NOT_FOUND",
              "DJ script was not found",
              false,
            );
          }
          if (error instanceof ProgramDataError) {
            return sendApiError(
              reply,
              500,
              "PROGRAM_UNREADABLE",
              "Program could not be read",
              true,
            );
          }
          throw error;
        }
      },
    );

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

    app.delete("/api/v1/profiles/:profileId/programs/:programId", async (request, reply) => {
      const parsed = programDetailRequestSchema.safeParse({ params: request.params });
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "PROGRAM_DELETE_VALIDATION_FAILED",
          "Program delete request is invalid",
          false,
        );
      }
      try {
        profiles.get(parsed.data.params.profileId);
        const result = await programDeletion.delete(
          parsed.data.params.profileId,
          parsed.data.params.programId,
          () => {
            feedback.removeProgramFavoriteForDeletion(
              parsed.data.params.profileId,
              parsed.data.params.programId,
            );
          },
        );
        eventHub.publish(
          programDeletedEventSchema.parse({
            eventId: randomUUID(),
            eventType: "program.deleted",
            version: 1,
            profileId: parsed.data.params.profileId,
            correlationId: parsed.data.params.programId,
            sequence: 0,
            occurredAt: new Date().toISOString(),
            payload: result,
          }),
        );
        return deleteProgramResponseSchema.parse(result);
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
        }
        if (error instanceof ProgramDeletionError) {
          if (!programs.hasProgram(parsed.data.params.profileId, parsed.data.params.programId)) {
            return sendApiError(reply, 404, "PROGRAM_NOT_FOUND", "Program was not found", false);
          }
          return sendApiError(
            reply,
            500,
            "PROGRAM_DELETE_FAILED",
            "Program could not be deleted",
            true,
          );
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
            return sendApiError(
              reply,
              409,
              "PLAYBACK_LEASE_STALE",
              "Playback lease is stale",
              false,
            );
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
    await app.after();
  });

  await app.register(async (app) => {
    app.get("/api/v1/profiles/:profileId/taste", (request, reply) => {
      const parsed = profileIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "TASTE_VALIDATION_FAILED",
          "Taste request is invalid",
          false,
        );
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
        if (error instanceof TasteWriteError) {
          return sendApiError(
            reply,
            500,
            "TASTE_WRITE_FAILED",
            "Taste overrides could not be stored",
            true,
          );
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

    app.post("/api/v1/profiles/:profileId/taste/blueprint", (request, reply) => {
      const parsed = profileIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return sendApiError(
          reply,
          400,
          "TASTE_VALIDATION_FAILED",
          "Taste blueprint request is invalid",
          false,
        );
      }

      try {
        profiles.get(parsed.data.profileId);
        feedback.resetTasteLearning(
          parsed.data.profileId,
          createPersonalTasteBlueprint(parsed.data.profileId, new Date().toISOString()),
        );
        return tasteResponseSchema.parse(taste.get(parsed.data.profileId));
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return sendApiError(reply, 404, "PROFILE_NOT_FOUND", "Profile was not found", false);
        }
        if (error instanceof TasteWriteError) {
          return sendApiError(
            reply,
            500,
            "TASTE_WRITE_FAILED",
            "Taste blueprint could not be stored",
            true,
          );
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
    await app.after();
  });

  await app.register(async (app) => {
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
          return audioResolutionSchema.parse(
            await library.resolveAudio(parsed.data.params.trackId),
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
    await app.after();
  });

  await app.register(
    createHealthSettingsRoutes({
      dataRootMigration,
      deepseekCredentials,
      deviceSettings,
      health,
      plannerReadiness,
      ttsModelService,
    }),
  );

  await app.register(
    createSessionEventRoutes({
      authenticationTimeoutMs: webSocketAuthenticationTimeoutMs,
      eventHub,
      health,
      session,
    }),
  );

  if (options.config.environment === "production") {
    await app.register(createStaticPageRoutes(options.config.webRoot));
  }

  await app.ready();
  return app;
}
