import { useEffect, useState, type ReactElement, type ReactNode } from "react";

const desktopInputQuery = "(hover: hover) and (pointer: fine)";
const canvasWidth = 960;
const canvasHeight = 1600;

interface MatchMediaWindow {
  matchMedia?: (query: string) => MediaQueryList;
}

export type DesktopCanvasMode = "responsive" | "fixed" | "blocked";

export function resolveDesktopCanvasMode(
  width: number,
  height: number,
  hasDesktopInput: boolean,
): DesktopCanvasMode {
  if (!hasDesktopInput || width < canvasWidth) {
    return "responsive";
  }

  return height >= canvasHeight ? "fixed" : "blocked";
}

function readDesktopCanvasMode(): DesktopCanvasMode {
  if (typeof window === "undefined") {
    return "responsive";
  }

  const browserWindow: MatchMediaWindow = window;

  return resolveDesktopCanvasMode(
    window.innerWidth,
    window.innerHeight,
    browserWindow.matchMedia?.(desktopInputQuery).matches ?? false,
  );
}

function DesktopCanvasNotice(): ReactElement {
  return (
    <main className="desktop-canvas-notice" role="status" aria-live="polite">
      <p className="desktop-canvas-notice__eyebrow">KORADIO DESKTOP CANVAS</p>
      <h1>请将窗口调整为至少 960 × 1600</h1>
      <p>Koradio 桌面端以固定的 960 × 1600 画布呈现。窗口尺寸满足要求后，当前页面会自动显示。</p>
    </main>
  );
}

export function DesktopCanvasGate({ children }: { children: ReactNode }): ReactElement {
  const [mode, setMode] = useState(readDesktopCanvasMode);

  useEffect(() => {
    const browserWindow: MatchMediaWindow = window;
    const media = browserWindow.matchMedia?.(desktopInputQuery);
    const update = (): void => {
      setMode(readDesktopCanvasMode());
    };

    update();
    window.addEventListener("resize", update);
    media?.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      media?.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (mode === "responsive") {
      delete document.documentElement.dataset.desktopCanvas;
      return;
    }

    document.documentElement.dataset.desktopCanvas = mode;
    return () => {
      delete document.documentElement.dataset.desktopCanvas;
    };
  }, [mode]);

  if (mode === "blocked") {
    return <DesktopCanvasNotice />;
  }

  if (mode === "fixed") {
    return <div className="desktop-canvas">{children}</div>;
  }

  return <>{children}</>;
}
