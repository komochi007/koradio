import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { SessionBootstrapResponse } from "@koradio/contracts";

const defaultSessionLifetimeMs = 5 * 60 * 1000;
const tokenVersion = "v1";
const tokenPartPattern = /^[A-Za-z0-9_-]+$/;

export type SessionValidation =
  { status: "valid"; expiresAt: string } | { status: "expired" } | { status: "invalid" };

export interface SessionState {
  issue(): SessionBootstrapResponse;
  validate(accessToken: string): SessionValidation;
}

export interface CreateSessionStateOptions {
  clock?: () => Date;
  lifetimeMs?: number;
  processSecret?: Uint8Array;
}

function createSignature(processSecret: Uint8Array, unsignedToken: string): string {
  return createHmac("sha256", processSecret).update(unsignedToken).digest("base64url");
}

function signaturesMatch(expected: string, received: string): boolean {
  if (!tokenPartPattern.test(received)) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "base64url");
  const receivedBytes = Buffer.from(received, "base64url");
  return (
    expectedBytes.byteLength === receivedBytes.byteLength &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export function createSessionState(options: CreateSessionStateOptions = {}): SessionState {
  const clock = options.clock ?? (() => new Date());
  const lifetimeMs = options.lifetimeMs ?? defaultSessionLifetimeMs;
  const processSecret = options.processSecret ?? randomBytes(32);

  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0) {
    throw new TypeError("Session lifetime must be a positive safe integer");
  }
  if (processSecret.byteLength < 32) {
    throw new TypeError("Session process secret must contain at least 32 bytes");
  }

  return {
    issue() {
      const expiresAt = new Date(clock().getTime() + lifetimeMs);
      const expiresAtPart = expiresAt.getTime().toString(36);
      const nonce = randomBytes(18).toString("base64url");
      const unsignedToken = `${tokenVersion}.${expiresAtPart}.${nonce}`;
      const signature = createSignature(processSecret, unsignedToken);

      return {
        accessToken: `${unsignedToken}.${signature}`,
        expiresAt: expiresAt.toISOString(),
      };
    },
    validate(accessToken) {
      const parts = accessToken.split(".");
      if (parts.length !== 4) {
        return { status: "invalid" };
      }

      const [version, expiresAtPart, nonce, receivedSignature] = parts;
      if (
        version !== tokenVersion ||
        expiresAtPart === undefined ||
        nonce === undefined ||
        receivedSignature === undefined ||
        !tokenPartPattern.test(expiresAtPart) ||
        !tokenPartPattern.test(nonce)
      ) {
        return { status: "invalid" };
      }

      const expiresAtMs = Number.parseInt(expiresAtPart, 36);
      if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= 0) {
        return { status: "invalid" };
      }

      const unsignedToken = `${version}.${expiresAtPart}.${nonce}`;
      const expectedSignature = createSignature(processSecret, unsignedToken);
      if (!signaturesMatch(expectedSignature, receivedSignature)) {
        return { status: "invalid" };
      }
      if (clock().getTime() >= expiresAtMs) {
        return { status: "expired" };
      }

      return {
        status: "valid",
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    },
  };
}
