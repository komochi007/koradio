import type { V1Event } from "@koradio/contracts";

export interface EventSequenceGuard {
  accept(event: V1Event): boolean;
  reset(): void;
}

export function createEventSequenceGuard(): EventSequenceGuard {
  const latestSequence = new Map<string, number>();

  return {
    accept(event) {
      const current = latestSequence.get(event.correlationId);
      if (current !== undefined && event.sequence <= current) {
        return false;
      }

      latestSequence.set(event.correlationId, event.sequence);
      return true;
    },
    reset() {
      latestSequence.clear();
    },
  };
}
