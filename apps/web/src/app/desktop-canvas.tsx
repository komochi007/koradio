import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";

export const prototypeCanvasHeight = 1600;
export const prototypeCanvasWidth = 960;
export const electronCompactCanvasScale = 0.425;
export const electronCompactReferenceWidth = 900;
export const electronNativeTitlebarLeading = 88;

export interface DesktopCanvasState {
  enabled: boolean;
  height: number;
  isElectron: boolean;
  logicalHeight: number;
  nativeTitlebarLeading: number;
  scale: number;
  viewportLogicalHeight: number;
  viewportLogicalWidth: number;
  width: number;
}

export interface DesktopCanvasEnvironment {
  hasFinePointer: boolean;
  isElectron: boolean;
  isStandalone: boolean;
  viewportHeight: number;
  viewportWidth: number;
}

export function resolveDesktopCanvasState({
  hasFinePointer,
  isElectron,
  isStandalone,
  viewportHeight,
  viewportWidth,
}: DesktopCanvasEnvironment): DesktopCanvasState {
  const enabled = (isStandalone || isElectron) && hasFinePointer;
  const availableScale = Math.min(
    viewportWidth / prototypeCanvasWidth,
    viewportHeight / prototypeCanvasHeight,
    1,
  );
  const scale =
    enabled && isElectron && viewportWidth <= electronCompactReferenceWidth
      ? Math.min(electronCompactCanvasScale, availableScale)
      : enabled
        ? availableScale
        : 1;
  const logicalHeight =
    enabled && isElectron
      ? Math.max(prototypeCanvasHeight, Math.round(viewportHeight / scale))
      : prototypeCanvasHeight;
  const width = Math.round(prototypeCanvasWidth * scale);
  const nativeTitlebarLeading =
    enabled && isElectron
      ? (electronNativeTitlebarLeading - (viewportWidth - width) / 2) / scale
      : 0;
  return {
    enabled,
    height: Math.round(logicalHeight * scale),
    isElectron,
    logicalHeight,
    nativeTitlebarLeading,
    scale,
    viewportLogicalHeight: viewportHeight / scale,
    viewportLogicalWidth: viewportWidth / scale,
    width,
  };
}

function readCanvasState(): DesktopCanvasState {
  const viewport = window.visualViewport;
  return resolveDesktopCanvasState({
    hasFinePointer: window.matchMedia("(pointer: fine)").matches,
    isElectron: /\bElectron\//u.test(window.navigator.userAgent),
    isStandalone: window.matchMedia("(display-mode: standalone)").matches,
    viewportHeight: viewport?.height ?? window.innerHeight,
    viewportWidth: viewport?.width ?? window.innerWidth,
  });
}

export function DesktopCanvas({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<DesktopCanvasState>(() => readCanvasState());

  useLayoutEffect(() => {
    const update = (): void => {
      setState(readCanvasState());
    };
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (state.enabled) {
      root.dataset.desktopPwaCanvas = "true";
      if (state.isElectron) root.dataset.electronCanvas = "true";
      root.style.setProperty("--desktop-canvas-scale", String(state.scale));
      root.style.setProperty(
        "--desktop-native-titlebar-window-leading",
        `${String(electronNativeTitlebarLeading / state.scale)}px`,
      );
      root.style.setProperty(
        "--desktop-window-logical-height",
        `${String(state.viewportLogicalHeight)}px`,
      );
      root.style.setProperty(
        "--desktop-window-logical-width",
        `${String(state.viewportLogicalWidth)}px`,
      );
      return () => {
        delete root.dataset.desktopPwaCanvas;
        delete root.dataset.electronCanvas;
        root.style.removeProperty("--desktop-canvas-scale");
        root.style.removeProperty("--desktop-native-titlebar-window-leading");
        root.style.removeProperty("--desktop-window-logical-height");
        root.style.removeProperty("--desktop-window-logical-width");
      };
    }
    delete root.dataset.desktopPwaCanvas;
    delete root.dataset.electronCanvas;
    root.style.removeProperty("--desktop-canvas-scale");
    root.style.removeProperty("--desktop-native-titlebar-window-leading");
    root.style.removeProperty("--desktop-window-logical-height");
    root.style.removeProperty("--desktop-window-logical-width");
    return undefined;
  }, [state]);

  if (!state.enabled) return children;

  return (
    <div className="desktop-canvas-viewport desktop-canvas-viewport--standalone">
      {state.isElectron ? <div aria-hidden="true" className="electron-window-drag-region" /> : null}
      <div
        className="desktop-canvas"
        style={{
          height: `${String(state.height)}px`,
          width: `${String(state.width)}px`,
        }}
      >
        <div
          className="desktop-canvas__content"
          style={
            {
              "--desktop-canvas-extra-height": `${String(state.logicalHeight - prototypeCanvasHeight)}px`,
              "--desktop-canvas-logical-height": `${String(state.logicalHeight)}px`,
              "--desktop-canvas-scale": String(state.scale),
              "--desktop-native-titlebar-leading": `${String(state.nativeTitlebarLeading)}px`,
              height: `${String(state.logicalHeight)}px`,
              transform: `scale(${String(state.scale)})`,
            } as CSSProperties
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
