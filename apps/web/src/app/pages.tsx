import type { HealthResponse, ProfileContext } from "@koradio/contracts";
import type { ReactElement, RefObject } from "react";

import { RadioExperience } from "../features/radio/index.js";
import type { AppEventBus } from "../shared/events.js";
import type { ServiceTransport } from "../shared/transport.js";
import { Brand, PrimaryNavigation, Status } from "../shared/ui.js";
import type { AppRoute } from "./router.js";

interface SharedPageProps {
  navigate: (path: string) => void;
  reconnect: () => void;
}

export function ConnectingPage(): ReactElement {
  return (
    <div className="app-surface connection-page">
      <header className="topbar">
        <Brand />
      </header>
      <main className="connection-page__content" aria-busy="true">
        <Status tone="pending">CONNECTING</Status>
        <h1>正在连接 Koradio</h1>
        <p>正在建立仅驻留内存的本地会话与事件通道。</p>
      </main>
    </div>
  );
}

export function OfflinePage({ navigate, reconnect }: SharedPageProps): ReactElement {
  return (
    <div className="app-surface offline-page">
      <header className="topbar">
        <Brand />
      </header>
      <main className="offline-panel" role="alert">
        <div className="offline-signal" aria-hidden="true">
          <span className="offline-signal__ring" />
          <span className="offline-signal__break offline-signal__break--top" />
          <span className="offline-signal__break offline-signal__break--bottom" />
          <span className="offline-signal__wave">
            {Array.from({ length: 7 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </div>
        <Status tone="offline">OFFLINE</Status>
        <h1>Koradio 服务未连接</h1>
        <p className="offline-panel__description">
          无法连接到本地 Koradio 服务。请确认服务已经启动，或前往只读 Settings 查看启动说明。
        </p>
        <div className="offline-panel__actions">
          <button className="button button--primary" type="button" onClick={reconnect}>
            重新连接
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              navigate("/settings");
            }}
          >
            前往 Settings
          </button>
        </div>
        <div className="offline-diagnostics" aria-label="脱敏诊断信息">
          <p>LOCAL SERVICE · NOT RESPONDING</p>
          <p>SESSION · NOT AVAILABLE</p>
          <p>APP SHELL · READ ONLY</p>
        </div>
      </main>
      <PrimaryNavigation active="settings" disabled onNavigate={navigate} />
    </div>
  );
}

export function OfflineSettingsPage({ navigate, reconnect }: SharedPageProps): ReactElement {
  return (
    <div className="app-surface settings-page">
      <header className="topbar">
        <Brand />
        <Status tone="offline">OFFLINE · READ ONLY</Status>
      </header>
      <main className="settings-panel">
        <div className="page-heading">
          <p className="eyebrow">LOCAL SERVICE</p>
          <h1>设置暂时只读</h1>
          <p>本地服务未启动时，Koradio 不读取缓存配置，也不恢复旧 Session。</p>
        </div>
        <section className="settings-card" aria-labelledby="startup-title">
          <div>
            <p className="settings-card__index">01</p>
            <h2 id="startup-title">启动本地服务</h2>
          </div>
          <ol>
            <li>确认 Koradio Local Service 已启动。</li>
            <li>保持当前页面打开，然后重新连接。</li>
            <li>连接成功后将自动返回 Radio。</li>
          </ol>
        </section>
        <section className="settings-card" aria-labelledby="safe-state-title">
          <div>
            <p className="settings-card__index">02</p>
            <h2 id="safe-state-title">安全状态</h2>
          </div>
          <dl>
            <div>
              <dt>本地 Session</dt>
              <dd>未恢复</dd>
            </div>
            <div>
              <dt>配置与密钥</dt>
              <dd>未读取</dd>
            </div>
            <div>
              <dt>测试与迁移</dt>
              <dd>已禁用</dd>
            </div>
          </dl>
        </section>
        <div className="settings-panel__actions">
          <button className="button button--primary" type="button" onClick={reconnect}>
            重新连接
          </button>
          <button className="button button--secondary" type="button" disabled>
            保存配置
          </button>
          <button className="button button--secondary" type="button" disabled>
            测试连接
          </button>
          <button className="button button--secondary" type="button" disabled>
            迁移数据目录
          </button>
        </div>
      </main>
      <PrimaryNavigation active="settings" disabled onNavigate={navigate} />
    </div>
  );
}

interface OnlineShellPageProps {
  current: ProfileContext;
  eventBus: AppEventBus;
  headingRef: RefObject<HTMLHeadingElement | null>;
  health: HealthResponse;
  navigate: (path: string) => void;
  onCurrentChanged: (current: ProfileContext) => void;
  onOpenProfiles: () => void;
  reconnecting: boolean;
  route: AppRoute;
  transport: ServiceTransport;
}

const providerLabels: Record<keyof HealthResponse["providers"], string> = {
  codex: "CODEX",
  netease: "NETEASE",
  tts: "APPLE TTS",
};

export function OnlineShellPage({
  current,
  eventBus,
  headingRef,
  health,
  navigate,
  onCurrentChanged,
  onOpenProfiles,
  reconnecting,
  route,
  transport,
}: OnlineShellPageProps): ReactElement {
  if (route.id === "radio") {
    return (
      <RadioExperience
        current={current}
        eventBus={eventBus}
        headingRef={headingRef}
        key={current.profile.id}
        navigate={navigate}
        onCurrentChanged={onCurrentChanged}
        onOpenProfiles={onOpenProfiles}
        reconnecting={reconnecting}
        transport={transport}
      />
    );
  }

  return (
    <div className="app-surface online-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-tools">
          <Status tone={reconnecting ? "pending" : "connected"}>
            {reconnecting ? "EVENTS RECONNECTING" : "LOCAL SERVICE CONNECTED"}
          </Status>
          <button
            className="profile-tool"
            type="button"
            onClick={onOpenProfiles}
            aria-label="切换档案"
          >
            {Array.from(current.profile.nickname).slice(0, 2).join("")}
          </button>
        </div>
      </header>
      <main className="online-panel">
        <div className="page-heading">
          <p className="eyebrow">APP SHELL · {route.path}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {route.label}
          </h1>
          <p>本地 Session、Query 缓存与事件通道已由 App Shell 统一组合。</p>
        </div>
        <section className="connection-ledger" aria-label="本地连接状态">
          <article>
            <span>01</span>
            <div>
              <h2>SESSION</h2>
              <p>MEMORY ONLY</p>
            </div>
            <strong>READY</strong>
          </article>
          <article>
            <span>02</span>
            <div>
              <h2>EVENT STREAM</h2>
              <p>/api/v1/events</p>
            </div>
            <strong>{reconnecting ? "RECONNECTING" : "CONNECTED"}</strong>
          </article>
          {Object.entries(health.providers).map(([provider, state], index) => (
            <article key={provider}>
              <span>{String(index + 3).padStart(2, "0")}</span>
              <div>
                <h2>{providerLabels[provider as keyof HealthResponse["providers"]]}</h2>
                <p>RUNTIME SNAPSHOT</p>
              </div>
              <strong>{state.toUpperCase()}</strong>
            </article>
          ))}
        </section>
      </main>
      <PrimaryNavigation active={route.id} onNavigate={navigate} />
    </div>
  );
}
