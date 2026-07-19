import { useSyncExternalStore } from "react";

import type { AudioEngineFacade, AudioEngineSnapshot } from "./types.js";

export function useAudioSnapshot(engine: AudioEngineFacade): AudioEngineSnapshot {
  return useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.getSnapshot(),
    () => engine.getSnapshot(),
  );
}
