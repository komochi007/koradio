import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  HealthResponse,
  LibraryItem,
  MusicTrack,
  PlaylistImportSnapshot,
  ProfileContext,
} from "@koradio/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { type AudioEngineFacade, useAudioSnapshot } from "../../audio/index.js";
import { ApiRequestError } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { Brand, PrimaryNavigation, Status } from "../../shared/ui.js";
import {
  addLibraryItem,
  getLibraryPage,
  getPlaylistImport,
  importPlaylist,
  resolveTrackAudio,
  searchMusic,
} from "./api.js";
import "./library.css";

interface LibraryExperienceProps {
  audioEngine: AudioEngineFacade;
  current: ProfileContext;
  headingRef: RefObject<HTMLHeadingElement | null>;
  health: HealthResponse;
  navigate: (path: string) => void;
  onOpenProfiles: () => void;
  reconnecting: boolean;
  transport: ServiceTransport;
}

function durationLabel(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function isValidPlaylistReference(value: string): boolean {
  const normalized = value.trim();
  if (/^\d{1,20}$/u.test(normalized)) return true;
  try {
    const url = new URL(normalized);
    const sourceId = url.searchParams.get("id");
    return (
      url.protocol === "https:" &&
      ["music.163.com", "y.music.163.com"].includes(url.hostname.toLowerCase()) &&
      sourceId !== null &&
      /^\d{1,20}$/u.test(sourceId)
    );
  } catch {
    return false;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (error.envelope?.code === "MUSIC_PROVIDER_UNAVAILABLE") {
    return "网易云连接失败，请稍后重试。";
  }
  if (error.envelope?.code === "MUSIC_PROVIDER_RESPONSE_INVALID") {
    return "网易云返回了无法识别的音乐信息，请重试。";
  }
  return fallback;
}

function LibraryTopbar({
  current,
  onOpenProfiles,
  reconnecting,
}: Pick<LibraryExperienceProps, "current" | "onOpenProfiles" | "reconnecting">): ReactElement {
  return (
    <header className="topbar library-topbar">
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

function TrackList({
  addedTrackIds,
  addingTrackId,
  audioEngine,
  onAdd,
  onPreview,
  previewingTrackId,
  tracks,
}: {
  addedTrackIds: Set<string>;
  addingTrackId: string | undefined;
  audioEngine: AudioEngineFacade;
  onAdd: (track: MusicTrack) => void;
  onPreview: (track: MusicTrack) => void;
  previewingTrackId: string | undefined;
  tracks: MusicTrack[];
}): ReactElement {
  const preview = useAudioSnapshot(audioEngine).preview;
  return (
    <ol className="library-track-list">
      {tracks.map((track, index) => {
        const added = addedTrackIds.has(track.id);
        const previewing = previewingTrackId === track.id;
        const previewLoading = previewing && preview?.state === "loading";
        return (
          <li className="library-track" key={track.id}>
            <span
              className={`library-cover library-cover--${String(index % 5)}`}
              aria-hidden="true"
            >
              {track.artworkUrl === null ? null : (
                <img src={track.artworkUrl} alt="" referrerPolicy="no-referrer" />
              )}
              <i />
            </span>
            <span className="library-track__meta">
              <strong>{track.title}</strong>
              <small>
                {track.artist} · {track.album}
                {track.playable ? "" : " · 暂不可播放"}
              </small>
            </span>
            <span className="library-track__duration">{durationLabel(track.durationMs)}</span>
            <button
              className="library-track__play"
              type="button"
              aria-label={previewing ? `停止试听 ${track.title}` : `试听 ${track.title}`}
              aria-pressed={previewing}
              disabled={!track.playable}
              onClick={() => {
                if (track.playable) onPreview(track);
              }}
            >
              <span aria-hidden="true">{previewLoading ? "…" : previewing ? "■" : "▶"}</span>
            </button>
            {added ? (
              <span className="library-track__added">
                <i aria-hidden="true">✓</i>已加入
              </span>
            ) : (
              <button
                className="button button--secondary library-track__add"
                type="button"
                disabled={addingTrackId === track.id}
                onClick={() => {
                  onAdd(track);
                }}
              >
                {addingTrackId === track.id ? "正在加入" : "加入候选池"}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StatePanel({
  action,
  actionLabel,
  children,
  error = false,
  title,
}: {
  action?: () => void;
  actionLabel?: string;
  children: string;
  error?: boolean;
  title: string;
}): ReactElement {
  return (
    <section
      className={`library-state${error ? " library-state--error" : ""}`}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
    >
      <span className="library-state__symbol" aria-hidden="true">
        {error ? "↻" : "≡"}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
      {action !== undefined && actionLabel !== undefined ? (
        <button className="button button--secondary" type="button" onClick={action}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function importResultMessage(snapshot: PlaylistImportSnapshot): string {
  if (snapshot.status !== "succeeded") return "";
  if (snapshot.progress.unavailable > 0) {
    return `已导入 ${String(snapshot.progress.imported)} 首歌曲，其中 ${String(snapshot.progress.unavailable)} 首暂不可播放。`;
  }
  return `已导入 ${String(snapshot.progress.imported)} 首歌曲。`;
}

export function LibraryExperience(props: LibraryExperienceProps): ReactElement {
  const profileId = props.current.profile.id;
  const queryClient = useQueryClient();
  const audio = useAudioSnapshot(props.audioEngine);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handledImportRef = useRef<string | undefined>(undefined);
  const [searchDraft, setSearchDraft] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState<string>();
  const [searchValidation, setSearchValidation] = useState<string>();
  const [playlistRef, setPlaylistRef] = useState("");
  const [playlistValidation, setPlaylistValidation] = useState<string>();
  const [importJobId, setImportJobId] = useState<string>();
  const [actionMessage, setActionMessage] = useState<string>();
  const [addedAfterSearch, setAddedAfterSearch] = useState<Set<string>>(() => new Set());
  const providerUnavailable = props.health.providers.netease === "unavailable";

  const library = useInfiniteQuery({
    queryKey: ["library", profileId],
    queryFn: ({ pageParam }) => getLibraryPage(props.transport, profileId, pageParam, 5),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const search = useQuery({
    queryKey: ["library-search", profileId, submittedSearch],
    queryFn: () => searchMusic(props.transport, profileId, submittedSearch ?? ""),
    enabled: submittedSearch !== undefined && !providerUnavailable,
    staleTime: 5 * 60_000,
  });
  const importSnapshot = useQuery({
    queryKey: ["playlist-import", profileId, importJobId],
    queryFn: () => getPlaylistImport(props.transport, profileId, importJobId ?? ""),
    enabled: importJobId !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" || status === "canceled" ? false : 350;
    },
  });
  const localItems = useMemo(
    () => library.data?.pages.flatMap((page) => page.items) ?? [],
    [library.data],
  );
  const localTrackIds = useMemo(
    () => new Set(localItems.map((item) => item.track.id)),
    [localItems],
  );
  const addedTrackIds = useMemo(
    () => new Set([...localTrackIds, ...addedAfterSearch]),
    [addedAfterSearch, localTrackIds],
  );
  const searchTracks = search.data?.items ?? [];
  const previewingTrackId =
    (audio.preview?.state === "playing" || audio.preview?.state === "loading") &&
    audio.preview.kind === "track"
      ? audio.preview.previewId
      : undefined;

  const addMutation = useMutation({
    mutationFn: (track: MusicTrack) => addLibraryItem(props.transport, profileId, track.id),
    onSuccess: (item) => {
      setAddedAfterSearch((current) => new Set(current).add(item.track.id));
      setActionMessage("已加入本地音乐库");
      void queryClient.invalidateQueries({ queryKey: ["library", profileId] });
    },
    onError: () => {
      setActionMessage("音乐获取失败，请重试");
    },
  });
  const importMutation = useMutation({
    mutationFn: (value: string) => importPlaylist(props.transport, profileId, value),
    onSuccess: (accepted) => {
      handledImportRef.current = undefined;
      setImportJobId(accepted.jobId);
      setActionMessage("正在从网易云获取音乐...");
    },
    onError: (error) => {
      setActionMessage(errorMessage(error, "歌单导入失败，请保留输入后重试。"));
    },
  });
  const previewMutation = useMutation({
    mutationFn: async (track: MusicTrack) => {
      await props.audioEngine.activateProfile(profileId);
      const resolution = await resolveTrackAudio(props.transport, profileId, track.id);
      await props.audioEngine.previewAudio({
        kind: "track",
        previewId: track.id,
        resolvedAudioRef: resolution.resolvedAudioRef,
        durationMs: track.durationMs,
      });
    },
    onError: (error) => {
      setActionMessage(errorMessage(error, "音乐获取失败，请重试"));
    },
  });

  useEffect(() => {
    const snapshot = importSnapshot.data;
    if (
      snapshot === undefined ||
      (snapshot.status !== "succeeded" &&
        snapshot.status !== "failed" &&
        snapshot.status !== "canceled") ||
      handledImportRef.current === snapshot.jobId
    ) {
      return;
    }
    handledImportRef.current = snapshot.jobId;
    if (snapshot.status === "succeeded") {
      setActionMessage(importResultMessage(snapshot));
      void queryClient.invalidateQueries({ queryKey: ["library", profileId] });
    } else {
      setActionMessage("歌单导入失败，输入内容已保留，请重试。");
    }
  }, [importSnapshot.data, profileId, queryClient]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(
    () => () => {
      void props.audioEngine.stopPreview();
    },
    [props.audioEngine],
  );

  function submitSearch(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = searchDraft.trim();
    if (keyword.length === 0) {
      setSearchValidation("请输入歌曲、歌手或专辑名");
      return;
    }
    setSearchValidation(undefined);
    setActionMessage(undefined);
    setSubmittedSearch(keyword);
  }

  function submitImport(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalized = playlistRef.trim();
    if (!isValidPlaylistReference(normalized)) {
      setPlaylistValidation("请输入有效的网易云歌单链接或 ID");
      return;
    }
    setPlaylistValidation(undefined);
    setActionMessage(undefined);
    importMutation.mutate(normalized);
  }

  function clearSearch(): void {
    setSearchDraft("");
    setSubmittedSearch(undefined);
    setSearchValidation(undefined);
    searchInputRef.current?.focus();
  }

  function previewTrack(track: MusicTrack): void {
    setActionMessage(undefined);
    if (previewingTrackId === track.id) {
      void props.audioEngine.stopPreview();
      return;
    }
    previewMutation.mutate(track);
  }

  const importing =
    importMutation.isPending ||
    importSnapshot.data?.status === "queued" ||
    importSnapshot.data?.status === "running";
  const importProgress = importSnapshot.data?.progress;
  const serviceError = providerUnavailable || search.isError;
  const showingSearch = submittedSearch !== undefined;
  const loadedCountLabel = `${String(localItems.length)}${library.hasNextPage ? "+" : ""} TRACKS`;
  const localTracks = localItems.map((item: LibraryItem) => item.track);

  return (
    <div className="app-surface library-page">
      <LibraryTopbar
        current={props.current}
        onOpenProfiles={props.onOpenProfiles}
        reconnecting={props.reconnecting}
      />
      <main className="library-main">
        <header className="library-heading">
          <div>
            <h1 ref={props.headingRef} tabIndex={-1}>
              音乐库
            </h1>
            <p>管理 Koradio 可以搜索、试听和用于节目策展的音乐来源。</p>
          </div>
          <p>{loadedCountLabel}</p>
        </header>

        <form className="library-search" onSubmit={submitSearch} role="search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchInputRef}
            role="searchbox"
            value={searchDraft}
            maxLength={100}
            placeholder="搜索歌曲、歌手或专辑"
            aria-label="搜索歌曲、歌手或专辑"
            aria-invalid={searchValidation !== undefined}
            aria-describedby={searchValidation === undefined ? undefined : "library-search-error"}
            onChange={(event) => {
              setSearchDraft(event.target.value);
              setSearchValidation(undefined);
            }}
            disabled={providerUnavailable}
          />
          {searchDraft.length > 0 ? (
            <button type="button" aria-label="清除搜索" onClick={clearSearch}>
              ×
            </button>
          ) : (
            <kbd aria-hidden="true">⌘ K</kbd>
          )}
          <button className="visually-hidden" type="submit">
            搜索音乐
          </button>
        </form>
        {searchValidation !== undefined ? (
          <p className="library-field-error" id="library-search-error" role="alert">
            {searchValidation}
          </p>
        ) : null}

        <section className="library-results" aria-labelledby="library-results-title">
          <h2 id="library-results-title">
            {showingSearch ? `搜索结果 · ${String(searchTracks.length)}` : "本地音乐"}
          </h2>
          {serviceError ? (
            <StatePanel
              error
              title="网易云 API 暂不可用"
              action={() => {
                if (providerUnavailable) props.navigate("/settings");
                else void search.refetch();
              }}
              actionLabel={providerUnavailable ? "前往 Settings" : "重新搜索"}
            >
              搜索内容已保留。请稍后重试，或前往 Settings 检查服务状态。
            </StatePanel>
          ) : search.isFetching ? (
            <StatePanel title="正在从网易云获取音乐...">搜索内容会在完成后显示。</StatePanel>
          ) : showingSearch && searchTracks.length === 0 ? (
            <StatePanel title="没有找到相关歌曲" action={clearSearch} actionLabel="清除关键词">
              换个关键词试试，也可以直接导入熟悉的网易云歌单。
            </StatePanel>
          ) : showingSearch ? (
            <TrackList
              addedTrackIds={addedTrackIds}
              addingTrackId={addMutation.isPending ? addMutation.variables.id : undefined}
              audioEngine={props.audioEngine}
              onAdd={(track) => {
                addMutation.mutate(track);
              }}
              onPreview={previewTrack}
              previewingTrackId={previewingTrackId}
              tracks={searchTracks}
            />
          ) : library.isPending ? (
            <StatePanel title="正在读取本地音乐库">正在整理已加入的候选歌曲。</StatePanel>
          ) : library.isError ? (
            <StatePanel
              error
              title="本地音乐库暂时无法读取"
              action={() => void library.refetch()}
              actionLabel="重新读取"
            >
              本地内容没有被修改，请重试。
            </StatePanel>
          ) : localTracks.length === 0 ? (
            <StatePanel
              title="还没有导入音乐"
              action={() => searchInputRef.current?.focus()}
              actionLabel="搜索一首歌"
            >
              还没有导入歌单，可先搜索一首歌试播，也可以直接导入你的网易云歌单。
            </StatePanel>
          ) : (
            <TrackList
              addedTrackIds={addedTrackIds}
              addingTrackId={undefined}
              audioEngine={props.audioEngine}
              onAdd={() => undefined}
              onPreview={previewTrack}
              previewingTrackId={previewingTrackId}
              tracks={localTracks}
            />
          )}
          {!showingSearch && library.hasNextPage ? (
            <button
              className="button button--secondary library-load-more"
              type="button"
              disabled={library.isFetchingNextPage}
              onClick={() => void library.fetchNextPage()}
            >
              {library.isFetchingNextPage ? "正在加载" : "加载更多"}
            </button>
          ) : null}
        </section>

        <section
          className={`library-import${providerUnavailable ? " library-import--error" : ""}`}
          aria-labelledby="library-import-title"
          aria-busy={importing}
        >
          <header>
            <div>
              <h2 id="library-import-title">导入网易云歌单</h2>
              <p>粘贴歌单链接或 ID，完整保留歌曲并标注暂不可播放的项目。</p>
            </div>
            <span
              className={`library-provider-status library-provider-status--${providerUnavailable ? "error" : importing ? "pending" : "connected"}`}
            >
              <i aria-hidden="true" />
              {providerUnavailable ? "OFFLINE" : importing ? "IMPORTING" : "CONNECTED"}
            </span>
          </header>
          <form className="library-import__controls" onSubmit={submitImport}>
            <input
              value={playlistRef}
              maxLength={300}
              placeholder="粘贴歌单链接或 ID"
              aria-label="网易云歌单链接或 ID"
              aria-invalid={playlistValidation !== undefined}
              aria-describedby={playlistValidation === undefined ? undefined : "playlist-error"}
              disabled={importing || providerUnavailable}
              onChange={(event) => {
                setPlaylistRef(event.target.value);
                setPlaylistValidation(undefined);
              }}
            />
            <button
              className="button button--secondary"
              type="submit"
              disabled={importing || providerUnavailable}
            >
              {importing ? "正在导入" : "导入歌单"}
            </button>
          </form>
          {playlistValidation !== undefined ? (
            <p className="library-field-error" id="playlist-error" role="alert">
              {playlistValidation}
            </p>
          ) : null}
          {importing && importProgress !== undefined ? (
            <div className="library-import__progress" role="status" aria-live="polite">
              <span>
                <i
                  style={{
                    width: `${String(importProgress.total === 0 ? 4 : Math.max(4, Math.round((importProgress.processed / importProgress.total) * 100)))}%`,
                  }}
                />
              </span>
              <p>
                正在从网易云获取音乐... · 已写入 {importProgress.imported} / {importProgress.total}
              </p>
            </div>
          ) : null}
          {providerUnavailable ? (
            <p className="library-import__message" role="alert">
              内置网易云服务当前不可用，请前往 Settings 查看状态。
            </p>
          ) : null}
        </section>

        <section className="library-local-summary" aria-labelledby="library-local-title">
          <header>
            <h2 id="library-local-title">本地候选池</h2>
            <span>{loadedCountLabel}</span>
          </header>
          <p>
            {localItems.length === 0
              ? "加入歌曲或完成歌单导入后，候选音乐会显示在这里。"
              : `已加载 ${String(localItems.length)} 首歌曲，下一次节目策展可使用这些来源。`}
          </p>
        </section>

        <div className="library-announcer" role="status" aria-live="polite">
          {actionMessage}
          {audio.preview?.mediaError === "autoplay_blocked"
            ? "浏览器阻止了自动试听，请再次点击试听。"
            : audio.preview?.mediaError === "media_failed"
              ? "该歌曲暂时无法试听，原节目已恢复为暂停状态。"
              : null}
        </div>
      </main>
      <PrimaryNavigation active="library" onNavigate={props.navigate} />
    </div>
  );
}
