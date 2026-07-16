import {
  healthResponseSchema,
  serviceHealthChangedEventSchema,
  sessionBootstrapResponseSchema,
  type HealthResponse,
} from "@koradio/contracts";

export interface ServiceConnection {
  close(): void;
}

function validateLoopbackOrigin(candidate: string): string {
  const url = new URL(candidate);
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";

  if (url.protocol !== "http:" || !isLoopback || url.pathname !== "/") {
    throw new TypeError("Koradio API origin must be an HTTP loopback origin");
  }

  return url.origin;
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

export async function fetchHealth(apiOrigin: string): Promise<HealthResponse> {
  const response = await fetch(`${apiOrigin}/api/v1/health`);
  if (!response.ok) {
    throw new Error("Local Service health check failed");
  }

  const payload: unknown = await response.json();
  return healthResponseSchema.parse(payload);
}

export async function connectEvents(
  apiOrigin: string,
  onHealth: (health: HealthResponse) => void,
  onFailure: () => void,
): Promise<ServiceConnection> {
  const bootstrapResponse = await fetch(`${apiOrigin}/api/v1/session/bootstrap`, {
    method: "POST",
    cache: "no-store",
  });
  if (!bootstrapResponse.ok) {
    throw new Error("Local session bootstrap failed");
  }

  const bootstrapPayload: unknown = await bootstrapResponse.json();
  const bootstrap = sessionBootstrapResponseSchema.parse(bootstrapPayload);
  const websocketOrigin = apiOrigin.replace(/^http:/, "ws:");
  const socket = new WebSocket(`${websocketOrigin}/api/v1/events`);

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "session.authenticate",
        accessToken: bootstrap.accessToken,
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
      onFailure();
      socket.close();
    }
  });
  socket.addEventListener("error", onFailure);

  return {
    close() {
      socket.close();
    },
  };
}
