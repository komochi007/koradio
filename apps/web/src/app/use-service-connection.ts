import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HealthResponse, V1Event } from "@koradio/contracts";
import { useEffect, useRef, useState } from "react";

import { createEventSequenceGuard } from "../shared/event-sequence.js";
import type { ServiceConnection, ServiceTransport } from "../shared/transport.js";
import { serviceHealthQueryKey } from "./query-client.js";

export type ServiceConnectionState = "connecting" | "offline" | "online" | "reconnecting";

interface ServiceConnectionSnapshot {
  health: HealthResponse | undefined;
  reconnect: () => void;
  state: ServiceConnectionState;
}

const reconnectDelays = [500, 1_000, 2_000, 5_000] as const;

function applyEvent(queryClient: ReturnType<typeof useQueryClient>, event: V1Event): void {
  if (event.eventType === "service.health.changed") {
    queryClient.setQueryData(serviceHealthQueryKey, event.payload);
  }
}

export function useServiceConnection(transport: ServiceTransport): ServiceConnectionSnapshot {
  const queryClient = useQueryClient();
  const [eventAttempt, setEventAttempt] = useState(0);
  const [eventConnected, setEventConnected] = useState(false);
  const sequenceGuard = useRef(createEventSequenceGuard());
  const healthQuery = useQuery({
    queryKey: serviceHealthQueryKey,
    queryFn: ({ signal }) => transport.fetchHealth(signal),
    refetchInterval: (query) => (query.state.status === "error" ? 5_000 : false),
  });
  const refetchHealth = healthQuery.refetch;
  const serviceAvailable = healthQuery.isSuccess;

  useEffect(() => {
    if (!serviceAvailable) {
      return;
    }

    let active = true;
    let connection: ServiceConnection | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    setEventConnected(false);

    function scheduleEventReconnect(): void {
      setEventConnected(false);
      void refetchHealth();
      const delay = reconnectDelays[Math.min(eventAttempt, reconnectDelays.length - 1)];
      reconnectTimer = setTimeout(() => {
        setEventAttempt((attempt) => attempt + 1);
      }, delay);
    }

    void transport
      .connectEvents(
        (event) => {
          if (!active || !sequenceGuard.current.accept(event)) {
            return;
          }

          applyEvent(queryClient, event);
          setEventConnected(true);
        },
        () => {
          if (!active) {
            return;
          }

          scheduleEventReconnect();
        },
      )
      .then((createdConnection) => {
        if (!active) {
          createdConnection.close();
          return;
        }

        connection = createdConnection;
      })
      .catch(() => {
        if (active) {
          scheduleEventReconnect();
        }
      });

    return () => {
      active = false;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      connection?.close();
    };
  }, [eventAttempt, queryClient, refetchHealth, serviceAvailable, transport]);

  if (healthQuery.isPending) {
    return {
      health: undefined,
      reconnect: () => {
        void healthQuery.refetch();
      },
      state: "connecting",
    };
  }

  if (healthQuery.isError) {
    return {
      health: undefined,
      reconnect: () => {
        transport.clearSession();
        sequenceGuard.current.reset();
        setEventAttempt(0);
        void healthQuery.refetch();
      },
      state: "offline",
    };
  }

  return {
    health: healthQuery.data,
    reconnect: () => {
      transport.clearSession();
      sequenceGuard.current.reset();
      setEventAttempt((attempt) => attempt + 1);
      void healthQuery.refetch();
    },
    state: eventConnected ? "online" : "reconnecting",
  };
}
