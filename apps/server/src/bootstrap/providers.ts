import {
  createCodexAdapter,
  createMockCodexProvider,
  createMockTtsProvider,
  createNetEaseAdapter,
  createTtsAdapter,
  TtsAdapterError,
} from "../integrations/index.js";
import type { DeviceSettingsService } from "../modules/device-settings/index.js";
import { createMockMusicProvider, type MusicProvider } from "../modules/library/index.js";
import type { CodexProvider, TtsProvider } from "../modules/programs/index.js";
import type { LocalFileStore } from "../platform/files/index.js";

import type { RuntimeConfig } from "./config.js";

export interface RuntimeProviders {
  codex: CodexProvider;
  music: MusicProvider;
  tts: TtsProvider;
}

export interface CreateRuntimeProvidersOptions {
  config: RuntimeConfig;
  deviceSettings: Pick<DeviceSettingsService, "get">;
  fileStore: LocalFileStore;
}

function createTextOnlyTtsProvider(): TtsProvider {
  return {
    synthesize() {
      return Promise.reject(new TtsAdapterError("helper_unavailable"));
    },
  };
}

export function createRuntimeProviders(options: CreateRuntimeProvidersOptions): RuntimeProviders {
  if (options.config.providerMode === "mock") {
    return {
      codex: createMockCodexProvider(),
      music: createMockMusicProvider(),
      tts: createMockTtsProvider(),
    };
  }

  return {
    codex: createCodexAdapter({
      command: () => options.deviceSettings.get().codexCommand ?? "",
      runtimeDirectory: options.config.dataRoot,
    }),
    music: createNetEaseAdapter(),
    tts:
      options.config.ttsHelperPath === undefined
        ? createTextOnlyTtsProvider()
        : createTtsAdapter({
            fileStore: options.fileStore,
            helperPath: options.config.ttsHelperPath,
            runtimeDirectory: options.config.dataRoot,
          }),
  };
}
