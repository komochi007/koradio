import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import type { DjScriptSegment, ProfileContext, Program, ProgramDetail } from "@koradio/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";

import { type AudioEngineFacade, useAudioSnapshot } from "../../audio/index.js";
import type { AppEventBus } from "../../shared/events.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { Brand, PrimaryNavigation, Status } from "../../shared/ui.js";
import { FeedbackNotice, useFeedback } from "../feedback/index.js";
import { getProgram, getPrograms } from "./api.js";
import {
  formatClockDuration,
  formatProgramDuration,
  programDurationMs,
  programHistorySummary,
} from "./program-history.js";
import "./programs.css";

interface ProgramsExperienceProps {
  audioEngine: AudioEngineFacade;
  current: ProfileContext;
  eventBus: AppEventBus;
  headingRef: RefObject<HTMLHeadingElement | null>;
  navigate: (path: string) => void;
  onOpenProfiles: () => void;
  onReuseScenario: (scenarioText: string) => boolean;
  reconnecting: boolean;
  transport: ServiceTransport;
}

type IconName = "back" | "bookmark" | "heart" | "more" | "pause" | "play" | "search";

const iconPaths: Record<IconName, ReactElement> = {
  back: <path d="m15 18-6-6 6-6" />,
  bookmark: <path d="M7 4h10v16l-5-3-5 3Z" />,
  heart: <path d="M12 20.4 4.8 13.6A4.9 4.9 0 0 1 12 7a4.9 4.9 0 0 1 7.2 6.6Z" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  pause: <path d="M8 5v14m8-14v14" />,
  play: <path d="m8 5 11 7-11 7Z" />,
  search: <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
};

function Icon({ name }: { name: IconName }): ReactElement {
  return (
    <svg aria-hidden="true" className="programs-icon" viewBox="0 0 24 24">
      {iconPaths[name]}
    </svg>
  );
}

function formatProgramDate(value: string): string {
  const date = new Date(value);
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${month} ${String(date.getDate()).padStart(2, "0")} · ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatLongDate(value: string): string {
  const date = new Date(value);
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${month} ${String(date.getDate()).padStart(2, "0")}, ${String(date.getFullYear())} · ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function languageLabel(language: string): string {
  return language === "zh-CN" ? "CHINESE DJ" : "ENGLISH DJ";
}

function coverTone(identity: string): CSSProperties {
  const index =
    Array.from(identity).reduce((total, character) => total + character.charCodeAt(0), 0) % 5;
  return { "--program-cover-index": index } as CSSProperties;
}

function ProgramsState({
  action,
  actionLabel,
  children,
  error = false,
  loading = false,
  title,
}: {
  action?: (() => void) | undefined;
  actionLabel?: string | undefined;
  children: string;
  error?: boolean;
  loading?: boolean;
  title: string;
}): ReactElement {
  return (
    <section
      className={`programs-state${error ? " programs-state--error" : ""}`}
      role={error ? "alert" : "status"}
      aria-busy={loading || undefined}
      aria-live={error ? "assertive" : "polite"}
    >
      <span aria-hidden="true">{loading ? "≈" : error ? "!" : "+"}</span>
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
        <i aria-hidden="true">
          <b />
          <b />
          <b />
        </i>
      ) : null}
    </section>
  );
}

function ProgramsTopbar({
  current,
  onOpenProfiles,
  reconnecting,
}: Pick<ProgramsExperienceProps, "current" | "onOpenProfiles" | "reconnecting">): ReactElement {
  return (
    <header className="topbar programs-topbar">
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

function ProgramsSummary({
  details,
  hasNextPage,
  programs,
}: {
  details: ReadonlyMap<string, ProgramDetail>;
  hasNextPage: boolean;
  programs: readonly Program[];
}): ReactElement {
  const summary = programHistorySummary(programs, details);
  const maxCount = Math.max(1, ...summary.dayCounts);
  const suffix = hasNextPage ? "+" : "";
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    return date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  });
  return (
    <section className="programs-summary" aria-labelledby="programs-summary-title">
      <h2 id="programs-summary-title">本周收听</h2>
      <dl>
        <div>
          <dt>节目</dt>
          <dd>{`${String(summary.programCount)}${suffix} 个节目`}</dd>
        </div>
        <div>
          <dt>时长</dt>
          <dd>
            {summary.durationMs === 0 ? "正在整理" : formatProgramDuration(summary.durationMs)}
          </dd>
        </div>
        <div>
          <dt>歌曲</dt>
          <dd>{`${String(summary.trackCount)}${suffix} 首不同歌曲`}</dd>
        </div>
      </dl>
      <div className="programs-summary__chart" aria-label="最近七日节目分布">
        {summary.dayCounts.map((count, index) => (
          <span key={days[index]}>
            <i
              style={
                {
                  "--program-day-height": `${String(Math.max(3, Math.round((count / maxCount) * 42)))}px`,
                } as CSSProperties
              }
            />
            <small>{days[index]}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function ProgramCard({
  detail,
  favorited,
  onFavorite,
  onOpen,
  pending,
  program,
}: {
  detail: ProgramDetail | undefined;
  favorited: boolean;
  onFavorite: () => void;
  onOpen: (button: HTMLButtonElement) => void;
  pending: boolean;
  program: Program;
}): ReactElement {
  return (
    <article className="program-card">
      <button
        className="program-card__open"
        type="button"
        aria-label={`打开节目 ${program.title}`}
        onClick={(event) => {
          onOpen(event.currentTarget);
        }}
      >
        <time dateTime={program.createdAt}>{formatProgramDate(program.createdAt)}</time>
        <strong>{program.title}</strong>
        <span>{program.scenarioText}</span>
        <small>
          {`${String(program.trackIds.length)} TRACKS · ${detail === undefined ? "READING DURATION" : formatProgramDuration(programDurationMs(detail))}`}
        </small>
      </button>
      <button
        className={`program-card__favorite${favorited ? " program-card__favorite--active" : ""}`}
        type="button"
        aria-label={`${favorited ? "取消收藏" : "收藏"}节目 ${program.title}`}
        aria-pressed={favorited}
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={onFavorite}
      >
        <Icon name="bookmark" />
      </button>
      <span className="program-card__covers" aria-hidden="true">
        {program.trackIds.slice(0, 3).map((trackId) => (
          <i key={trackId} style={coverTone(trackId)} />
        ))}
      </span>
    </article>
  );
}

function DetailQueue({ detail }: { detail: ProgramDetail }): ReactElement {
  const tracks = new Map(detail.tracks.map((track) => [track.id, track]));
  return (
    <section className="program-detail-queue" aria-labelledby="program-detail-queue-title">
      <h2 id="program-detail-queue-title">
        PROGRAM QUEUE · {detail.program.trackIds.length} TRACKS
      </h2>
      <ol>
        {detail.program.trackIds.map((trackId, index) => {
          const track = tracks.get(trackId);
          return (
            <li key={trackId}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i className="program-detail-cover" aria-hidden="true" style={coverTone(trackId)} />
              <span>
                <strong>{track?.title ?? "历史曲目"}</strong>
                <small>{track?.artist ?? "来源信息暂不可用"}</small>
              </span>
              <time>{track === undefined ? "--:--" : formatClockDuration(track.durationMs)}</time>
              <span aria-hidden="true">
                <Icon name="more" />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function openingSegment(detail: ProgramDetail): DjScriptSegment {
  const opening =
    detail.djScripts.find((segment) => segment.type === "intro") ?? detail.djScripts[0];
  if (opening === undefined) throw new Error("Program detail is missing DJ scripts");
  return opening;
}

function ProgramDetailView({
  audioEngine,
  detail,
  feedback,
  navigate,
  onBack,
  onReuseScenario,
}: {
  audioEngine: AudioEngineFacade;
  detail: ProgramDetail;
  feedback: ReturnType<typeof useFeedback>;
  navigate: (path: string) => void;
  onBack: () => void;
  onReuseScenario: (scenarioText: string) => boolean;
}): ReactElement {
  const audio = useAudioSnapshot(audioEngine);
  const opening = openingSegment(detail);
  const audioItem = detail.timeline.find(
    (item) => item.kind === "dj" && item.segmentId === opening.id,
  );
  const replay =
    audio.preview?.kind === "dj" && audio.preview.previewId === opening.id
      ? audio.preview
      : undefined;
  const replaying = replay?.state === "loading" || replay?.state === "playing";
  const [ttsMissing, setTtsMissing] = useState(false);
  const [reuseError, setReuseError] = useState(false);
  const likedTracks = detail.program.trackIds.filter((trackId) => feedback.isLiked(trackId)).length;
  const favorited = feedback.isFavorited(detail.program.id);

  useEffect(() => {
    if (replay?.state === "failed") setTtsMissing(true);
  }, [replay?.state]);

  useEffect(
    () => () => {
      void audioEngine.stopPreview();
    },
    [audioEngine],
  );

  function toggleReplay(): void {
    setTtsMissing(false);
    if (replaying) {
      void audioEngine.stopPreview();
      return;
    }
    if (opening.ttsAudioRef === null || audioItem?.kind !== "dj") {
      setTtsMissing(true);
      return;
    }
    void audioEngine
      .activateProfile(detail.program.profileId)
      .then(() =>
        audioEngine.previewAudio({
          kind: "dj",
          previewId: opening.id,
          resolvedAudioRef: `/${audioItem.audioRef}`,
          durationMs: audioItem.durationMs,
        }),
      )
      .catch(() => {
        setTtsMissing(true);
      });
  }

  return (
    <div className="app-surface program-detail-page">
      <header className="topbar program-detail-topbar">
        <button className="icon-button" type="button" aria-label="返回节目列表" onClick={onBack}>
          <Icon name="back" />
        </button>
        <div>
          <button
            className={`icon-button${favorited ? " program-detail-favorite--active" : ""}`}
            type="button"
            aria-label={`${favorited ? "取消收藏" : "收藏"}节目 ${detail.program.title}`}
            aria-pressed={favorited}
            aria-busy={feedback.isPending("program_favorite", detail.program.id) || undefined}
            disabled={feedback.isPending("program_favorite", detail.program.id)}
            onClick={() => {
              feedback.toggleFavorite(detail.program.id);
            }}
          >
            <Icon name="heart" />
          </button>
          <span className="icon-button" aria-hidden="true">
            <Icon name="more" />
          </span>
        </div>
      </header>
      <main className="program-detail-main">
        <header className="program-detail-heading">
          <p>PROGRAM ARCHIVE</p>
          <h1 tabIndex={-1}>{detail.program.title}</h1>
          <div>
            <span>{formatLongDate(detail.program.createdAt)}</span>
            <span>{`${String(detail.program.trackIds.length)} TRACKS · ${formatProgramDuration(programDurationMs(detail))}`}</span>
            <span>{`${languageLabel(opening.language)} · TEXT + OPTIONAL AUDIO`}</span>
          </div>
        </header>
        <section className="program-detail-scene" aria-labelledby="program-detail-scene-title">
          <h2 id="program-detail-scene-title">YOUR SCENE</h2>
          <p>{detail.program.scenarioText}</p>
          {reuseError ? (
            <p className="program-detail-inline program-detail-inline--error" role="alert">
              Radio 未连接，暂时不能复用场景
            </p>
          ) : null}
          <div>
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setReuseError(!onReuseScenario(detail.program.scenarioText));
              }}
            >
              复用场景
            </button>
            <button className="button button--secondary" type="button" onClick={toggleReplay}>
              {replaying ? "停止重播" : "重播串讲"}
            </button>
          </div>
        </section>
        <section className="program-detail-opening" aria-labelledby="program-detail-opening-title">
          <h2 id="program-detail-opening-title">DJ OPENING</h2>
          <p>{opening.displayText}</p>
          <div
            className={`program-detail-replay${replaying ? " program-detail-replay--active" : ""}`}
          >
            <button
              type="button"
              aria-label={replaying ? "停止 DJ 开场重播" : "播放 DJ 开场"}
              onClick={toggleReplay}
            >
              <Icon name={replaying ? "pause" : "play"} />
            </button>
            <span>
              {replay === undefined
                ? "文字版"
                : `${formatClockDuration(replay.positionMs)} / ${formatClockDuration(replay.durationMs)}`}
            </span>
            {replay === undefined ? null : (
              <progress
                max={replay.durationMs}
                value={replay.positionMs}
                aria-label="串讲重播进度"
              />
            )}
          </div>
          {ttsMissing ? (
            <p
              className="program-detail-inline program-detail-inline--warning"
              role="status"
              aria-live="polite"
            >
              串讲音频缺失，已显示文字版
            </p>
          ) : null}
        </section>
        <DetailQueue detail={detail} />
        <section
          className="program-detail-feedback"
          aria-labelledby="program-detail-feedback-title"
        >
          <h2 id="program-detail-feedback-title">PROGRAM FEEDBACK</h2>
          <dl>
            <div>
              <dt>
                <Icon name="heart" /> <strong>{likedTracks}</strong>
              </dt>
              <dd>liked tracks</dd>
            </div>
            <div>
              <dt>
                <Icon name="bookmark" /> <strong>{favorited ? "1" : "0"}</strong>
              </dt>
              <dd>program favorite</dd>
            </div>
            <div>
              <dt>
                <span aria-hidden="true">≈</span> <strong>—</strong>
              </dt>
              <dd>playback errors</dd>
            </div>
          </dl>
        </section>
      </main>
      <FeedbackNotice notice={feedback.notice} onDismiss={feedback.dismissNotice} />
      <PrimaryNavigation active="programs" onNavigate={navigate} />
    </div>
  );
}

export function ProgramsExperience(props: ProgramsExperienceProps): ReactElement {
  const profileId = props.current.profile.id;
  const feedback = useFeedback({ eventBus: props.eventBus, profileId, transport: props.transport });
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [selectedProgramId, setSelectedProgramId] = useState<string>();
  const lastOpener = useRef<HTMLButtonElement | null>(null);
  const history = useInfiniteQuery({
    queryKey: ["programs", "history", profileId],
    queryFn: ({ pageParam }) => getPrograms(props.transport, profileId, pageParam, 4),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
  const programs = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data?.pages],
  );
  const detailQueries = useQueries({
    queries: programs.map((program) => ({
      queryKey: ["programs", "detail", profileId, program.id],
      queryFn: () => getProgram(props.transport, profileId, program.id),
    })),
  });
  const details = useMemo(
    () =>
      new Map(
        detailQueries.flatMap((query) =>
          query.data === undefined ? [] : [[query.data.program.id, query.data] as const],
        ),
      ),
    [detailQueries],
  );
  const selectedDetail =
    selectedProgramId === undefined ? undefined : details.get(selectedProgramId);
  const selectedQuery =
    selectedProgramId === undefined
      ? undefined
      : detailQueries[programs.findIndex((program) => program.id === selectedProgramId)];

  useEffect(() => {
    if (selectedDetail !== undefined) {
      document.querySelector<HTMLElement>(".program-detail-heading h1")?.focus();
    } else if (selectedProgramId === undefined) {
      props.headingRef.current?.focus();
    }
  }, [props.headingRef, selectedDetail, selectedProgramId]);

  if (selectedProgramId !== undefined) {
    if (selectedDetail !== undefined) {
      return (
        <ProgramDetailView
          audioEngine={props.audioEngine}
          detail={selectedDetail}
          feedback={feedback}
          navigate={props.navigate}
          onBack={() => {
            setSelectedProgramId(undefined);
            window.requestAnimationFrame(() => lastOpener.current?.focus());
          }}
          onReuseScenario={props.onReuseScenario}
        />
      );
    }
    return (
      <div className="app-surface programs-page">
        <ProgramsTopbar
          current={props.current}
          onOpenProfiles={props.onOpenProfiles}
          reconnecting={props.reconnecting}
        />
        <main className="programs-main">
          <ProgramsState
            action={
              selectedQuery?.isError === true
                ? () => {
                    void selectedQuery.refetch();
                  }
                : undefined
            }
            actionLabel={selectedQuery?.isError === true ? "重新读取" : undefined}
            error={selectedQuery?.isError === true}
            loading={selectedQuery?.isError !== true}
            title={selectedQuery?.isError === true ? "节目详情暂时无法读取" : "正在读取节目详情..."}
          >
            {selectedQuery?.isError === true
              ? "历史曲目仍按 Provider source identity 保留。请重试，或返回节目列表。"
              : "正在恢复当时的串讲文字与节目队列。"}
          </ProgramsState>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setSelectedProgramId(undefined);
            }}
          >
            返回节目列表
          </button>
        </main>
        <PrimaryNavigation active="programs" onNavigate={props.navigate} />
      </div>
    );
  }

  const visiblePrograms = programs.filter(
    (program) => filter === "all" || feedback.isFavorited(program.id),
  );
  return (
    <div className="app-surface programs-page">
      <ProgramsTopbar
        current={props.current}
        onOpenProfiles={props.onOpenProfiles}
        reconnecting={props.reconnecting}
      />
      <main className="programs-main">
        <header className="programs-heading">
          <div>
            <h1 ref={props.headingRef} tabIndex={-1}>
              节目
            </h1>
            <p>回看历史、重播串讲，或带着同一个场景回到 Radio。</p>
          </div>
          <span className="programs-search-mark" aria-hidden="true">
            <Icon name="search" />
          </span>
        </header>
        <div className="programs-segmented" role="group" aria-label="节目筛选">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => {
              setFilter("all");
            }}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={filter === "favorites"}
            onClick={() => {
              setFilter("favorites");
            }}
          >
            Favorites
          </button>
        </div>
        {history.isPending ? (
          <ProgramsState loading title="正在读取节目历史...">
            正在整理当前档案保存在这台设备上的节目记录。
          </ProgramsState>
        ) : history.isError ? (
          <ProgramsState
            action={() => {
              void history.refetch();
            }}
            actionLabel="重新读取"
            error
            title="节目历史暂时无法读取"
          >
            当前档案的本地历史读取失败。你可以重试，或先回到 Radio。
          </ProgramsState>
        ) : programs.length === 0 ? (
          <ProgramsState
            action={() => {
              props.navigate("/radio");
            }}
            actionLabel="去 Radio 生成第一段电台"
            title="还没有节目"
          >
            去 Radio 生成第一段电台，节目和场景会保存在这里。
          </ProgramsState>
        ) : (
          <>
            <ProgramsSummary
              details={details}
              hasNextPage={history.hasNextPage}
              programs={programs}
            />
            {visiblePrograms.length === 0 ? (
              <ProgramsState
                action={() => {
                  setFilter("all");
                }}
                actionLabel="查看全部节目"
                title="还没有收藏节目"
              >
                收藏节目后，可以在这里快速找到它们。
              </ProgramsState>
            ) : (
              <section className="programs-list" aria-label="节目历史列表">
                {visiblePrograms.map((program) => (
                  <ProgramCard
                    key={program.id}
                    detail={details.get(program.id)}
                    favorited={feedback.isFavorited(program.id)}
                    onFavorite={() => {
                      feedback.toggleFavorite(program.id);
                    }}
                    onOpen={(button) => {
                      lastOpener.current = button;
                      setSelectedProgramId(program.id);
                    }}
                    pending={feedback.isPending("program_favorite", program.id)}
                    program={program}
                  />
                ))}
              </section>
            )}
            {history.hasNextPage ? (
              <button
                className="button button--secondary programs-load-more"
                type="button"
                aria-busy={history.isFetchingNextPage || undefined}
                disabled={history.isFetchingNextPage}
                onClick={() => {
                  void history.fetchNextPage();
                }}
              >
                {history.isFetchingNextPage ? "正在加载..." : "加载更多"}
              </button>
            ) : null}
          </>
        )}
        {history.isError ? (
          <button
            className="button button--secondary programs-radio-return"
            type="button"
            onClick={() => {
              props.navigate("/radio");
            }}
          >
            回到 Radio
          </button>
        ) : null}
      </main>
      <FeedbackNotice notice={feedback.notice} onDismiss={feedback.dismissNotice} />
      <PrimaryNavigation active="programs" onNavigate={props.navigate} />
    </div>
  );
}
