import { randomBytes } from "node:crypto";

import type { SessionBootstrapResponse } from "@koradio/contracts";

const sessionLifetimeMs = 5 * 60 * 1000;

export interface SessionState {
  bootstrap: SessionBootstrapResponse;
  isValid(accessToken: string, now?: Date): boolean;
}

export function createSessionState(now: Date = new Date()): SessionState {
  const accessToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + sessionLifetimeMs);

  return {
    bootstrap: {
      accessToken,
      expiresAt: expiresAt.toISOString(),
    },
    isValid(candidate, validationTime = new Date()) {
      return candidate === accessToken && validationTime.getTime() < expiresAt.getTime();
    },
  };
}
