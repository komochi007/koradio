import { describe, expect, it } from "vitest";

import { resolveDesktopCanvasState } from "../../apps/web/src/app/desktop-canvas.js";

describe("DesktopCanvas", () => {
  it("enables the adaptive canvas for a standalone desktop PWA", () => {
    const state = resolveDesktopCanvasState({
      hasFinePointer: true,
      isStandalone: true,
      outerHeight: 840,
      outerWidth: 720,
    });

    expect(state).toEqual({ enabled: true, tooSmall: false });
  });

  it("keeps ordinary browser layouts responsive", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isStandalone: false,
        outerHeight: 600,
        outerWidth: 560,
      }),
    ).toEqual({ enabled: false, tooSmall: false });
  });

  it("keeps touch-first standalone layouts responsive", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: false,
        isStandalone: true,
        outerHeight: 600,
        outerWidth: 560,
      }),
    ).toEqual({ enabled: false, tooSmall: false });
  });

  it("blocks a standalone desktop window below either supported dimension", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isStandalone: true,
        outerHeight: 840,
        outerWidth: 679,
      }),
    ).toEqual({ enabled: true, tooSmall: true });
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isStandalone: true,
        outerHeight: 759,
        outerWidth: 720,
      }),
    ).toEqual({ enabled: true, tooSmall: true });
  });

  it("uses outer dimensions so browser zoom does not change the size decision", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isStandalone: true,
        outerHeight: 760,
        outerWidth: 680,
      }),
    ).toEqual({ enabled: true, tooSmall: false });
  });
});
