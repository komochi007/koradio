import { describe, expect, it } from "vitest";

import {
  prototypeCanvasHeight,
  prototypeCanvasWidth,
  resolveDesktopCanvasState,
} from "../../apps/web/src/app/desktop-canvas.js";

describe("DesktopCanvas", () => {
  it("scales a standalone desktop PWA down to the entire available viewport", () => {
    const state = resolveDesktopCanvasState({
      hasFinePointer: true,
      isStandalone: true,
      viewportHeight: 600,
      viewportWidth: 560,
    });

    expect(state).toEqual({
      enabled: true,
      height: 600,
      scale: 0.375,
      width: 360,
    });
  });

  it("never enlarges the prototype when the standalone PWA viewport is larger", () => {
    const state = resolveDesktopCanvasState({
      hasFinePointer: true,
      isStandalone: true,
      viewportHeight: 2_400,
      viewportWidth: 1_920,
    });

    expect(state).toEqual({
      enabled: true,
      height: prototypeCanvasHeight,
      scale: 1,
      width: prototypeCanvasWidth,
    });
  });

  it("keeps ordinary browser and mobile layouts responsive", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isStandalone: false,
        viewportHeight: 844,
        viewportWidth: 390,
      }),
    ).toEqual({ enabled: false, height: 1600, scale: 1, width: 960 });
  });
});
