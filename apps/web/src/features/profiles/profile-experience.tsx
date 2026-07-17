import { useMutation } from "@tanstack/react-query";
import {
  createProfileCommandSchema,
  type CreateProfileCommand,
  type Profile,
  type ProfileContext,
} from "@koradio/contracts";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type SyntheticEvent,
} from "react";

import { Brand } from "../../shared/ui.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { createProfile, selectProfile, updateProfile, uploadAvatar } from "./api.js";

interface ProfileExperienceProps {
  current: ProfileContext | null;
  initialMode: "create" | "select";
  onCancel: (() => void) | undefined;
  onProfileChanged: (current: ProfileContext) => void;
  onProfilesChanged: () => Promise<unknown>;
  profiles: Profile[];
  transport: ServiceTransport;
}

interface ProfileDraft {
  avatarFile: File | undefined;
  avatarRef: string | null;
  defaultScenario: string;
  frequentGenres: string[];
  nickname: string;
  radioName: string;
}

function initials(profile: Pick<Profile, "nickname" | "radioName">): string {
  return Array.from(profile.nickname.trim() || profile.radioName.trim())
    .slice(0, 2)
    .join("");
}

function Avatar({
  profile,
  previewUrl,
}: {
  profile: Pick<Profile, "nickname" | "radioName">;
  previewUrl: string | undefined;
}): ReactElement {
  return (
    <span className="profile-avatar" aria-hidden="true">
      {previewUrl === undefined ? (
        <span>{initials(profile)}</span>
      ) : (
        <img src={previewUrl} alt="" />
      )}
    </span>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.includes("avatar")) {
    return "头像未能安全保存，请选择 5 MB 以内的 JPG、PNG 或 WebP 图片后重试。";
  }
  return fallback;
}

function ProfileSelect({
  current,
  onCancel,
  onCreate,
  onEdit,
  onSelect,
  pendingId,
  profiles,
  selectionError,
}: {
  current: ProfileContext | null;
  onCancel: (() => void) | undefined;
  onCreate: () => void;
  onEdit: (profile: Profile) => void;
  onSelect: (profile: Profile) => void;
  pendingId: string | undefined;
  profiles: Profile[];
  selectionError: string | undefined;
}): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="app-surface profile-page">
      <header className="topbar profile-topbar">
        <Brand />
        {onCancel === undefined ? null : (
          <button
            className="icon-button"
            type="button"
            onClick={onCancel}
            aria-label="关闭档案选择"
          >
            ×
          </button>
        )}
      </header>
      <main className="profile-main profile-main--select">
        <div className="profile-heading">
          <p className="eyebrow">LOCAL LISTENER PROFILES</p>
          <h1 ref={headingRef} tabIndex={-1}>
            选择你的电台档案
          </h1>
          <p>每个档案都有独立的品味、节目历史与偏好，数据只保存在这台设备上。</p>
        </div>
        {selectionError === undefined ? null : (
          <p className="inline-error" role="alert">
            {selectionError}
          </p>
        )}
        <div className="profile-list" aria-busy={pendingId !== undefined}>
          {profiles.map((profile) => {
            const isCurrent = current?.profile.id === profile.id;
            const isPending = pendingId === profile.id;
            return (
              <article className="profile-card" key={profile.id}>
                <Avatar profile={profile} previewUrl={undefined} />
                <button
                  className="profile-card__select"
                  type="button"
                  onClick={() => {
                    onSelect(profile);
                  }}
                  disabled={pendingId !== undefined || isCurrent}
                  aria-label={`${isCurrent ? "当前档案" : "选择档案"}：${profile.radioName}`}
                >
                  <span className="profile-card__copy">
                    <strong>{profile.radioName}</strong>
                    <span>@{profile.nickname}</span>
                    <small>
                      {profile.frequentGenres.length === 0
                        ? "还没有常听风格"
                        : profile.frequentGenres.join(" · ")}
                    </small>
                  </span>
                  <span className="profile-card__rail">
                    {isCurrent ? <em>CURRENT</em> : null}
                    <b aria-hidden="true">{isPending ? "…" : "→"}</b>
                  </span>
                </button>
                <button
                  className="profile-card__edit"
                  type="button"
                  onClick={() => {
                    onEdit(profile);
                  }}
                  disabled={pendingId !== undefined}
                >
                  编辑档案
                </button>
              </article>
            );
          })}
          <button
            className="profile-create-card"
            type="button"
            onClick={onCreate}
            disabled={pendingId !== undefined}
          >
            <span aria-hidden="true">＋</span>
            <strong>创建新的电台档案</strong>
            <small>为另一位听众建立独立的本地空间</small>
          </button>
        </div>
        <p className="profile-privacy">⌁ 所有档案、品味和节目记录仅保存在这台设备上。</p>
      </main>
    </div>
  );
}

function ProfileForm({
  onBack,
  onSaved,
  profile,
  transport,
}: {
  onBack: () => void;
  onSaved: (profile: Profile) => Promise<void>;
  profile: Profile | undefined;
  transport: ServiceTransport;
}): ReactElement {
  const fileInputId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<ProfileDraft>({
    avatarFile: undefined,
    avatarRef: profile?.avatarRef ?? null,
    defaultScenario: profile?.defaultScenario ?? "",
    frequentGenres: profile?.frequentGenres ?? [],
    nickname: profile?.nickname ?? "",
    radioName: profile?.radioName ?? "",
  });
  const [genreDraft, setGenreDraft] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const previewUrl = useMemo(
    () => (draft.avatarFile === undefined ? undefined : URL.createObjectURL(draft.avatarFile)),
    [draft.avatarFile],
  );
  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      if (previewUrl !== undefined) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = createProfileCommandSchema.safeParse({
        radioName: draft.radioName,
        nickname: draft.nickname,
        avatarRef: draft.avatarRef,
        frequentGenres: draft.frequentGenres,
        defaultScenario: draft.defaultScenario,
      });
      if (!parsed.success) throw new TypeError("PROFILE_FORM_INVALID");

      let avatarRef = parsed.data.avatarRef;
      if (draft.avatarFile !== undefined)
        avatarRef = await uploadAvatar(transport, draft.avatarFile);
      const command: CreateProfileCommand = { ...parsed.data, avatarRef };
      return profile === undefined
        ? createProfile(transport, command)
        : updateProfile(transport, profile.id, command);
    },
    onSuccess: onSaved,
  });

  function addGenre(): void {
    const genre = genreDraft.trim();
    if (genre.length === 0) return;
    if (genre.length > 24) {
      setValidationError("单个风格标签最多 24 个字符。");
      return;
    }
    if (draft.frequentGenres.length >= 12) {
      setValidationError("常听风格最多添加 12 个标签。");
      return;
    }
    if (
      draft.frequentGenres.some((item) => item.toLocaleLowerCase() === genre.toLocaleLowerCase())
    ) {
      setValidationError("这个风格已经添加过了。");
      return;
    }
    setDraft((value) => ({ ...value, frequentGenres: [...value.frequentGenres, genre] }));
    setGenreDraft("");
    setValidationError(undefined);
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setValidationError(undefined);
    if (draft.radioName.trim().length < 2 || draft.nickname.trim().length < 1) {
      setValidationError("请填写 2–24 个字符的电台名称和 1–20 个字符的昵称。");
      return;
    }
    save.mutate();
  }

  return (
    <div className="app-surface profile-page">
      <header className="topbar profile-topbar">
        <div className="profile-back-brand">
          <button className="icon-button" type="button" onClick={onBack} aria-label="返回档案选择">
            ←
          </button>
          <Brand />
        </div>
      </header>
      <main className="profile-main profile-main--form">
        <div className="profile-heading">
          <h1 ref={headingRef} tabIndex={-1}>
            {profile === undefined ? "创建电台档案" : "编辑电台档案"}
          </h1>
          <p>先留下少量线索，Koradio 会在之后的播放和反馈中继续理解你。</p>
        </div>
        <form className="profile-form" onSubmit={handleSubmit} noValidate>
          <fieldset className="avatar-field">
            <legend>头像</legend>
            <Avatar
              profile={{ nickname: draft.nickname, radioName: draft.radioName }}
              previewUrl={previewUrl}
            />
            <div>
              <label className="button button--secondary" htmlFor={fileInputId}>
                选择头像
              </label>
              <input
                id={fileInputId}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setDraft((value) => ({ ...value, avatarFile: event.target.files?.[0] }));
                }}
              />
              <p>支持本地 JPG、PNG、WebP，最大 5 MB，不会上传到云端。</p>
            </div>
          </fieldset>
          <label className="form-field">
            <span>电台名称</span>
            <span className="input-wrap">
              <input
                value={draft.radioName}
                maxLength={24}
                required
                onChange={(event) => {
                  setDraft((value) => ({ ...value, radioName: event.target.value }));
                }}
              />
              <small>{draft.radioName.length} / 24</small>
            </span>
          </label>
          <label className="form-field">
            <span>你的昵称</span>
            <span className="input-wrap">
              <input
                value={draft.nickname}
                maxLength={20}
                required
                onChange={(event) => {
                  setDraft((value) => ({ ...value, nickname: event.target.value }));
                }}
              />
              <small>{draft.nickname.length} / 20</small>
            </span>
          </label>
          <fieldset className="genre-field">
            <legend>常听风格</legend>
            <div className="genre-list">
              {draft.frequentGenres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => {
                    setDraft((value) => ({
                      ...value,
                      frequentGenres: value.frequentGenres.filter((item) => item !== genre),
                    }));
                  }}
                  aria-label={`移除 ${genre}`}
                >
                  {genre}
                  <span aria-hidden="true"> ×</span>
                </button>
              ))}
            </div>
            <div className="genre-add">
              <input
                aria-label="添加常听风格"
                value={genreDraft}
                maxLength={24}
                placeholder="例如 Ambient"
                onChange={(event) => {
                  setGenreDraft(event.target.value);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addGenre();
                  }
                }}
              />
              <button type="button" onClick={addGenre}>
                添加风格
              </button>
            </div>
            <p>最多选择 12 个标签</p>
          </fieldset>
          <label className="form-field">
            <span>默认场景</span>
            <span className="input-wrap">
              <textarea
                value={draft.defaultScenario}
                maxLength={120}
                onChange={(event) => {
                  setDraft((value) => ({ ...value, defaultScenario: event.target.value }));
                }}
              />
              <small>{draft.defaultScenario.length} / 120</small>
            </span>
          </label>
          <p className="profile-privacy">⌁ 档案、播放历史与音乐偏好将保存在本地数据目录中。</p>
          {validationError === undefined && !save.isError ? null : (
            <p className="inline-error" role="alert">
              {validationError ??
                errorMessage(save.error, "档案保存失败，请检查本地数据目录权限后重试。")}
            </p>
          )}
          <div className="profile-form__actions">
            <button className="button button--primary" type="submit" disabled={save.isPending}>
              {save.isPending
                ? "正在保存…"
                : profile === undefined
                  ? "保存并进入 Koradio"
                  : "保存档案"}
            </button>
            {profile === undefined ? (
              <button className="button button--secondary" type="submit" disabled={save.isPending}>
                稍后设置偏好
              </button>
            ) : (
              <button
                className="button button--secondary"
                type="button"
                onClick={onBack}
                disabled={save.isPending}
              >
                取消
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

export function ProfileExperience(props: ProfileExperienceProps): ReactElement {
  const [mode, setMode] = useState<"create" | "select">(props.initialMode);
  const [editing, setEditing] = useState<Profile>();
  const [selectionError, setSelectionError] = useState<string>();
  const select = useMutation({
    mutationFn: (profile: Profile) => selectProfile(props.transport, profile.id),
    onSuccess: (result) => {
      if (result.current !== null) props.onProfileChanged(result.current);
    },
    onError: () => {
      setSelectionError("档案切换未完成，旧档案和播放状态保持不变。请重试。");
    },
  });

  if (mode === "create" || editing !== undefined) {
    return (
      <ProfileForm
        profile={editing}
        transport={props.transport}
        onBack={() => {
          setEditing(undefined);
          setMode("select");
        }}
        onSaved={async (profile) => {
          await props.onProfilesChanged();
          if (editing !== undefined) {
            setEditing(undefined);
            setMode("select");
            return;
          }
          const result = await selectProfile(props.transport, profile.id);
          if (result.current !== null) props.onProfileChanged(result.current);
        }}
      />
    );
  }

  return (
    <ProfileSelect
      current={props.current}
      profiles={props.profiles}
      pendingId={select.variables?.id}
      selectionError={selectionError}
      onCancel={props.onCancel}
      onCreate={() => {
        setMode("create");
      }}
      onEdit={setEditing}
      onSelect={(profile) => {
        setSelectionError(undefined);
        select.mutate(profile);
      }}
    />
  );
}
