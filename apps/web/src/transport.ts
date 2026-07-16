import {
  healthResponseSchema,
  serviceHealthChangedEventSchema,
  sessionBootstrapResponseSchema,
  type HealthResponse,
  type SessionBootstrapResponse,
} from "@koradio/contracts";

export interface ServiceConnection {
  close(): void;
}

export interface ServiceTransport {
  connectEvents(
    onHealth: (health: HealthResponse) => void,
    onFailure: () => void,
  ): Promise<ServiceConnection>;
  fetchHealth(): Promise<HealthResponse>;
}

interface MemorySession {
  accessToken: string;
  expiresAtMs: number;
}

function validateLoopbackOrigin(candidate: string): string {
  const url = new URL(candidate);
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";

  if (
    url.protocol !== "http:" ||
    !isLoopback ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new TypeError("Koradio API origin must be an HTTP loopback origin");
  }

  return url.origin;
}

function parseMemorySession(bootstrap: SessionBootstrapResponse): MemorySession {
  const expiresAtMs = Date.parse(bootstrap.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new TypeError("Local session bootstrap returned an expired token");
  }

  return {
    accessToken: bootstrap.accessToken,
    expiresAtMs,
  };
}

export function resolveApiOrigin(): string {
  if (import.meta.env.PROD) {
    return validateLoopbackOrigin(window.location.origin);
  }

  const configuredOrigin: unknown = import.meta.env.VITE_KORADIO_API_ORIGIN;
  return validateLoopbackOrigin(
    typeof configuredOrigin === "string" ? configuredOrigin : "http://127.0.0.1:49373",
  );
}

export function createServiceTransport(candidateOrigin: string): ServiceTransport {
  const apiOrigin = validateLoopbackOrigin(candidateOrigin);
  let session: MemorySession | undefined;

  async function bootstrapSession(): Promise<MemorySession> {
    const response = await fetch(`${apiOrigin}/api/v1/session/bootstrap`, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      throw new Error("Local session bootstrap failed");
    }
    if (!response.headers.get("cache-control")?.toLowerCase().includes("no-store")) {
      throw new Error("Local session bootstrap was cacheable");
    }

    const payload: unknown = await response.json();
    session = parseMemorySession(sessionBootstrapResponseSchema.parse(payload));
    return session;
  }

  async function getSession(forceRefresh = false): Promise<MemorySession> {
    if (!forceRefresh && session !== undefined && session.expiresAtMs > Date.now() + 1_000) {
      return session;
    }

    return bootstrapSession();
  }

  async function authenticatedFetch(path: string, retryAfterRefresh = true): Promise<Response> {
    const currentSession = await getSession();
    const response = await fetch(`${apiOrigin}${path}`, {
      cache: "no-store",
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${currentSession.accessToken}`,
      },
      redirect: "error",
      referrerPolicy: "no-referrer",
    });

    if (response.status === 401 && retryAfterRefresh) {
      session = undefined;
      await getSession(true);
      return authenticatedFetch(path, false);
    }

    return response;
  }

  return {
    async connectEvents(onHealth, onFailure) {
      const currentSession = await getSession();
      const websocketOrigin = apiOrigin.replace(/^http:/, "ws:");
      const websocketUrl = new URL("/api/v1/events", websocketOrigin);
      const socket = new WebSocket(websocketUrl);
      let closedByClient = false;
      let failureReported = false;

      function reportFailure(): void {
        if (closedByClient || failureReported) {
          return;
        }

        failureReported = true;
        session = undefined;
        onFailure();
      }

      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "session.authenticate",
            accessToken: currentSession.accessToken,
          }),
        );
      });
      socket.addEventListener("message", (message) => {
        try {
          const rawData: unknown = message.data;
          if (typeof rawData !== "string") {
            throw new TypeError("Local Service event must be a text frame");
          }

          const payload: unknown = JSON.parse(rawData);
          const event = serviceHealthChangedEventSchema.parse(payload);
          onHealth(event.payload);
        } catch {
          reportFailure();
          socket.close();
        }
      });
      socket.addEventListener("error", reportFailure);
      socket.addEventListener("close", reportFailure);

      return {
        close() {
          closedByClient = true;
          socket.close();
        },
      };
    },
    async fetchHealth() {
      const response = await authenticatedFetch("/api/v1/health");
      if (!response.ok) {
        throw new Error("Local Service health check failed");
      }

      const payload: unknown = await response.json();
      return healthResponseSchema.parse(payload);
    },
  };
}
