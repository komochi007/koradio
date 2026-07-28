import {
  createCodexAdapter,
  createMockCodexProvider,
  createMockTtsProvider,
  createNetEaseAdapter,
  createTtsAdapter,
  TtsAdapterError,
  type ClosableTtsProvider,
  type TtsModelService,
} from "../integrations/index.js";
import type { DeviceSettingsService } from "../modules/device-settings/index.js";
import { createMockMusicProvider, type MusicProvider } from "../modules/library/index.js";
import type { CodexProvider } from "../modules/programs/index.js";
import type { LocalFileStore } from "../platform/files/index.js";

import type { RuntimeConfig } from "./config.js";

export interface RuntimeProviders {
  codex: CodexProvider;
  music: MusicProvider;
  tts: ClosableTtsProvider;
  close(): Promise<void>;
}

export interface CreateRuntimeProvidersOptions {
  config: RuntimeConfig;
  deviceSettings: Pick<DeviceSettingsService, "get">;
  fileStore: LocalFileStore;
  modelService: TtsModelService;
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
    return {
      codex: createMockCodexProvider(),
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
  return {
    codex: createCodexAdapter({
      command: () => options.deviceSettings.get().codexCommand ?? "",
      runtimeDirectory: options.config.dataRoot,
    }),
    music: createNetEaseAdapter(),
    tts,
    close: () => tts.close(),
  };
}
