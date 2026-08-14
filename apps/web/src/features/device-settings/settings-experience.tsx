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
import { Brand, OperationNotice, PrimaryNavigation, Status } from "../../shared/ui.js";
import { KoradioSelect } from "../../shared/koradio-select.js";
import { KoradioAvatar } from "../../shared/avatar.js";
import type { ServiceTransport } from "../../shared/transport.js";
import {
  deleteDeepseekApiKey,
  getDeepseekCredentialStatus,
  getDeviceSettings,
  getServiceHealth,
  getTtsModelStatus,
  installTtsModel,
  migrateDataRoot,
  saveDeepseekApiKey,
  testPlanner,
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
  planner: "AI Planner",
  netease: "NetEase Music API",
  tts: "Qwen3-TTS",
};

type ThemeMode = ProfileContext["preferences"]["themeMode"];

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
          <KoradioAvatar
            fallback={Array.from(current.profile.nickname).slice(0, 2).join("")}
            label="当前档案头像"
            reference={current.profile.avatarRef}
          />
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
      (item.service === "planner" || item.service === "netease") && item.status === "unavailable",
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
  const credentials = useQuery({
    queryKey: ["deepseek-credentials"],
    queryFn: () => getDeepseekCredentialStatus(props.transport),
  });
  const ttsModel = useQuery({
    queryKey: ["tts-model-status"],
    queryFn: () => getTtsModelStatus(props.transport),
    refetchInterval: (query) => (query.state.data?.state === "downloading" ? 1000 : false),
  });
  const [codexCommand, setCodexCommand] = useState("");
  const [plannerProvider, setPlannerProvider] = useState<"codex" | "deepseek">("codex");
  const [deepseekModel, setDeepseekModel] = useState<"deepseek-v4-flash" | "deepseek-v4-pro">(
    "deepseek-v4-flash",
  );
  const [deepseekPrivacyAccepted, setDeepseekPrivacyAccepted] = useState(false);
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [editingDeepseekKey, setEditingDeepseekKey] = useState(false);
  const [deleteKeyConfirmOpen, setDeleteKeyConfirmOpen] = useState(false);
  const [djLanguage, setDjLanguage] = useState(props.current.preferences.djLanguage);
  const [voiceStyle, setVoiceStyle] = useState(props.current.preferences.djVoiceStyle);
  const [themeMode, setThemeMode] = useState<ThemeMode>(props.current.preferences.themeMode);
  const [saveNotice, setSaveNotice] = useState<
    { message: string; tone: "success" | "error" } | undefined
  >();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [targetDataRoot, setTargetDataRoot] = useState("");

  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => {
    if (settings.data !== undefined) {
      setCodexCommand(settings.data.codexCommand ?? "");
      setPlannerProvider(settings.data.plannerProvider);
      setDeepseekModel(settings.data.deepseekModel);
      setDeepseekPrivacyAccepted(settings.data.deepseekPrivacyNoticeAccepted);
    }
  }, [settings.data]);
  useEffect(() => {
    applyTheme(props.current.preferences.themeMode);
  }, [props.current.preferences.themeMode]);
  useEffect(() => {
    if (ttsModel.data?.state === "ready") {
      void services.refetch();
    }
  }, [ttsModel.data?.state, services.refetch]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmedCommand = codexCommand.trim();
      if (
        plannerProvider === "codex" &&
        (trimmedCommand.length === 0 || trimmedCommand.length > 300)
      )
        throw new TypeError("CODEX_COMMAND_INVALID");
      if (plannerProvider === "deepseek" && !deepseekPrivacyAccepted) {
        throw new TypeError("DEEPSEEK_PRIVACY_REQUIRED");
      }
      if (plannerProvider === "deepseek" && !credentials.data?.configured) {
        throw new TypeError("DEEPSEEK_API_KEY_REQUIRED");
      }
      const device = await updateDeviceSettings(props.transport, {
        plannerProvider,
        deepseekModel,
        ...(deepseekPrivacyAccepted ? { deepseekPrivacyNoticeAccepted: true } : {}),
        ...(trimmedCommand.length === 0 ? {} : { codexCommand: trimmedCommand }),
      });
      const preferences = await updateProfilePreferences(
        props.transport,
        props.current.profile.id,
        { djLanguage, djVoiceStyle: voiceStyle },
      );
      return { device, preferences };
    },
    onSuccess: ({ device, preferences }) => {
      queryClient.setQueryData(["device-settings"], device);
      props.onCurrentChanged({ ...props.current, preferences });
      setSaveNotice({ message: "配置已保存。", tone: "success" });
    },
    onError: (error) => {
      setSaveNotice({
        message:
          error instanceof TypeError
            ? error.message === "DEEPSEEK_PRIVACY_REQUIRED"
              ? "请先阅读并确认 DeepSeek 隐私提示。"
              : error.message === "DEEPSEEK_API_KEY_REQUIRED"
                ? "启用 DeepSeek 前请先保存 API key。"
                : "Codex 命令路径为必填项，最多 300 个字符。"
            : "配置保存失败，当前运行配置保持不变。",
        tone: "error",
      });
    },
  });

  const theme = useMutation({
    mutationFn: async ({ next }: { next: ThemeMode; previous: ThemeMode }) =>
      updateProfilePreferences(props.transport, props.current.profile.id, { themeMode: next }),
    onMutate: ({ next }) => {
      setSaveNotice(undefined);
      setThemeMode(next);
      applyTheme(next);
    },
    onSuccess: (preferences) => {
      props.onCurrentChanged({ ...props.current, preferences });
      setSaveNotice({ message: "主题偏好已保存。", tone: "success" });
    },
    onError: (_error, { previous }) => {
      setThemeMode(previous);
      applyTheme(previous);
      setSaveNotice({ message: "主题偏好保存失败，已恢复到之前的主题。", tone: "error" });
    },
  });

  const migration = useMutation({
    mutationFn: () => migrateDataRoot(props.transport, targetDataRoot.trim()),
    onSuccess: () => {
      setSaveNotice({
        message: "数据目录迁移已安全启动；完成前旧目录会继续保留。",
        tone: "success",
      });
    },
    onError: () => {
      setSaveNotice({
        message: "数据目录迁移未启动，当前目录保持不变。请选择空且可写的目录。",
        tone: "error",
      });
    },
  });
  const installModel = useMutation({
    mutationFn: () => installTtsModel(props.transport),
    onSuccess: (status) => {
      queryClient.setQueryData(["tts-model-status"], status);
      setSaveNotice({
        message:
          status.state === "ready"
            ? "Qwen3-TTS 模型已就绪。"
            : "Qwen3-TTS 模型下载已启动，可离开此页面继续使用文字 DJ。",
        tone: "success",
      });
    },
    onError: () => {
      setSaveNotice({
        message: "Qwen3-TTS 模型下载未能启动，现有节目和文字 DJ 不受影响。",
        tone: "error",
      });
    },
  });
  const credential = useMutation({
    mutationFn: () => saveDeepseekApiKey(props.transport, deepseekApiKey.trim()),
    onSuccess: (status) => {
      queryClient.setQueryData(["deepseek-credentials"], status);
      setDeepseekApiKey("");
      setSaveNotice({ message: "DeepSeek API key 已安全写入系统钥匙串。", tone: "success" });
    },
    onError: () => {
      setSaveNotice({
        message: "DeepSeek API key 未能写入系统钥匙串，当前密钥状态保持不变。",
        tone: "error",
      });
    },
  });
  const removeCredential = useMutation({
    mutationFn: () => deleteDeepseekApiKey(props.transport),
    onSuccess: (status) => {
      queryClient.setQueryData(["deepseek-credentials"], status);
      setSaveNotice({ message: "DeepSeek API key 已从系统钥匙串删除。", tone: "success" });
    },
    onError: () => {
      setSaveNotice({
        message: "DeepSeek API key 未能删除，当前密钥状态保持不变。",
        tone: "error",
      });
    },
  });
  const plannerTest = useMutation({
    mutationFn: () => testPlanner(props.transport),
    onSuccess: () => {
      setSaveNotice({ message: "活动 AI 大脑连接检测成功。", tone: "success" });
    },
    onError: () => {
      setSaveNotice({
        message: "活动 AI 大脑检测失败；请检查配置、余额或稍后重试。",
        tone: "error",
      });
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
    setSaveNotice(undefined);
    const result = await services.refetch();
    if (result.data !== undefined) {
      setDiagnosticsOpen(true);
    } else {
      setSaveNotice({
        message: "服务检测失败，请确认 Local Service 仍可用后重试。",
        tone: "error",
      });
    }
  }

  function handleSave(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaveNotice(undefined);
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
      {privacyOpen ? (
        <div className="settings-modal-backdrop">
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deepseek-privacy-title"
          >
            <p className="settings-modal__eyebrow">DEEPSEEK · PRIVACY</p>
            <h2 id="deepseek-privacy-title">启用 DeepSeek 前请确认</h2>
            <p>
              为了持续对话与编排节目，Koradio 会将当前消息、当前 Profile 最近对话、已有
              EffectiveTaste、近 10 期节目摘要、音乐库摘要和 DJ 偏好发送到 DeepSeek。歌曲播放链接、
              本地文件、完整歌词和其他 Profile 数据不会发送。DeepSeek API 可能产生费用；Koradio
              不会把 API key 保存到数据库、浏览器或日志。
            </p>
            <div className="settings-modal__actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  setPrivacyOpen(false);
                }}
              >
                暂不启用
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => {
                  setDeepseekPrivacyAccepted(true);
                  setPlannerProvider("deepseek");
                  setPrivacyOpen(false);
                }}
              >
                我已了解，启用 DeepSeek
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {deleteKeyConfirmOpen ? (
        <div className="settings-modal-backdrop">
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-deepseek-key-title"
          >
            <p className="settings-modal__eyebrow">DEEPSEEK · KEY</p>
            <h2 id="delete-deepseek-key-title">删除 API key？</h2>
            <p>这会从系统钥匙串删除当前 DeepSeek API key。以后仍可在此重新配置。</p>
            <div className="settings-modal__actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  setDeleteKeyConfirmOpen(false);
                }}
                disabled={removeCredential.isPending}
              >
                取消
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => {
                  removeCredential.mutate(undefined, {
                    onSuccess: () => {
                      setDeleteKeyConfirmOpen(false);
                      setEditingDeepseekKey(false);
                      setDeepseekApiKey("");
                    },
                  });
                }}
                disabled={removeCredential.isPending}
              >
                {removeCredential.isPending ? "正在删除…" : "删除 key"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
        {settings.isLoading || services.isLoading || credentials.isLoading ? (
          <p className="settings-loading" aria-busy="true">
            正在读取本地配置与脱敏健康状态…
          </p>
        ) : null}
        {settings.isError || services.isError || credentials.isError ? (
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
                <button
                  type="button"
                  disabled={plannerTest.isPending}
                  onClick={() => {
                    if (item.service === "planner") {
                      plannerTest.mutate();
                    } else {
                      void openDiagnostics();
                    }
                  }}
                >
                  {item.service === "planner" || item.service === "tts" ? "Test" : "查看"}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <form className="settings-form" id="settings-form" onSubmit={handleSave}>
          <section className="settings-section" aria-labelledby="config-heading">
            <h2 id="config-heading">服务配置</h2>
            <div className="settings-field">
              <span>AI 大脑</span>
              <KoradioSelect
                aria-label="AI 大脑"
                value={plannerProvider}
                onChange={(next) => {
                  if (next === "deepseek" && !deepseekPrivacyAccepted) {
                    setPrivacyOpen(true);
                    return;
                  }
                  setPlannerProvider(next);
                }}
                options={[
                  { value: "codex", label: "Codex · 本机 CLI" },
                  { value: "deepseek", label: "DeepSeek · 远程 API" },
                ]}
              />
            </div>
            <label className="settings-field">
              <span>Codex 命令路径</span>
              <input
                value={codexCommand}
                maxLength={300}
                required={plannerProvider === "codex"}
                onChange={(event) => {
                  setCodexCommand(event.target.value);
                }}
                placeholder="输入本机 Codex 可执行命令路径"
              />
            </label>
            <div className="settings-field">
              <span>DeepSeek 模型</span>
              <KoradioSelect
                aria-label="DeepSeek 模型"
                value={deepseekModel}
                disabled={plannerProvider !== "deepseek"}
                onChange={(next) => {
                  setDeepseekModel(next);
                }}
                options={[
                  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash · 快速" },
                  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro · 品质" },
                ]}
              />
            </div>
            <div className="provider-readonly deepseek-credentials-card">
              <span>DeepSeek API key</span>
              <strong>{credentials.data?.configured ? "已配置" : "未配置"}</strong>
              {credentials.data?.configured && !editingDeepseekKey ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDeepseekKey(true);
                  }}
                >
                  编辑
                </button>
              ) : (
                <>
                  <input
                    type="password"
                    value={deepseekApiKey}
                    autoComplete="new-password"
                    maxLength={8192}
                    onChange={(event) => {
                      setDeepseekApiKey(event.target.value);
                    }}
                    placeholder="粘贴 DeepSeek API key"
                    aria-label="DeepSeek API key"
                  />
                  <div className="provider-actions">
                    <button
                      type="button"
                      disabled={deepseekApiKey.trim().length === 0 || credential.isPending}
                      onClick={() => {
                        credential.mutate(undefined, {
                          onSuccess: () => {
                            setDeepseekApiKey("");
                            setEditingDeepseekKey(false);
                          },
                        });
                      }}
                    >
                      {credential.isPending
                        ? "正在保存…"
                        : credentials.data?.configured
                          ? "替换 key"
                          : "保存 key"}
                    </button>
                    {credentials.data?.configured ? (
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={removeCredential.isPending}
                        onClick={() => {
                          setDeleteKeyConfirmOpen(true);
                        }}
                      >
                        删除 key
                      </button>
                    ) : null}
                    {credentials.data?.configured ? (
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={() => {
                          setDeepseekApiKey("");
                          setEditingDeepseekKey(false);
                        }}
                      >
                        取消
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            <div className="provider-readonly">
              <span>NetEase Music API</span>
              <strong>内置 · 本地模式</strong>
            </div>
            <div className="provider-readonly tts-model-card">
              <span>Qwen3-TTS 8-bit</span>
              <strong>{modelStatusLabel(ttsModel.data)}</strong>
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
            </div>
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
                    disabled={theme.isPending}
                    onClick={() => {
                      theme.mutate({ next: mode, previous: themeMode });
                    }}
                  >
                    {themeLabels[mode]}
                  </button>
                ))}
              </div>
            </div>
            <div className="preference-row">
              <span>DJ Language</span>
              <KoradioSelect
                aria-label="DJ Language"
                value={djLanguage}
                onChange={(next) => {
                  setDjLanguage(next);
                }}
                options={[
                  { value: "zh-CN", label: "中文" },
                  { value: "en-GB", label: "English (UK)" },
                ]}
              />
            </div>
            <div className="preference-row">
              <span>DJ Voice Style</span>
              <KoradioSelect
                aria-label="DJ Voice Style"
                value={voiceStyle}
                onChange={(next) => {
                  setVoiceStyle(next);
                }}
                options={[{ value: "natural-radio", label: "Natural Radio" }]}
              />
            </div>
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
      {saveNotice === undefined ? null : (
        <OperationNotice
          message={saveNotice.message}
          tone={saveNotice.tone}
          onDismiss={() => {
            setSaveNotice(undefined);
          }}
        />
      )}
    </div>
  );
}
