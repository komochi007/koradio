// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DesktopCanvasGate,
  resolveDesktopCanvasMode,
} from "../../apps/web/src/app/desktop-canvas.js";

let desktopInput = true;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: desktopInput,
      media: "",
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.desktopCanvas;
});

describe("DesktopCanvasGate", () => {
  it("classifies desktop, undersized and touch viewports", () => {
    expect(resolveDesktopCanvasMode(960, 1600, true)).toBe("fixed");
    expect(resolveDesktopCanvasMode(1440, 1200, true)).toBe("blocked");
    expect(resolveDesktopCanvasMode(834, 1194, false)).toBe("responsive");
  });

  it("renders the fixed 960 × 1600 canvas for an eligible desktop viewport", async () => {
    desktopInput = true;
    setViewport(960, 1600);
    installMatchMedia();
    render(
      <DesktopCanvasGate>
        <p>产品内容</p>
      </DesktopCanvasGate>,
    );

    expect(screen.getByText("产品内容").closest(".desktop-canvas")).not.toBeNull();
    await waitFor(() => {
      expect(document.documentElement.dataset.desktopCanvas).toBe("fixed");
    });
  });

  it("shows a size notice until a desktop viewport reaches the required height", async () => {
    desktopInput = true;
    setViewport(1440, 1200);
    installMatchMedia();
    render(
      <DesktopCanvasGate>
        <p>产品内容</p>
      </DesktopCanvasGate>,
    );

    expect(screen.getByRole("status").textContent).toContain("960 × 1600");
    expect(screen.queryByText("产品内容")).toBeNull();

    setViewport(1440, 1600);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByText("产品内容").closest(".desktop-canvas")).not.toBeNull();
    await waitFor(() => {
      expect(document.documentElement.dataset.desktopCanvas).toBe("fixed");
    });
  });

  it("keeps touch tablet layouts responsive", async () => {
    desktopInput = false;
    setViewport(834, 1194);
    installMatchMedia();
    render(
      <DesktopCanvasGate>
        <p>产品内容</p>
      </DesktopCanvasGate>,
    );

    expect(screen.getByText("产品内容").closest(".desktop-canvas")).toBeNull();
    await waitFor(() => {
      expect(document.documentElement.dataset.desktopCanvas).toBeUndefined();
    });
  });
});
