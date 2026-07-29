import { describe, expect, it } from "vitest";

import { resolveDesktopCanvasState } from "../../apps/web/src/app/desktop-canvas.js";

describe("DesktopCanvas", () => {
  it("enables the adaptive canvas for a standalone desktop PWA", () => {
    const state = resolveDesktopCanvasState({
      hasFinePointer: true,
      isStandalone: true,
    });

    expect(state).toEqual({ enabled: true });
  });

  it("keeps ordinary browser layouts responsive", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isStandalone: false,
      }),
    ).toEqual({ enabled: false });
  });

  it("keeps touch-first standalone layouts responsive", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: false,
        isStandalone: true,
      }),
    ).toEqual({ enabled: false });
  });
});
