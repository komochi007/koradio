import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileContext, TasteResponse } from "@koradio/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
  type SyntheticEvent,
} from "react";

import type { ServiceTransport } from "../../shared/transport.js";
import { Brand, PrimaryNavigation, Status } from "../../shared/ui.js";
import { getTaste, updateTasteOverrides } from "./api.js";
import {
  createTasteDraft,
  isTasteEmpty,
  moveTasteValue,
  normalizeTasteDraft,
  stableUniqueTags,
  tasteLimits,
  validateTasteDraft,
  type TasteDraft,
  type TasteDraftField,
  type TasteValidationError,
} from "./taste-form.js";
import "./taste.css";

interface TasteExperienceProps {
  current: ProfileContext;
  headingRef: RefObject<HTMLHeadingElement | null>;
  navigate: (path: string) => void;
  onOpenProfiles: () => void;
  reconnecting: boolean;
  transport: ServiceTransport;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function signalLabel(value: string): string {
  const separator = value.indexOf(":");
  const kind = separator < 0 ? "signal" : value.slice(0, separator);
  const identity = separator < 0 ? value : value.slice(separator + 1);
  const shortIdentity = identity.length > 12 ? `…${identity.slice(-8)}` : identity;
  if (kind === "track") return `歌曲偏好 · ${shortIdentity}`;
  if (kind === "program") return `节目收藏 · ${shortIdentity}`;
  return value;
}

function TasteTopbar({
  current,
  onOpenProfiles,
  reconnecting,
}: Pick<TasteExperienceProps, "current" | "onOpenProfiles" | "reconnecting">): ReactElement {
  return (
    <header className="topbar taste-topbar">
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
  );
}

function SectionHeading({
  count,
  id,
  title,
}: {
  count?: string;
  id: string;
  title: string;
}): ReactElement {
  return (
    <header className="taste-section-heading">
      <h2 id={id}>{title}</h2>
      {count === undefined ? null : <p>{count}</p>}
    </header>
  );
}

function TasteStatePanel({
  action,
  actionLabel,
  error = false,
  loading = false,
  title,
  children,
}: {
  action?: () => void;
  actionLabel?: string;
  children: string;
  error?: boolean;
  loading?: boolean;
  title: string;
}): ReactElement {
  return (
    <section
      className={`taste-state${error ? " taste-state--error" : ""}`}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      aria-busy={loading || undefined}
    >
      <span className="taste-state__symbol" aria-hidden="true">
        {loading ? "≈" : error ? "!" : "+"}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
      {action === undefined || actionLabel === undefined ? null : (
        <button className="button button--secondary" type="button" onClick={action}>
          {actionLabel}
        </button>
      )}
      {loading ? (
        <span className="taste-state__loading" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </section>
  );
}

function TasteOverview({ taste }: { taste: TasteResponse }): ReactElement {
  const manualTags = useMemo(
    () => new Set(taste.overrides.tags.map((tag) => tag.trim().toLocaleLowerCase("en-US"))),
    [taste.overrides.tags],
  );
  const manualAvoidRules = useMemo(
    () => new Set(taste.overrides.avoidRules.map((rule) => rule.trim().toLocaleLowerCase("en-US"))),
    [taste.overrides.avoidRules],
  );
  const manualCount =
    taste.overrides.tags.length +
    taste.overrides.avoidRules.length +
    taste.overrides.sceneRules.length;
  const effectiveCount =
    taste.effective.resolvedTaste.tags.length +
    taste.effective.resolvedTaste.affinities.length +
    taste.effective.resolvedTaste.avoidRules.length +
    taste.effective.resolvedTaste.sceneRules.length;
  const automaticSignals = [
    ...taste.projection.affinities.map((value) => ({ tone: "positive", value })),
    ...taste.projection.avoidSignals.map((value) => ({ tone: "avoid", value })),
  ];

  return (
    <>
      <section className="taste-overview" aria-labelledby="taste-overview-title">
        <SectionHeading id="taste-overview-title" title="品味概览" />
        <article className="taste-overview-card">
          <p>
            Koradio 已从 {taste.projection.sourceVersion} 条反馈形成自动投影，并合并 {manualCount}
            条人工规则。人工规则始终优先，投影重建不会覆盖你的编辑。
          </p>
          <dl>
            <div>
              <dt>AUTO PROJECTION</dt>
              <dd>
                <b>{taste.projection.sourceVersion}</b>
                <span>反馈版本</span>
              </dd>
            </div>
            <div>
              <dt>MANUAL RULES</dt>
              <dd>
                <b>{manualCount}</b>
                <span>人工条目</span>
              </dd>
            </div>
            <div>
              <dt>EFFECTIVE TASTE</dt>
              <dd>
                <b>{effectiveCount}</b>
                <span>有效偏好</span>
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="taste-genres" aria-labelledby="taste-genres-title">
        <SectionHeading
          count={`${String(taste.effective.resolvedTaste.tags.length)} 个标签`}
          id="taste-genres-title"
          title="常听风格"
        />
        <div className="taste-tag-cloud">
          {taste.effective.resolvedTaste.tags.length === 0 ? (
            <p>还没有形成风格标签。</p>
          ) : (
            taste.effective.resolvedTaste.tags.map((tag) => (
              <span key={tag}>
                {tag}
                <small>
                  {manualTags.has(tag.trim().toLocaleLowerCase("en-US")) ? "人工" : "自动"}
                </small>
              </span>
            ))
          )}
        </div>
      </section>

      <div className="taste-preference-grid">
        <section aria-labelledby="taste-signals-title">
          <SectionHeading id="taste-signals-title" title="自动形成" />
          <ul className="taste-rule-card">
            {automaticSignals.length === 0 ? (
              <li className="taste-rule-card__empty">还没有歌曲或节目偏好信号</li>
            ) : (
              automaticSignals.map((signal) => (
                <li key={`${signal.tone}-${signal.value}`}>
                  <i aria-hidden="true">{signal.tone === "positive" ? "+" : "−"}</i>
                  <span>{signalLabel(signal.value)}</span>
                  <small>{signal.tone === "positive" ? "偏好" : "避雷"}</small>
                </li>
              ))
            )}
          </ul>
        </section>
        <section aria-labelledby="taste-avoid-title">
          <SectionHeading id="taste-avoid-title" title="有效避雷规则" />
          <ul className="taste-rule-card">
            {taste.effective.resolvedTaste.avoidRules.length === 0 ? (
              <li className="taste-rule-card__empty">还没有避雷规则</li>
            ) : (
              taste.effective.resolvedTaste.avoidRules.map((rule) => (
                <li key={rule}>
                  <i aria-hidden="true">−</i>
                  <span>{signalLabel(rule)}</span>
                  <small>
                    {manualAvoidRules.has(rule.trim().toLocaleLowerCase("en-US")) ? "人工" : "自动"}
                  </small>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="taste-scenes" aria-labelledby="taste-scenes-title">
        <SectionHeading
          count={`${String(taste.effective.resolvedTaste.sceneRules.length)} / 20`}
          id="taste-scenes-title"
          title="场景偏好"
        />
        <div className="taste-scene-grid">
          {taste.effective.resolvedTaste.sceneRules.length === 0 ? (
            <article>
              <span aria-hidden="true">○</span>
              <p>还没有人工场景规则。</p>
            </article>
          ) : (
            taste.effective.resolvedTaste.sceneRules.map((rule, index) => (
              <article key={`${String(index)}-${rule}`}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <p>{rule}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="taste-feedback" aria-labelledby="taste-feedback-title">
        <SectionHeading
          count={`PROJECTION v${String(taste.effective.projectionVersion)}`}
          id="taste-feedback-title"
          title="最近反馈摘要"
        />
        <div>
          <span aria-hidden="true">↗</span>
          <p>
            <strong>已记录 {taste.projection.sourceVersion} 条反馈</strong>
            <small>这些事实只重建自动投影，不会改写人工规则。</small>
          </p>
          <time dateTime={taste.projection.updatedAt}>
            {formatUpdatedAt(taste.projection.updatedAt)}
          </time>
        </div>
      </section>
    </>
  );
}

function fieldError(
  errors: readonly TasteValidationError[],
  field: TasteDraftField,
  index?: number,
): string | undefined {
  return errors.find((error) => error.field === field && error.index === index)?.message;
}

function ReorderButtons({
  disabled,
  index,
  label,
  length,
  onMove,
  onRemove,
}: {
  disabled: boolean;
  index: number;
  label: string;
  length: number;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <span className="taste-reorder">
      <button
        type="button"
        disabled={disabled || index === 0}
        aria-label={`上移${label}`}
        onClick={() => {
          onMove("up");
        }}
      >
        ↑
      </button>
      <button
        type="button"
        disabled={disabled || index === length - 1}
        aria-label={`下移${label}`}
        onClick={() => {
          onMove("down");
        }}
      >
        ↓
      </button>
      <button type="button" disabled={disabled} aria-label={`删除${label}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

function TasteEditor({
  draft,
  errors,
  headingRef,
  onCancel,
  onChange,
  onSave,
  saveError,
  saving,
  setErrors,
  taste,
}: {
  draft: TasteDraft;
  errors: TasteValidationError[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  onCancel: () => void;
  onChange: (draft: TasteDraft) => void;
  onSave: (event: SyntheticEvent<HTMLFormElement>) => void;
  saveError: string | undefined;
  saving: boolean;
  setErrors: (errors: TasteValidationError[]) => void;
  taste: TasteResponse;
}): ReactElement {
  const [tagInput, setTagInput] = useState("");
  const [tagMessage, setTagMessage] = useState<string>();
  const tagInputRef = useRef<HTMLInputElement>(null);

  function updateField(field: TasteDraftField, values: string[]): void {
    onChange({ ...draft, [field]: values });
    setErrors(errors.filter((error) => error.field !== field));
  }

  function updateValue(field: TasteDraftField, index: number, value: string): void {
    updateField(
      field,
      draft[field].map((current, currentIndex) => (currentIndex === index ? value : current)),
    );
  }

  function removeValue(field: TasteDraftField, index: number): void {
    updateField(
      field,
      draft[field].filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function moveValue(field: TasteDraftField, index: number, direction: "up" | "down"): void {
    updateField(field, moveTasteValue(draft[field], index, direction));
  }

  function addTag(): void {
    const normalized = tagInput.trim();
    if (normalized.length === 0 || normalized.length > tasteLimits.tags.length) {
      setTagMessage("每个标签需在 24 个字符内");
      tagInputRef.current?.focus();
      return;
    }
    if (draft.tags.length >= tasteLimits.tags.count) {
      setTagMessage("风格标签最多 30 个");
      return;
    }
    const tags = stableUniqueTags([...draft.tags, normalized]);
    if (tags.length === draft.tags.length) {
      setTagMessage("已合并重复标签");
      setTagInput("");
      return;
    }
    updateField("tags", tags);
    setTagInput("");
    setTagMessage(undefined);
    tagInputRef.current?.focus();
  }

  return (
    <div className="app-surface taste-page taste-page--edit">
      <header className="topbar taste-edit-topbar">
        <button className="icon-button" type="button" aria-label="返回音乐品味" onClick={onCancel}>
          ←
        </button>
        <Brand />
      </header>
      <form className="taste-edit-form" onSubmit={onSave} noValidate>
        <main className="taste-edit-main">
          <header className="taste-edit-heading">
            <h1 ref={headingRef} tabIndex={-1}>
              编辑音乐品味
            </h1>
            <p>上次更新 · {formatUpdatedAt(taste.overrides.updatedAt)}</p>
          </header>

          <fieldset disabled={saving}>
            <section className="taste-edit-section" aria-labelledby="taste-edit-tags-title">
              <SectionHeading
                count={`${String(draft.tags.length)} / 30`}
                id="taste-edit-tags-title"
                title="常听风格"
              />
              <p className="taste-edit-help">最多 30 个标签，可用上下按钮调整优先级。</p>
              <ol className="taste-edit-tags">
                {draft.tags.map((tag, index) => (
                  <li key={`${String(index)}-${tag}`}>
                    <strong>{tag}</strong>
                    <ReorderButtons
                      disabled={saving}
                      index={index}
                      label={`标签 ${tag}`}
                      length={draft.tags.length}
                      onMove={(direction) => {
                        moveValue("tags", index, direction);
                      }}
                      onRemove={() => {
                        removeValue("tags", index);
                      }}
                    />
                  </li>
                ))}
              </ol>
              <div className="taste-add-control">
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  maxLength={tasteLimits.tags.length}
                  aria-label="新风格标签"
                  aria-invalid={tagMessage !== undefined}
                  aria-describedby={tagMessage === undefined ? undefined : "taste-tag-message"}
                  placeholder="添加风格标签"
                  onChange={(event) => {
                    setTagInput(event.target.value);
                    setTagMessage(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={draft.tags.length >= tasteLimits.tags.count}
                  onClick={addTag}
                >
                  添加标签
                </button>
              </div>
              {tagMessage === undefined ? null : (
                <p className="taste-field-message" id="taste-tag-message" role="status">
                  {tagMessage}
                </p>
              )}
            </section>

            <section className="taste-edit-section" aria-labelledby="taste-edit-avoid-title">
              <SectionHeading
                count={`${String(draft.avoidRules.length)} / 20`}
                id="taste-edit-avoid-title"
                title="避雷规则"
              />
              <ol className="taste-edit-rule-list">
                {draft.avoidRules.map((rule, index) => {
                  const error = fieldError(errors, "avoidRules", index);
                  return (
                    <li key={index}>
                      <label htmlFor={`taste-avoid-${String(index)}`}>避雷规则 {index + 1}</label>
                      <input
                        id={`taste-avoid-${String(index)}`}
                        data-field="avoidRules"
                        data-index={index}
                        value={rule}
                        maxLength={tasteLimits.avoidRules.length}
                        aria-invalid={error !== undefined}
                        aria-describedby={
                          error === undefined ? undefined : `taste-avoid-error-${String(index)}`
                        }
                        onChange={(event) => {
                          updateValue("avoidRules", index, event.target.value);
                        }}
                      />
                      <ReorderButtons
                        disabled={saving}
                        index={index}
                        label={`避雷规则 ${String(index + 1)}`}
                        length={draft.avoidRules.length}
                        onMove={(direction) => {
                          moveValue("avoidRules", index, direction);
                        }}
                        onRemove={() => {
                          removeValue("avoidRules", index);
                        }}
                      />
                      {error === undefined ? null : (
                        <p id={`taste-avoid-error-${String(index)}`} role="alert">
                          {error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
              <button
                className="taste-add-row"
                type="button"
                disabled={draft.avoidRules.length >= tasteLimits.avoidRules.count}
                onClick={() => {
                  updateField("avoidRules", [...draft.avoidRules, ""]);
                }}
              >
                <span aria-hidden="true">＋</span>
                添加避雷规则
                <small>最多 120 字</small>
              </button>
            </section>

            <section className="taste-edit-section" aria-labelledby="taste-edit-scenes-title">
              <SectionHeading
                count={`${String(draft.sceneRules.length)} / 20`}
                id="taste-edit-scenes-title"
                title="场景偏好"
              />
              <ol className="taste-edit-scene-list">
                {draft.sceneRules.map((rule, index) => {
                  const error = fieldError(errors, "sceneRules", index);
                  return (
                    <li key={index}>
                      <label htmlFor={`taste-scene-${String(index)}`}>场景规则 {index + 1}</label>
                      <textarea
                        id={`taste-scene-${String(index)}`}
                        data-field="sceneRules"
                        data-index={index}
                        value={rule}
                        maxLength={tasteLimits.sceneRules.length}
                        aria-invalid={error !== undefined}
                        aria-describedby={
                          error === undefined ? undefined : `taste-scene-error-${String(index)}`
                        }
                        onChange={(event) => {
                          updateValue("sceneRules", index, event.target.value);
                        }}
                      />
                      <ReorderButtons
                        disabled={saving}
                        index={index}
                        label={`场景规则 ${String(index + 1)}`}
                        length={draft.sceneRules.length}
                        onMove={(direction) => {
                          moveValue("sceneRules", index, direction);
                        }}
                        onRemove={() => {
                          removeValue("sceneRules", index);
                        }}
                      />
                      {error === undefined ? null : (
                        <p id={`taste-scene-error-${String(index)}`} role="alert">
                          {error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
              <button
                className="taste-add-row"
                type="button"
                disabled={draft.sceneRules.length >= tasteLimits.sceneRules.count}
                onClick={() => {
                  updateField("sceneRules", [...draft.sceneRules, ""]);
                }}
              >
                <span aria-hidden="true">＋</span>
                添加场景规则
                <small>最多 160 字</small>
              </button>
            </section>
          </fieldset>
        </main>
        <footer
          className={`taste-edit-action${saveError === undefined ? "" : " taste-edit-action--error"}`}
        >
          <div>
            <p role={saveError === undefined ? "status" : "alert"} aria-live="polite">
              {saveError ?? "修改将在下一次节目生成时生效"}
            </p>
            <span>
              <button
                className="button button--ghost"
                type="button"
                disabled={saving}
                onClick={onCancel}
              >
                取消
              </button>
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "保存中…" : saveError === undefined ? "保存品味" : "重新保存"}
              </button>
            </span>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function TasteExperience(props: TasteExperienceProps): ReactElement {
  const profileId = props.current.profile.id;
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TasteDraft>();
  const [errors, setErrors] = useState<TasteValidationError[]>([]);
  const [saveError, setSaveError] = useState<string>();
  const [actionMessage, setActionMessage] = useState<string>();
  const taste = useQuery({
    queryKey: ["taste", profileId],
    queryFn: () => getTaste(props.transport, profileId),
  });
  const update = useMutation({
    mutationFn: (command: TasteDraft) =>
      updateTasteOverrides(props.transport, profileId, normalizeTasteDraft(command)),
    onSuccess: (result) => {
      queryClient.setQueryData<TasteResponse>(["taste", profileId], result);
      setDraft(createTasteDraft(result));
      setErrors([]);
      setSaveError(undefined);
      setEditing(false);
      setActionMessage("已更新你的音乐品味");
    },
    onError: () => {
      setSaveError("保存失败，内容已保留");
    },
  });

  useEffect(() => {
    props.headingRef.current?.focus();
  }, [editing, props.headingRef, taste.data]);

  function beginEditing(): void {
    if (taste.data === undefined) return;
    setDraft(createTasteDraft(taste.data));
    setErrors([]);
    setSaveError(undefined);
    setActionMessage(undefined);
    setEditing(true);
  }

  function cancelEditing(): void {
    if (taste.data !== undefined) setDraft(createTasteDraft(taste.data));
    setErrors([]);
    setSaveError(undefined);
    setEditing(false);
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (draft === undefined) return;
    const nextErrors = validateTasteDraft(draft);
    setErrors(nextErrors);
    setSaveError(undefined);
    const first = nextErrors[0];
    if (first !== undefined) {
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>(
            `[data-field="${first.field}"][data-index="${String(first.index ?? 0)}"]`,
          )
          ?.focus();
      });
      return;
    }
    update.mutate(draft);
  }

  if (editing && taste.data !== undefined && draft !== undefined) {
    return (
      <div ref={formRef}>
        <TasteEditor
          draft={draft}
          errors={errors}
          headingRef={props.headingRef}
          onCancel={cancelEditing}
          onChange={setDraft}
          onSave={submit}
          saveError={saveError}
          saving={update.isPending}
          setErrors={setErrors}
          taste={taste.data}
        />
      </div>
    );
  }

  return (
    <div className="app-surface taste-page">
      <TasteTopbar
        current={props.current}
        onOpenProfiles={props.onOpenProfiles}
        reconnecting={props.reconnecting}
      />
      <main className="taste-main">
        <header className="taste-heading">
          <div>
            <h1 ref={props.headingRef} tabIndex={-1}>
              你的音乐品味
            </h1>
            <p>由播放、跳过、喜欢和人工规则逐步形成。</p>
          </div>
          <button
            className="button button--secondary taste-edit-button"
            type="button"
            disabled={taste.data === undefined}
            onClick={beginEditing}
          >
            <span aria-hidden="true">✎</span>编辑品味
          </button>
        </header>

        {taste.isPending ? (
          <TasteStatePanel loading title="正在读取你的品味档案...">
            正在整理自动投影、人工规则与最终有效结果。
          </TasteStatePanel>
        ) : taste.isError ? (
          <TasteStatePanel
            error
            title="无法读取当前档案的音乐品味"
            action={props.onOpenProfiles}
            actionLabel="重新选择档案"
          >
            档案内容没有被修改。请重新选择档案后再试。
          </TasteStatePanel>
        ) : isTasteEmpty(taste.data) ? (
          <TasteStatePanel
            title="播放和反馈后会在这里形成你的音乐品味"
            action={() => {
              props.navigate("/radio");
            }}
            actionLabel="去 Radio 开始播放"
          >
            先生成几次电台，让 Koradio 认识你；也可以直接编辑人工规则。
          </TasteStatePanel>
        ) : (
          <TasteOverview taste={taste.data} />
        )}
        <div className="taste-announcer" role="status" aria-live="polite">
          {actionMessage}
        </div>
      </main>
      <PrimaryNavigation active="taste" onNavigate={props.navigate} />
    </div>
  );
}
