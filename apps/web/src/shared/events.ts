import type { V1Event } from "@koradio/contracts";

export interface AppEventBus {
  publish: (event: V1Event) => void;
  subscribe: (listener: (event: V1Event) => void) => () => void;
}

export function createAppEventBus(): AppEventBus {
  const listeners = new Set<(event: V1Event) => void>();

  return {
    publish: (event) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
