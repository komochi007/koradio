import { useEffect, useState, type ReactNode } from "react";

const desktopBreakpoint = 768;
const prototypeHeight = 1600;
const prototypeWidth = 960;

interface CanvasState {
  enabled: boolean;
  height: number;
  scale: number;
  width: number;
}

function readCanvasState(): CanvasState {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const enabled = width >= desktopBreakpoint;
  const scale = enabled ? Math.min(width / prototypeWidth, height / prototypeHeight, 1) : 1;
  return {
    enabled,
    height: Math.round(prototypeHeight * scale),
    scale,
    width: Math.round(prototypeWidth * scale),
  };
}

export function DesktopCanvas({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<CanvasState>(() => readCanvasState());

  useEffect(() => {
    const update = (): void => {
      setState(readCanvasState());
    };
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!state.enabled) return children;

  return (
    <div className="desktop-canvas-viewport">
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
