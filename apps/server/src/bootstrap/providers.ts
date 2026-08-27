import {
  createCodexAdapter,
  createDeepseekAdapter,
  createMockCodexProvider,
  createMockTtsProvider,
  createNetEaseAdapter,
  createTtsAdapter,
  TtsAdapterError,
  type ClosableTtsProvider,
  type TtsModelService,
} from "../integrations/index.js";
import type { DeepseekCredentialService } from "../modules/device-settings/deepseek-credentials.js";
import type { DailyMixPlannerProvider } from "../modules/daily-mixes/index.js";
import type { DeviceSettingsService } from "../modules/device-settings/index.js";
import { createMockMusicProvider, type MusicProvider } from "../modules/library/index.js";
import type { ProgramPlannerProvider } from "../modules/programs/index.js";
import type { PlannerReadinessTarget } from "../modules/programs/readiness-service.js";
import type { RadioAssistantProvider } from "../modules/radio/index.js";
import type { LocalFileStore } from "../platform/files/index.js";
import type { SafeLogger } from "../platform/logging/index.js";

import type { RuntimeConfig } from "./config.js";

export interface RuntimeProviders {
  planner: () => ProgramPlannerProvider & DailyMixPlannerProvider;
  plannerFor(target: PlannerReadinessTarget): ProgramPlannerProvider & DailyMixPlannerProvider;
  radioAssistant: () => RadioAssistantProvider;
  music: MusicProvider;
  tts: ClosableTtsProvider;
  close(): Promise<void>;
}

export interface CreateRuntimeProvidersOptions {
  config: RuntimeConfig;
  deviceSettings: Pick<DeviceSettingsService, "get">;
  deepseekCredentials: Pick<DeepseekCredentialService, "get">;
  fileStore: LocalFileStore;
  modelService: TtsModelService;
  logger?: Pick<SafeLogger, "warn">;
}

function createTextOnlyTtsProvider(): ClosableTtsProvider {
  return {
    synthesize() {
      return Promise.reject(new TtsAdapterError("helper_unavailable"));
    },
    close() {
      return Promise.resolve();
    },
  };
}

export function createRuntimeProviders(options: CreateRuntimeProvidersOptions): RuntimeProviders {
  if (options.config.providerMode === "mock") {
    const assistant = createMockCodexProvider();
    return {
      planner: () => assistant,
      plannerFor: () => assistant,
      radioAssistant: () => assistant,
      music: createMockMusicProvider(),
      tts: {
        ...createMockTtsProvider(),
        close: () => Promise.resolve(),
      },
      close: () => Promise.resolve(),
    };
  }

  const tts =
    options.config.ttsHelperPath === undefined || options.config.ttsPythonPath === undefined
      ? createTextOnlyTtsProvider()
      : createTtsAdapter({
          fileStore: options.fileStore,
          helperPath: options.config.ttsHelperPath,
          modelService: options.modelService,
          pythonPath: options.config.ttsPythonPath,
          runtimeDirectory: options.config.dataRoot,
        });
  const createCodex = (target: PlannerReadinessTarget) =>
    createCodexAdapter({
      command: target.codexCommand ?? "",
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      runtimeDirectory: options.config.dataRoot,
    });
  const createDeepseek = (target: PlannerReadinessTarget) =>
    createDeepseekAdapter({
      apiKey: () => options.deepseekCredentials.get(),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      model: target.deepseekModel,
    });
  const plannerFor = (
    target: PlannerReadinessTarget,
  ): ProgramPlannerProvider & DailyMixPlannerProvider =>
    target.plannerProvider === "deepseek" ? createDeepseek(target) : createCodex(target);
  const planner = (): ProgramPlannerProvider & DailyMixPlannerProvider =>
    plannerFor(options.deviceSettings.get());
  return {
    planner,
    plannerFor,
    radioAssistant: () => {
      const target = options.deviceSettings.get();
      return target.plannerProvider === "deepseek" ? createDeepseek(target) : createCodex(target);
    },
    music: createNetEaseAdapter(),
    tts,
    close: () => tts.close(),
  };
}
