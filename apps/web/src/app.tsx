import { colorTokens } from "@koradio/design-tokens";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";

import { connectEvents, fetchHealth, resolveApiOrigin } from "./transport.js";

type LinkStatus = "checking" | "connected" | "failed";

const shellStyle: CSSProperties = {
  backgroundColor: colorTokens.dark.background,
  color: colorTokens.dark.textPrimary,
};

const statusCopy: Record<LinkStatus, string> = {
  checking: "检测中",
  connected: "已连接",
  failed: "连接失败",
};

export function App(): ReactElement {
  const [healthStatus, setHealthStatus] = useState<LinkStatus>("checking");
  const [eventStatus, setEventStatus] = useState<LinkStatus>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let connection: Awaited<ReturnType<typeof connectEvents>> | undefined;
    const apiOrigin = resolveApiOrigin();

    setHealthStatus("checking");
    setEventStatus("checking");

    void fetchHealth(apiOrigin)
      .then(() => {
        if (!active) {
          return;
        }

        setHealthStatus("connected");
        return connectEvents(
          apiOrigin,
          () => {
            if (active) {
              setEventStatus("connected");
            }
          },
          () => {
            if (active) {
              setEventStatus("failed");
            }
          },
        );
      })
      .then((createdConnection) => {
        if (!active) {
          createdConnection?.close();
          return;
        }

        connection = createdConnection;
      })
      .catch(() => {
        if (active) {
          setHealthStatus("failed");
          setEventStatus("failed");
        }
      });

    return () => {
      active = false;
      connection?.close();
    };
  }, [attempt]);

  const isReady = healthStatus === "connected" && eventStatus === "connected";

  return (
    <div className="app-shell" style={shellStyle}>
      <header className="brand-lockup" aria-label="Koradio">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>KORADIO</span>
      </header>

      <main className="system-panel">
        <p className="eyebrow">S1 · LOCAL SKELETON</p>
        <div className="title-row">
          <h1>声音系统，等待节目。</h1>
          <span className={`signal ${isReady ? "signal-ready" : ""}`} aria-hidden="true" />
        </div>
        <p className="lede">
          Web、Local Service、Contracts 与 Design Tokens 已进入同一条可验证链路。
        </p>

        <section className="link-grid" aria-label="本地连接状态">
          <article>
            <span className="link-index">01</span>
            <div>
              <h2>REST HEALTH</h2>
              <p>/api/v1/health</p>
            </div>
            <strong data-testid="health-status">{statusCopy[healthStatus]}</strong>
          </article>
          <article>
            <span className="link-index">02</span>
            <div>
              <h2>EVENT STREAM</h2>
              <p>/api/v1/events</p>
            </div>
            <strong data-testid="event-status">{statusCopy[eventStatus]}</strong>
          </article>
          <article>
            <span className="link-index">03</span>
            <div>
              <h2>PROVIDER MODE</h2>
              <p>deterministic development</p>
            </div>
            <strong>MOCK</strong>
          </article>
        </section>

        <div className="system-footer" role="status" aria-live="polite">
          <span>{isReady ? "本地骨架已就绪" : "正在建立本地链路"}</span>
          {!isReady && (
            <button
              type="button"
              onClick={() => {
                setAttempt((value) => value + 1);
              }}
            >
              重新连接
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
