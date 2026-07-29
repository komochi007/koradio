import { useLayoutEffect, type ReactNode } from "react";

export interface DesktopCanvasState {
  enabled: boolean;
}

export interface DesktopCanvasEnvironment {
  hasFinePointer: boolean;
  isStandalone: boolean;
}

export function resolveDesktopCanvasState({
  hasFinePointer,
  isStandalone,
}: DesktopCanvasEnvironment): DesktopCanvasState {
  return { enabled: isStandalone && hasFinePointer };
}

function readCanvasState(): DesktopCanvasState {
  return resolveDesktopCanvasState({
    hasFinePointer: window.matchMedia("(pointer: fine)").matches,
    isStandalone: window.matchMedia("(display-mode: standalone)").matches,
  });
}

export function DesktopCanvas({ children }: { children: ReactNode }): ReactNode {
  const state = readCanvasState();

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
      <div className="desktop-canvas">
        <div className="desktop-canvas__content">{children}</div>
      </div>
    </div>
  );
}
