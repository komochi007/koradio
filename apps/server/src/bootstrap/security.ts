import { randomUUID } from "node:crypto";

import { errorEnvelopeSchema, type ErrorEnvelope } from "@koradio/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { SessionState, SessionValidation } from "./session.js";

const bootstrapPath = "/api/v1/session/bootstrap";
const eventsPath = "/api/v1/events";
const sessionQueryKeys = new Set([
  "access_token",
  "accesstoken",
  "authorization",
  "session",
  "session_token",
  "sessiontoken",
  "token",
]);

export interface ApiSecurityOptions {
  allowedOrigins: ReadonlySet<string>;
  session: SessionState;
}

interface SecurityFailure {
  code:
    | "ORIGIN_NOT_ALLOWED"
    | "SESSION_EXPIRED"
    | "SESSION_INVALID"
    | "SESSION_REQUIRED"
    | "SESSION_TOKEN_TRANSPORT_NOT_ALLOWED"
    | "SESSION_TOKEN_URL_NOT_ALLOWED";
  message: string;
  retryable: boolean;
  statusCode: 400 | 401 | 403;
}

function createErrorEnvelope(failure: SecurityFailure): ErrorEnvelope {
  return errorEnvelopeSchema.parse({
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    correlationId: randomUUID(),
  });
}

function sendSecurityFailure(reply: FastifyReply, failure: SecurityFailure): void {
  const envelope = createErrorEnvelope(failure);
  reply.header("Cache-Control", "no-store");
  reply.header("X-Correlation-Id", envelope.correlationId);
  if (failure.statusCode === 401) {
    reply.header("WWW-Authenticate", "Bearer");
  }

  void reply.code(failure.statusCode).send(envelope);
}

function requestPath(request: FastifyRequest): string {
  return new URL(request.raw.url ?? request.url, "http://koradio.invalid").pathname;
}

function hasSessionTokenInUrl(request: FastifyRequest): boolean {
  const url = new URL(request.raw.url ?? request.url, "http://koradio.invalid");
  for (const key of url.searchParams.keys()) {
    if (sessionQueryKeys.has(key.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (origin === undefined || origin.length === 0 || origin === "null") {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.pathname === "/" &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0 &&
      origin === parsed.origin &&
      allowedOrigins.has(parsed.origin)
    );
  } catch {
    return false;
  }
}

function validateOrigin(
  request: FastifyRequest,
  allowedOrigins: ReadonlySet<string>,
  required: boolean,
): SecurityFailure | undefined {
  const origin = request.headers.origin;
  if (origin !== undefined) {
    return isAllowedOrigin(origin, allowedOrigins)
      ? undefined
      : {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Origin is not allowed",
          retryable: false,
          statusCode: 403,
        };
  }

  const fetchSite = request.headers["sec-fetch-site"];
  if (required || fetchSite === "cross-site") {
    return {
      code: "ORIGIN_NOT_ALLOWED",
      message: "Origin is not allowed",
      retryable: false,
      statusCode: 403,
    };
  }

  return undefined;
}

function parseBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }

  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
  return match?.[1];
}

function mapSessionValidation(validation: SessionValidation): SecurityFailure | undefined {
  if (validation.status === "valid") {
    return undefined;
  }

  return validation.status === "expired"
    ? {
        code: "SESSION_EXPIRED",
        message: "Local session expired",
        retryable: true,
        statusCode: 401,
      }
    : {
        code: "SESSION_INVALID",
        message: "Local session is invalid",
        retryable: true,
        statusCode: 401,
      };
}

export function enforceApiSecurity(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ApiSecurityOptions,
): boolean {
  const path = requestPath(request);
  if ((path !== "/api/v1" && !path.startsWith("/api/v1/")) || request.method === "OPTIONS") {
    return true;
  }

  if (hasSessionTokenInUrl(request)) {
    sendSecurityFailure(reply, {
      code: "SESSION_TOKEN_URL_NOT_ALLOWED",
      message: "Session token is not allowed in URLs",
      retryable: false,
      statusCode: 400,
    });
    return false;
  }

  const usesFirstMessageAuthentication = path === eventsPath;
  const isBootstrap = path === bootstrapPath;
  const transportHeaderNotAllowed =
    (isBootstrap || usesFirstMessageAuthentication) && request.headers.authorization !== undefined;

  if (transportHeaderNotAllowed) {
    sendSecurityFailure(reply, {
      code: "SESSION_TOKEN_TRANSPORT_NOT_ALLOWED",
      message: "Session token used an unsupported transport",
      retryable: false,
      statusCode: 400,
    });
    return false;
  }

  const originFailure = validateOrigin(
    request,
    options.allowedOrigins,
    isBootstrap || usesFirstMessageAuthentication || !["GET", "HEAD"].includes(request.method),
  );
  if (originFailure !== undefined) {
    sendSecurityFailure(reply, originFailure);
    return false;
  }

  if (isBootstrap || usesFirstMessageAuthentication) {
    return true;
  }

  const accessToken = parseBearerToken(request.headers.authorization);
  if (accessToken === undefined) {
    sendSecurityFailure(reply, {
      code: "SESSION_REQUIRED",
      message: "Local session is required",
      retryable: true,
      statusCode: 401,
    });
    return false;
  }

  const sessionFailure = mapSessionValidation(options.session.validate(accessToken));
  if (sessionFailure !== undefined) {
    sendSecurityFailure(reply, sessionFailure);
    return false;
  }

  return true;
}
