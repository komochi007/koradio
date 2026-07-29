import { useLayoutEffect, useState, type ReactNode } from "react";

export const desktopCanvasMinimumSize = {
  height: 760,
  width: 680,
} as const;

export interface DesktopCanvasState {
  enabled: boolean;
  tooSmall: boolean;
}

export interface DesktopCanvasEnvironment {
  hasFinePointer: boolean;
  isStandalone: boolean;
  outerHeight: number;
  outerWidth: number;
}

export function resolveDesktopCanvasState({
  hasFinePointer,
  isStandalone,
  outerHeight,
  outerWidth,
}: DesktopCanvasEnvironment): DesktopCanvasState {
  const enabled = isStandalone && hasFinePointer;
  return {
    enabled,
    tooSmall:
      enabled &&
      (outerWidth < desktopCanvasMinimumSize.width ||
        outerHeight < desktopCanvasMinimumSize.height),
  };
}

function readCanvasState(): DesktopCanvasState {
  return resolveDesktopCanvasState({
    hasFinePointer: window.matchMedia("(pointer: fine)").matches,
    isStandalone: window.matchMedia("(display-mode: standalone)").matches,
    outerHeight: window.outerHeight,
    outerWidth: window.outerWidth,
  });
}

export function DesktopCanvas({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState(readCanvasState);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (state.enabled) {
      root.dataset.desktopPwaCanvas = "true";
      root.dataset.desktopPwaTooSmall = String(state.tooSmall);
    } else {
      delete root.dataset.desktopPwaCanvas;
      delete root.dataset.desktopPwaTooSmall;
    }
    const handleResize = (): void => {
      setState(readCanvasState());
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      delete root.dataset.desktopPwaCanvas;
      delete root.dataset.desktopPwaTooSmall;
    };
  }, [state.enabled, state.tooSmall]);

  if (!state.enabled) return children;

  return (
    <div className="desktop-canvas-viewport desktop-canvas-viewport--standalone">
      <div className="desktop-canvas">
        {state.tooSmall ? (
          <main aria-labelledby="desktop-window-notice-title" className="desktop-window-notice">
            <section aria-live="assertive" className="desktop-window-notice__alert" role="alert">
              <span aria-hidden="true" className="desktop-window-notice__signal" />
              <p className="eyebrow">WINDOW SIZE</p>
              <h1 id="desktop-window-notice-title">窗口空间不足</h1>
              <p>
                请将 Koradio 窗口调整到至少 {desktopCanvasMinimumSize.width} ×{" "}
                {desktopCanvasMinimumSize.height}，即可恢复完整的单列电台界面。
              </p>
            </section>
          </main>
        ) : (
          <div className="desktop-canvas__content">{children}</div>
        )}
      </div>
    </div>
  );
}
