import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  electronCompactCanvasScale,
  prototypeCanvasHeight,
  prototypeCanvasWidth,
  resolveElectronDragRegionInsets,
  resolveDesktopCanvasState,
} from "../../apps/web/src/app/desktop-canvas.js";

describe("DesktopCanvas", () => {
  it("defines an Electron drag region without disabling topbar controls", async () => {
    const stylesheet = await readFile(
      fileURLToPath(new URL("../../apps/web/src/app/desktop-canvas.css", import.meta.url)),
      "utf8",
    );
    const component = await readFile(
      fileURLToPath(new URL("../../apps/web/src/app/desktop-canvas.tsx", import.meta.url)),
      "utf8",
    );
    expect(stylesheet).toContain(
      'html[data-electron-canvas="true"] .electron-window-drag-region {',
    );
    expect(stylesheet).toContain("left: var(--desktop-drag-region-left, 112px);");
    expect(stylesheet).toContain("right: var(--desktop-drag-region-right, 116px);");
    expect(stylesheet).toContain("height: 56px;");
    expect(stylesheet).toContain("-webkit-app-region: drag;");
    expect(component).toContain('className="electron-window-drag-region"');
    expect(stylesheet).toContain(".desktop-canvas .topbar button");
    expect(stylesheet).toContain("-webkit-app-region: no-drag;");
  });

  it("keeps the Electron drag region between the brand and topbar tools at every scale", () => {
    const compact = resolveDesktopCanvasState({
      hasFinePointer: true,
      isElectron: true,
      isStandalone: false,
      viewportHeight: 680,
      viewportWidth: 430,
    });
    const wide = resolveDesktopCanvasState({
      hasFinePointer: true,
      isElectron: true,
      isStandalone: false,
      viewportHeight: 900,
      viewportWidth: 1_440,
    });
    const compactInsets = resolveElectronDragRegionInsets(compact);
    const wideInsets = resolveElectronDragRegionInsets(wide);

    expect(compactInsets).toEqual({ left: 120, right: 147 });
    expect(wideInsets).toEqual({ left: 594, right: 630 });
  });

  it("scales a standalone desktop PWA down to the entire available viewport", () => {
    const state = resolveDesktopCanvasState({
      hasFinePointer: true,
      isElectron: false,
      isStandalone: true,
      viewportHeight: 600,
      viewportWidth: 560,
    });

    expect(state).toEqual({
      enabled: true,
      height: 600,
      isElectron: false,
      logicalHeight: 1600,
      nativeTitlebarLeading: 0,
      scale: 0.375,
      viewportLogicalHeight: 1600,
      viewportLogicalWidth: 560 / 0.375,
      width: 360,
    });
  });

  it("never enlarges the prototype when the standalone PWA viewport is larger", () => {
    const state = resolveDesktopCanvasState({
      hasFinePointer: true,
      isElectron: false,
      isStandalone: true,
      viewportHeight: 2_400,
      viewportWidth: 1_920,
    });

    expect(state).toEqual({
      enabled: true,
      height: prototypeCanvasHeight,
      isElectron: false,
      logicalHeight: prototypeCanvasHeight,
      nativeTitlebarLeading: 0,
      scale: 1,
      viewportLogicalHeight: 2400,
      viewportLogicalWidth: 1920,
      width: prototypeCanvasWidth,
    });
  });

  it("keeps ordinary browser and mobile layouts responsive", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isElectron: false,
        isStandalone: false,
        viewportHeight: 844,
        viewportWidth: 390,
      }),
    ).toEqual({
      enabled: false,
      height: 1600,
      isElectron: false,
      logicalHeight: 1600,
      nativeTitlebarLeading: 0,
      scale: 1,
      viewportLogicalHeight: 844,
      viewportLogicalWidth: 390,
      width: 960,
    });
  });

  it("uses the fixed desktop canvas inside Electron", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isElectron: true,
        isStandalone: false,
        viewportHeight: 680,
        viewportWidth: 430,
      }),
    ).toEqual({
      enabled: true,
      height: 680,
      isElectron: true,
      logicalHeight: 1600,
      nativeTitlebarLeading: 181.1764705882353,
      scale: electronCompactCanvasScale,
      viewportLogicalHeight: 1600,
      viewportLogicalWidth: 1011.7647058823529,
      width: 408,
    });
  });

  it("assigns taller Electron windows to the logical content height", () => {
    expect(
      resolveDesktopCanvasState({
        hasFinePointer: true,
        isElectron: true,
        isStandalone: false,
        viewportHeight: 800,
        viewportWidth: 430,
      }),
    ).toEqual({
      enabled: true,
      height: 800,
      isElectron: true,
      logicalHeight: 1882,
      nativeTitlebarLeading: 181.1764705882353,
      scale: electronCompactCanvasScale,
      viewportLogicalHeight: 1882.3529411764707,
      viewportLogicalWidth: 1011.7647058823529,
      width: 408,
    });
  });

  it("freezes Electron element sizing at the compact reference window", () => {
    const reference = resolveDesktopCanvasState({
      hasFinePointer: true,
      isElectron: true,
      isStandalone: false,
      viewportHeight: 680,
      viewportWidth: 900,
    });
    const minimum = resolveDesktopCanvasState({
      hasFinePointer: true,
      isElectron: true,
      isStandalone: false,
      viewportHeight: 680,
      viewportWidth: 430,
    });

    expect(reference.scale).toBe(electronCompactCanvasScale);
    expect(reference.nativeTitlebarLeading).toBe(-371.7647058823529);
    expect(minimum.scale).toBe(reference.scale);
  });
});
