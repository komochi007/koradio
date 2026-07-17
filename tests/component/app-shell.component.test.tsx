// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HealthResponse, V1Event } from "@koradio/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../apps/web/src/app/app.js";
import type { ServiceConnection, ServiceTransport } from "../../apps/web/src/shared/transport.js";

const health: HealthResponse = {
  service: "koradio",
  status: "ready",
  mode: "mock",
  providers: {
    codex: "available",
    netease: "available",
    tts: "available",
  },
  checkedAt: "2026-07-17T08:00:00.000Z",
};

function createHealthEvent(): V1Event {
  return {
    eventId: "00000000-0000-4000-8000-000000000001",
    eventType: "service.health.changed",
    version: 1,
    correlationId: "00000000-0000-4000-8000-000000000002",
    sequence: 1,
    occurredAt: "2026-07-17T08:00:00.000Z",
    payload: health,
  };
}

function createOnlineTransport(): ServiceTransport {
  return {
    clearSession: vi.fn(),
    connectEvents(onEvent): Promise<ServiceConnection> {
      queueMicrotask(() => {
        onEvent(createHealthEvent());
      });
      return Promise.resolve({ close: vi.fn() });
    },
    fetchHealth: vi.fn().mockResolvedValue(health),
  };
}

function createOfflineTransport(): ServiceTransport {
  return {
    clearSession: vi.fn(),
    connectEvents: vi.fn(),
    fetchHealth: vi.fn().mockRejectedValue(new Error("offline")),
  };
}

function createReconnectingTransport(): ServiceTransport & {
  connectEvents: ReturnType<typeof vi.fn>;
} {
  let connectionAttempt = 0;
  const connectEvents = vi.fn(
    (onEvent: (event: V1Event) => void, onFailure: () => void): Promise<ServiceConnection> => {
      connectionAttempt += 1;
      queueMicrotask(() => {
        if (connectionAttempt === 1) {
          onFailure();
          return;
        }

        onEvent(createHealthEvent());
      });
      return Promise.resolve({ close: vi.fn() });
    },
  );

  return {
    clearSession: vi.fn(),
    connectEvents,
    fetchHealth: vi.fn().mockResolvedValue(health),
  };
}

function createDisconnectingTransport(): ServiceTransport & { failEvents: () => void } {
  let failEvents = (): void => undefined;
  let healthAttempt = 0;

  return {
    clearSession: vi.fn(),
    connectEvents(onEvent, onFailure): Promise<ServiceConnection> {
      failEvents = onFailure;
      queueMicrotask(() => {
        onEvent(createHealthEvent());
      });
      return Promise.resolve({ close: vi.fn() });
    },
    failEvents() {
      failEvents();
    },
    fetchHealth: vi.fn(() => {
      healthAttempt += 1;
      return healthAttempt === 1 ? Promise.resolve(health) : Promise.reject(new Error("offline"));
    }),
  };
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("App Shell", () => {
  it("establishes an online session and provides keyboard-routable navigation", async () => {
    window.history.replaceState(null, "", "/radio");
    render(<App transport={createOnlineTransport()} />);

    const heading = await screen.findByRole("heading", { name: "Radio" });
    await waitFor(() => {
      expect(screen.getByText("LOCAL SERVICE CONNECTED")).toBeTruthy();
    });
    expect(document.activeElement).toBe(heading);

    const radio = screen.getByRole("button", { name: "Radio" });
    radio.focus();
    fireEvent.keyDown(radio, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Library" }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(window.location.pathname).toBe("/settings");
  });

  it("exposes only read-only Settings controls while the service is offline", async () => {
    window.history.replaceState(null, "", "/radio");
    render(<App transport={createOfflineTransport()} />);

    expect(await screen.findByRole("heading", { name: "Koradio 服务未连接" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "前往 Settings" }));

    expect(await screen.findByRole("heading", { name: "设置暂时只读" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存配置" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "测试连接" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "迁移数据目录" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("reconnects the event stream after a connection failure", async () => {
    window.history.replaceState(null, "", "/radio");
    const transport = createReconnectingTransport();
    render(<App transport={transport} />);

    await waitFor(
      () => {
        expect(transport.connectEvents).toHaveBeenCalledTimes(2);
        expect(screen.getByText("LOCAL SERVICE CONNECTED")).toBeTruthy();
      },
      { timeout: 2_000 },
    );
  });

  it("enters the offline recovery page when the connected service stops", async () => {
    window.history.replaceState(null, "", "/radio");
    const transport = createDisconnectingTransport();
    render(<App transport={transport} />);

    expect(await screen.findByText("LOCAL SERVICE CONNECTED")).toBeTruthy();
    act(() => {
      transport.failEvents();
    });

    expect(await screen.findByRole("heading", { name: "Koradio 服务未连接" })).toBeTruthy();
  });
});
