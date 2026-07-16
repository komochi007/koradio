import type { V1Event } from "@koradio/contracts";
import type { WebSocket } from "ws";

export interface EventHub {
  add(socket: WebSocket): void;
  publish(event: V1Event): void;
  remove(socket: WebSocket): void;
}

export function createEventHub(): EventHub {
  const sockets = new Set<WebSocket>();

  return {
    add(socket) {
      sockets.add(socket);
    },
    publish(event) {
      const serialized = JSON.stringify(event);

      for (const socket of sockets) {
        if (socket.readyState === socket.OPEN) {
          socket.send(serialized);
        }
      }
    },
    remove(socket) {
      sockets.delete(socket);
    },
  };
}
