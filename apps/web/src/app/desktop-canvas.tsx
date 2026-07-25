import { useLayoutEffect, useState, type ReactNode } from "react";

export const prototypeCanvasHeight = 1600;
export const prototypeCanvasWidth = 960;

export interface DesktopCanvasState {
  enabled: boolean;
  height: number;
  scale: number;
  width: number;
}

export interface DesktopCanvasEnvironment {
  hasFinePointer: boolean;
  isStandalone: boolean;
  viewportHeight: number;
  viewportWidth: number;
}

export function resolveDesktopCanvasState({
  hasFinePointer,
  isStandalone,
  viewportHeight,
  viewportWidth,
}: DesktopCanvasEnvironment): DesktopCanvasState {
  const enabled = isStandalone && hasFinePointer;
  const scale = enabled
    ? Math.min(viewportWidth / prototypeCanvasWidth, viewportHeight / prototypeCanvasHeight, 1)
    : 1;
  return {
    enabled,
    height: Math.round(prototypeCanvasHeight * scale),
    scale,
    width: Math.round(prototypeCanvasWidth * scale),
  };
}

function readCanvasState(): DesktopCanvasState {
  const viewport = window.visualViewport;
  return resolveDesktopCanvasState({
    hasFinePointer: window.matchMedia("(pointer: fine)").matches,
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
      return () => {
        delete root.dataset.desktopPwaCanvas;
      };
    }
    delete root.dataset.desktopPwaCanvas;
    return undefined;
  }, [state.enabled]);

  if (!state.enabled) return children;

  return (
    <div className="desktop-canvas-viewport desktop-canvas-viewport--standalone">
      <div
        className="desktop-canvas"
        style={{
          height: `${String(state.height)}px`,
          width: `${String(state.width)}px`,
        }}
      >
        <div
          className="desktop-canvas__content"
          style={{ transform: `scale(${String(state.scale)})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
