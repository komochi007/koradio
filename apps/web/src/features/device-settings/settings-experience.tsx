import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  HealthResponse,
  ProfileContext,
  ServiceHealth,
  TtsModelStatus,
} from "@koradio/contracts";
import { useEffect, useRef, useState, type ReactElement, type SyntheticEvent } from "react";

import { updateProfilePreferences } from "../profile-preferences/api.js";
import { applyTheme } from "../profile-preferences/theme.js";
import { Brand, PrimaryNavigation, Status } from "../../shared/ui.js";
import type { ServiceTransport } from "../../shared/transport.js";
import {
  getDeviceSettings,
  getServiceHealth,
  getTtsModelStatus,
  installTtsModel,
  migrateDataRoot,
  updateDeviceSettings,
} from "./api.js";

interface SettingsExperienceProps {
  current: ProfileContext;
  health: HealthResponse;
  navigate: (path: string) => void;
  onCurrentChanged: (current: ProfileContext) => void;
  onOpenProfiles: () => void;
  reconnecting: boolean;
  transport: ServiceTransport;
}

const serviceLabels: Record<ServiceHealth["service"], string> = {
  "local-service": "Local Service",
  codex: "Codex",
  netease: "NetEase Music API",
  tts: "Qwen3-TTS",
};

type ThemeMode = ProfileContext["preferences"]["themeMode"];
type DjPreferenceCommand = Partial<
  Pick<ProfileContext["preferences"], "djLanguage" | "djVoiceStyle">
>;

interface DjPreferenceMutation {
  command: DjPreferenceCommand;
  previousLanguage: ProfileContext["preferences"]["djLanguage"];
  previousVoiceStyle: ProfileContext["preferences"]["djVoiceStyle"];
}

const themeLabels: Record<ThemeMode, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

function statusTone(status: ServiceHealth["status"]): string {
  return status === "available" ? "success" : status === "degraded" ? "warning" : "error";
}

function SettingsTopbar({
  current,
  health,
  onOpenProfiles,
  reconnecting,
}: Pick<
  SettingsExperienceProps,
  "current" | "health" | "onOpenProfiles" | "reconnecting"
>): ReactElement {
  return (
    <header className="topbar settings-topbar">
      <Brand />
      <div className="topbar-tools">
        <Status tone={reconnecting ? "pending" : "connected"}>
          {reconnecting ? "EVENTS RECONNECTING" : health.mode === "live" ? "LIVE" : "DEMO MODE"}
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
  );
}

function Diagnostics({
  current,
  health,
  items,
  navigate,
  onBack,
  onOpenProfiles,
  reconnecting,
}: {
  current: ProfileContext;
  health: HealthResponse;
  items: ServiceHealth[];
  navigate: (path: string) => void;
  onBack: () => void;
  onOpenProfiles: () => void;
  reconnecting: boolean;
}): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const available = items.filter((item) => item.status === "available").length;
  const coreUnavailable = items.some(
    (item) =>
      (item.service === "codex" || item.service === "netease") && item.status === "unavailable",
  );
  const ttsUnavailable = items.some(
    (item) => item.service === "tts" && item.status !== "available",
  );

  return (
    <div className="app-surface settings-page settings-page--diagnostics">
      <SettingsTopbar
        current={current}
        health={health}
        onOpenProfiles={onOpenProfiles}
        reconnecting={reconnecting}
      />
      <main className="settings-main diagnostics-main">
        <button className="back-action" type="button" onClick={onBack}>
          ← 返回设置
        </button>
        <header className="diagnostics-heading">
          <h1 ref={headingRef} tabIndex={-1}>
            服务检测
          </h1>
          <p>{available} OF 4 SERVICES AVAILABLE</p>
          <span>
            {coreUnavailable
              ? "节目生成暂不可用，修复必要服务后重新检测。"
              : ttsUnavailable
                ? "核心播放服务可用，语音串讲将暂时降级为文字。"
                : "所有核心服务与语音串讲均可用。"}
          </span>
        </header>
        <section className="diagnostics-list" aria-label="服务检测结果">
          {items.map((item) => (
            <article
              className={`diagnostic-card diagnostic-card--${statusTone(item.status)}`}
              key={item.service}
            >
              <i aria-hidden="true" />
              <div>
                <h2>{serviceLabels[item.service]}</h2>
                <strong>{item.status.toUpperCase()}</strong>
                <p>{item.redactedSummary}</p>
              </div>
              <b aria-hidden="true">{item.status === "available" ? "✓" : "!"}</b>
              {item.service === "tts" && item.status !== "available" ? (
                <div className="diagnostic-guidance">
                  <p>
                    Qwen3-TTS 是可选的本地模型。完成模型下载后重新检测；未恢复时 DJ
                    串讲会安全降级为文字。
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </section>
        <p
          className={`diagnostics-notice diagnostics-notice--${coreUnavailable ? "error" : ttsUnavailable ? "warning" : "success"}`}
          role={coreUnavailable ? "alert" : "status"}
        >
          {coreUnavailable
            ? "当前无法生成可播放节目；已有档案与历史不会受影响。"
            : ttsUnavailable
              ? "你仍然可以生成和播放节目，歌曲播放不受影响。"
              : "当前配置可以生成节目、搜索歌曲并播放语音串讲。"}
        </p>
        <div className="diagnostics-actions">
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              navigate("/radio");
            }}
            disabled={coreUnavailable}
          >
            返回 Radio
          </button>
          <button className="button button--secondary" type="button" onClick={onBack}>
            修改配置
          </button>
        </div>
      </main>
      <PrimaryNavigation active="settings" onNavigate={navigate} />
    </div>
  );
}

export function SettingsExperience(props: SettingsExperienceProps): ReactElement {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settings = useQuery({
    queryKey: ["device-settings"],
    queryFn: () => getDeviceSettings(props.transport),
  });
  const services = useQuery({
    queryKey: ["service-health-list"],
    queryFn: () => getServiceHealth(props.transport),
  });
  const ttsModel = useQuery({
    queryKey: ["tts-model-status"],
    queryFn: () => getTtsModelStatus(props.transport),
    refetchInterval: (query) => (query.state.data?.state === "downloading" ? 1000 : false),
  });
  const [codexCommand, setCodexCommand] = useState("");
  const [djLanguage, setDjLanguage] = useState(props.current.preferences.djLanguage);
  const [voiceStyle, setVoiceStyle] = useState(props.current.preferences.djVoiceStyle);
  const [themeMode, setThemeMode] = useState<ThemeMode>(props.current.preferences.themeMode);
  const [themeError, setThemeError] = useState<string>();
  const [djPreferenceError, setDjPreferenceError] = useState<string>();
  const [saveMessage, setSaveMessage] = useState<string>();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [targetDataRoot, setTargetDataRoot] = useState("");

  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => {
    if (settings.data !== undefined) setCodexCommand(settings.data.codexCommand ?? "");
  }, [settings.data]);
  useEffect(() => {
    applyTheme(props.current.preferences.themeMode);
  }, [props.current.preferences.themeMode]);
  useEffect(() => {
    setDjLanguage(props.current.preferences.djLanguage);
    setVoiceStyle(props.current.preferences.djVoiceStyle);
    setDjPreferenceError(undefined);
  }, [
    props.current.preferences.djLanguage,
    props.current.preferences.djVoiceStyle,
    props.current.profile.id,
  ]);
  useEffect(() => {
    if (ttsModel.data?.state === "ready") {
      void services.refetch();
    }
  }, [ttsModel.data?.state, services.refetch]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmedCommand = codexCommand.trim();
      if (trimmedCommand.length === 0 || trimmedCommand.length > 300)
        throw new TypeError("CODEX_COMMAND_INVALID");
      const device = await updateDeviceSettings(props.transport, trimmedCommand);
      return device;
    },
    onSuccess: (device) => {
      queryClient.setQueryData(["device-settings"], device);
      setSaveMessage("配置已保存。");
    },
    onError: (error) => {
      setSaveMessage(
        error instanceof TypeError
          ? "Codex 命令路径为必填项，最多 300 个字符。"
          : "配置保存失败，当前运行配置保持不变。",
      );
    },
  });

  const djPreferences = useMutation({
    mutationFn: ({ command }: DjPreferenceMutation) =>
      updateProfilePreferences(props.transport, props.current.profile.id, command),
    onSuccess: (preferences, { command }) => {
      props.onCurrentChanged({ ...props.current, preferences });
      setDjPreferenceError(undefined);
      setSaveMessage(
        command.djLanguage === undefined
          ? "DJ 声音风格已保存。"
          : "DJ 语言已保存，下一次生成将使用对应语言的串讲。",
      );
    },
    onError: (_error, { command, previousLanguage, previousVoiceStyle }) => {
      if (command.djLanguage !== undefined) {
        setDjLanguage(previousLanguage);
        setDjPreferenceError("DJ 语言保存失败，已恢复到之前的设置。");
        return;
      }

      setVoiceStyle(previousVoiceStyle);
      setDjPreferenceError("DJ 声音风格保存失败，已恢复到之前的设置。");
    },
  });

  const theme = useMutation({
    mutationFn: async ({ next }: { next: ThemeMode; previous: ThemeMode }) =>
      updateProfilePreferences(props.transport, props.current.profile.id, { themeMode: next }),
    onMutate: ({ next }) => {
      setThemeError(undefined);
      setThemeMode(next);
      applyTheme(next);
    },
    onSuccess: (preferences) => {
      props.onCurrentChanged({ ...props.current, preferences });
    },
    onError: (_error, { previous }) => {
      setThemeMode(previous);
      applyTheme(previous);
      setThemeError("主题偏好保存失败，已恢复到之前的主题。");
    },
  });

  const migration = useMutation({
    mutationFn: () => migrateDataRoot(props.transport, targetDataRoot.trim()),
    onSuccess: () => {
      setSaveMessage("数据目录迁移已安全启动；完成前旧目录会继续保留。");
    },
    onError: () => {
      setSaveMessage("数据目录迁移未启动，当前目录保持不变。请选择空且可写的目录。");
    },
  });
  const installModel = useMutation({
    mutationFn: () => installTtsModel(props.transport),
    onSuccess: (status) => {
      queryClient.setQueryData(["tts-model-status"], status);
      setSaveMessage(
        status.state === "ready"
          ? "Qwen3-TTS 模型已就绪。"
          : "Qwen3-TTS 模型下载已启动，可离开此页面继续使用文字 DJ。",
      );
    },
    onError: () => {
      setSaveMessage("Qwen3-TTS 模型下载未能启动，现有节目和文字 DJ 不受影响。");
    },
  });

  function modelStatusLabel(status: TtsModelStatus | undefined): string {
    if (status === undefined) return "正在检测";
    return {
      unsupported: "当前设备不支持",
      "not-installed": "尚未下载",
      downloading: `下载中 ${String(status.progressPercent)}%`,
      ready: "本地模型已就绪",
      failed: "下载失败，可重试",
    }[status.state];
  }

  async function openDiagnostics(): Promise<void> {
    setSaveMessage(undefined);
    const result = await services.refetch();
    if (result.data !== undefined) {
      setDiagnosticsOpen(true);
    } else {
      setSaveMessage("服务检测失败，请确认 Local Service 仍可用后重试。");
    }
  }

  function handleSave(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaveMessage(undefined);
    save.mutate();
  }

  if (diagnosticsOpen && services.data !== undefined) {
    return (
      <Diagnostics
        current={props.current}
        health={props.health}
        items={services.data.items}
        navigate={props.navigate}
        onBack={() => {
          setDiagnosticsOpen(false);
        }}
        onOpenProfiles={props.onOpenProfiles}
        reconnecting={props.reconnecting}
      />
    );
  }

  return (
    <div className="app-surface settings-page">
      <SettingsTopbar
        current={props.current}
        health={props.health}
        onOpenProfiles={props.onOpenProfiles}
        reconnecting={props.reconnecting}
      />
      <main className="settings-main">
        <header className="settings-heading">
          <h1 ref={headingRef} tabIndex={-1}>
            设置
          </h1>
          <p>
            <i aria-hidden="true" />
            {services.data?.items.filter((item) => item.status === "available").length ?? 0}{" "}
            SERVICES ONLINE
          </p>
        </header>
        {settings.isLoading || services.isLoading ? (
          <p className="settings-loading" aria-busy="true">
            正在读取本地配置与脱敏健康状态…
          </p>
        ) : null}
        {settings.isError || services.isError ? (
          <p className="inline-error" role="alert">
            设置未能载入。请确认本地数据目录可读，然后重试。
          </p>
        ) : null}
        <section className="settings-section" aria-labelledby="services-heading">
          <h2 id="services-heading">服务状态</h2>
          <ul className="service-list">
            {services.data?.items.map((item) => (
              <li key={item.service}>
                <span>{serviceLabels[item.service]}</span>
                <strong className={`service-status service-status--${statusTone(item.status)}`}>
                  <i aria-hidden="true" />
                  {item.status.toUpperCase()}
                </strong>
                <button type="button" onClick={() => void openDiagnostics()}>
                  {item.service === "tts" ? "Test" : "查看"}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <form className="settings-form" id="settings-form" onSubmit={handleSave}>
          <section className="settings-section" aria-labelledby="config-heading">
            <h2 id="config-heading">服务配置</h2>
            <label className="settings-field">
              <span>Codex 命令路径</span>
              <input
                value={codexCommand}
                maxLength={300}
                required
                onChange={(event) => {
                  setCodexCommand(event.target.value);
                }}
                placeholder="输入本机 Codex 可执行命令路径"
              />
            </label>
            <div className="provider-readonly">
              <span>NetEase Music API</span>
              <strong>内置 · 本地模式</strong>
              <small>不收集 API 地址、Cookie 或密钥</small>
            </div>
            <div className="provider-readonly tts-model-card">
              <span>Qwen3-TTS 8-bit</span>
              <strong>{modelStatusLabel(ttsModel.data)}</strong>
              <small>中文使用 Serena，英文使用 Ryan；模型约 1.84 GiB，仅首次下载。</small>
              {ttsModel.data?.state === "downloading" ? (
                <progress
                  aria-label="Qwen3-TTS 模型下载进度"
                  max={100}
                  value={ttsModel.data.progressPercent}
                />
              ) : null}
              {ttsModel.data?.state === "not-installed" || ttsModel.data?.state === "failed" ? (
                <button
                  type="button"
                  disabled={installModel.isPending}
                  onClick={() => {
                    installModel.mutate();
                  }}
                >
                  {installModel.isPending ? "正在启动…" : "下载本地语音模型"}
                </button>
              ) : null}
              <small>模型不可用时串讲自动降级为完整文字，不影响歌曲播放。</small>
            </div>
            <p className="secret-note">敏感凭据由本地服务管理，不向浏览器返回、缓存或显示。</p>
          </section>
          <section className="settings-section" aria-labelledby="preferences-heading">
            <h2 id="preferences-heading">偏好设置</h2>
            <div className="preference-row">
              <span>Theme Mode</span>
              <div className="segmented" role="radiogroup" aria-label="Theme Mode">
                {(["dark", "light", "system"] as const).map((mode) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={themeMode === mode}
                    className={themeMode === mode ? "is-active" : ""}
                    key={mode}
                    disabled={theme.isPending || djPreferences.isPending}
                    onClick={() => {
                      theme.mutate({ next: mode, previous: themeMode });
                    }}
                  >
                    {themeLabels[mode]}
                  </button>
                ))}
              </div>
            </div>
            {themeError === undefined ? null : (
              <p className="inline-error" role="alert">
                {themeError}
              </p>
            )}
            {djPreferenceError === undefined ? null : (
              <p className="inline-error" role="alert">
                {djPreferenceError}
              </p>
            )}
            <label className="preference-row">
              <span>DJ Language</span>
              <select
                value={djLanguage}
                disabled={theme.isPending || djPreferences.isPending}
                onChange={(event) => {
                  const next = event.target.value as typeof djLanguage;
                  const previousLanguage = djLanguage;
                  setDjLanguage(next);
                  setDjPreferenceError(undefined);
                  setSaveMessage(undefined);
                  djPreferences.mutate({
                    command: { djLanguage: next },
                    previousLanguage,
                    previousVoiceStyle: voiceStyle,
                  });
                }}
              >
                <option value="zh-CN">中文</option>
                <option value="en-GB">English (UK)</option>
              </select>
            </label>
            <label className="preference-row">
              <span>DJ Voice Style</span>
              <select
                value={voiceStyle}
                disabled={theme.isPending || djPreferences.isPending}
                onChange={(event) => {
                  const next = event.target.value as typeof voiceStyle;
                  const previousVoiceStyle = voiceStyle;
                  setVoiceStyle(next);
                  setDjPreferenceError(undefined);
                  setSaveMessage(undefined);
                  djPreferences.mutate({
                    command: { djVoiceStyle: next },
                    previousLanguage: djLanguage,
                    previousVoiceStyle,
                  });
                }}
              >
                <option value="natural-radio">Natural Radio</option>
              </select>
            </label>
          </section>
          <section className="settings-section" aria-labelledby="data-heading">
            <h2 id="data-heading">本地数据</h2>
            <div className="data-card">
              <div>
                <span>数据路径</span>
                <strong>{settings.data?.dataRoot ?? "读取中…"}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setMigrationOpen((value) => !value);
                  }}
                >
                  Change
                </button>
              </div>
              <div>
                <span>目录策略</span>
                <strong>本机默认 · 最小权限</strong>
              </div>
            </div>
            {migrationOpen ? (
              <div className="migration-panel">
                <label>
                  新的数据目录
                  <input
                    value={targetDataRoot}
                    maxLength={300}
                    onChange={(event) => {
                      setTargetDataRoot(event.target.value);
                    }}
                    placeholder="输入空且可写的本地目录"
                  />
                </label>
                <p>迁移会先校验、checkpoint、备份和复制；失败时自动回滚，旧目录不会自动删除。</p>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={targetDataRoot.trim().length === 0 || migration.isPending}
                  onClick={() => {
                    migration.mutate();
                  }}
                >
                  {migration.isPending ? "正在启动…" : "安全迁移数据目录"}
                </button>
              </div>
            ) : null}
          </section>
          {saveMessage === undefined ? null : (
            <p
              className={save.isError || migration.isError ? "inline-error" : "inline-success"}
              role={save.isError || migration.isError ? "alert" : "status"}
            >
              {saveMessage}
            </p>
          )}
        </form>
      </main>
      <div className="settings-actions">
        <button
          className="button button--secondary"
          type="button"
          disabled={services.isFetching}
          onClick={() => void openDiagnostics()}
        >
          {services.isFetching ? "正在检测服务连接…" : "测试连接"}
        </button>
        <button
          className="button button--primary"
          form="settings-form"
          type="submit"
          disabled={save.isPending || settings.isLoading}
        >
          {save.isPending ? "正在保存…" : "保存配置"}
        </button>
      </div>
      <PrimaryNavigation active="settings" onNavigate={props.navigate} />
    </div>
  );
}
