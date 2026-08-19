import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type MusicTrack,
  type HealthResponse,
  type Profile,
  type ProfileContext,
  type ProgramDetail,
  type ProgramGenerationStage,
  type RadioTurn,
} from "@koradio/contracts";
import { radioTokens } from "@koradio/design-tokens";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  type AudioEngineFacade,
  type AudioEngineSnapshot,
  useAudioSnapshot,
} from "../../audio/index.js";
import { applyTheme, updateProfilePreferences } from "../profile-preferences/index.js";
import { resolveTrackAudio } from "../library/index.js";
import { FeedbackNotice, useFeedback } from "../feedback/index.js";
import { activateProgramHandoff, getProgramHandoff } from "../programs/index.js";
import { AppNotice, Brand, PrimaryNavigation } from "../../shared/ui.js";
import { KoradioAvatar } from "../../shared/avatar.js";
import type { AppEventBus } from "../../shared/events.js";
import { formatClockDuration } from "../../shared/format.js";
import { Icon as SharedIcon, type IconName } from "../../shared/icon.js";
import { ArtworkImage } from "../../shared/artwork.js";
import { ApiRequestError } from "../../shared/api.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { DetailSheet, DetailSheetBoundary } from "./detail-sheet.js";
import { clearRadioConversation } from "./api.js";
import { buildDialogueTimeline } from "./dialogue-timeline.js";
import {
  useRadioProgram,
  type PendingRadioTurn,
  type RadioViewState,
} from "./use-radio-program.js";
import "./radio.css";

interface RadioExperienceProps {
  audioEngine: AudioEngineFacade;
  current: ProfileContext;
  eventBus: AppEventBus;
  headingRef: RefObject<HTMLHeadingElement | null>;
  health: HealthResponse;
  initialScenarioDraft: string | undefined;
  navigate: (path: string) => void;
  onCurrentChanged: (current: ProfileContext) => void;
  onOpenProfiles: () => void;
  onScenarioDraftConsumed: () => void;
  reconnecting: boolean;
  transport: ServiceTransport;
}

function Icon({ name }: { name: IconName }): ReactElement {
  return <SharedIcon className="radio-icon" name={name} />;
}

function TransientToast({
  children,
  error = false,
  onDismiss,
}: {
  children: string;
  error?: boolean;
  onDismiss?: () => void;
}): ReactElement | null {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <AppNotice
      message={children}
      tone={error ? "error" : "info"}
      onDismiss={() => {
        setVisible(false);
        onDismiss?.();
      }}
    />
  );
}

function useRadioClock(): { date: string; time: string } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const day = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const date = now
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .replace(" ", " ")
    .toUpperCase();
  return {
    date: `${day} · ${date}`,
    time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}

function orderedTracks(program: ProgramDetail): MusicTrack[] {
  const tracks = new Map(program.tracks.map((track) => [track.id, track]));
  return program.program.trackIds.flatMap((trackId) => {
    const track = tracks.get(trackId);
    return track === undefined ? [] : [track];
  });
}

function generationCopy(stage: ProgramGenerationStage | undefined): string {
  const copy: Record<ProgramGenerationStage, string> = {
    queued: "Reading your scene and preparing the desk.",
    planning: "Reading your taste and shaping the session.",
    resolving_tracks: "Searching for tracks that fit the room.",
    enriching_tracks: "Checking audio and lyrics for the queue.",
    synthesizing_dj: "Preparing the complete DJ voice track.",
    committing: "Putting the final session on air.",
    completed: "Your new session is almost on air.",
  };
  return copy[stage ?? "queued"];
}

export function transcriptIsPinnedToEnd(
  clientHeight: number,
  scrollHeight: number,
  scrollTop: number,
): boolean {
  return scrollHeight - clientHeight - scrollTop <= 24;
}

function failureCopy(code: string): { message: string; settings: boolean; title: string } {
  if (code === "PROGRAM_GENERATION_INSUFFICIENT_LIBRARY_TRACKS") {
    return {
      title: "LIBRARY TRACKS INSUFFICIENT",
      message: "库内可播放的原版歌曲不足，DJ 没有用探索曲目替代既定的库内比例。",
      settings: false,
    };
  }
  if (code === "PROGRAM_GENERATION_INSUFFICIENT_CHINESE_TRACKS") {
    return {
      title: "CHINESE ORIGINALS INSUFFICIENT",
      message: "可播放的中文原版人声不足，DJ 已保留原唱与版本筛选。请换个场景，或补充更多中文歌。",
      settings: false,
    };
  }
  if (code === "PROGRAM_GENERATION_INSUFFICIENT_CANONICAL_TRACKS") {
    return {
      title: "ORIGINAL RECORDINGS INSUFFICIENT",
      message: "翻唱、现场和变速版已被排除，剩余原版歌曲不足以组成完整节目。",
      settings: false,
    };
  }
  if (code === "PROGRAM_GENERATION_INSUFFICIENT_PLAYABLE_AUDIO") {
    return {
      title: "PLAYABLE AUDIO INSUFFICIENT",
      message: "有些候选歌曲暂时无法播放，DJ 没有用其他版本补位。请稍后重试。",
      settings: false,
    };
  }
  if (code === "PROGRAM_GENERATION_ANCHOR_TRACK_UNAVAILABLE") {
    return {
      title: "ANCHOR TRACK NOT FOUND",
      message:
        "没有找到这首歌的可播放原版，节目没有用不确定的版本替代。请补充歌手或换一首锚点歌曲。",
      settings: false,
    };
  }
  if (code === "PROGRAM_GENERATION_TTS_UNAVAILABLE") {
    return {
      title: "DJ VOICE ENGINE UNAVAILABLE",
      message:
        "DJ 语音服务尚未就绪，因此没有提交不完整的节目。请前往 Settings 完成语音模型配置后重试。",
      settings: true,
    };
  }
  if (
    code === "PROGRAM_GENERATION_NO_PLAYABLE_TRACKS" ||
    code === "PROGRAM_GENERATION_INSUFFICIENT_TRACKS"
  ) {
    return {
      title: "NO TRACKS FOUND",
      message: "没有找到合适歌曲，换个说法后再试一次。",
      settings: false,
    };
  }
  if (
    code.includes("PLANNER_UNAVAILABLE") ||
    code.includes("UNAVAILABLE") ||
    code.includes("CONFIG")
  ) {
    return {
      title: "SERVICE CHECK NEEDED",
      message: "AI 大脑暂时无法规划节目，请前往 Settings 检查当前规划器的连接与配置。",
      settings: true,
    };
  }
  return {
    title: "TUNING INTERRUPTED",
    message: "这次没有规划成功，旧节目保持不变。你可以重试或修改场景。",
    settings: false,
  };
}

function RadioTime({
  headingRef,
  state,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  state: RadioViewState;
}): ReactElement {
  const clock = useRadioClock();
  const status = state === "empty" ? "LIVE" : state === "playing" ? "ON AIR" : "TUNING";
  return (
    <section className="radio-time" aria-label="当前时间与电台状态">
      <h1 aria-label="Radio" className="radio-time__clock" ref={headingRef} tabIndex={-1}>
        {clock.time}
      </h1>
      <p className="radio-time__date">{clock.date}</p>
      <p className={`radio-status radio-status--${state}`}>
        <span aria-hidden="true" /> {status}
      </p>
    </section>
  );
}

function RadioMain({
  audioEngine,
  audio,
  feedback,
  program,
  stage,
  state,
}: {
  audioEngine: AudioEngineFacade;
  audio: AudioEngineSnapshot;
  feedback: ReturnType<typeof useFeedback>;
  program: ProgramDetail | null;
  stage: ProgramGenerationStage | undefined;
  state: RadioViewState;
}): ReactElement {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  if (state === "generating") {
    return (
      <section className="radio-main radio-main--generating" role="status" aria-busy="true">
        <p className="radio-eyebrow">PREPARING SESSION</p>
        <h2>TUNING YOUR STATION...</h2>
        <div className="radio-tuning-wave" aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => (
            <i key={index} style={{ "--wave-index": index } as CSSProperties} />
          ))}
        </div>
        <p>{generationCopy(stage)}</p>
      </section>
    );
  }
  const trackPreview = audio.preview?.kind === "track" ? audio.preview : undefined;
  const previewTrack = trackPreview?.track;
  if ((state === "empty" || program === null) && previewTrack === undefined) {
    return (
      <section className="radio-main radio-main--empty" aria-label="当前节目">
        <p className="radio-eyebrow">NOW PLAYING</p>
        <h2>NO SESSION ON AIR</h2>
        <p>告诉 DJ 你现在正在做什么，或者想让这一段时间听起来怎样。</p>
      </section>
    );
  }
  const tracks = new Map((program?.tracks ?? []).map((track) => [track.id, track]));
  const current =
    previewTrack ??
    (audio.currentItem?.kind === "track" ? tracks.get(audio.currentItem.trackId) : undefined);
  const active = audio.ownership === "active";
  const playing =
    trackPreview === undefined
      ? audio.state === "playing" || audio.state === "buffering"
      : trackPreview.state === "playing" || trackPreview.state === "loading";
  const positionMs = trackPreview?.positionMs ?? audio.positionMs;
  const durationMs = trackPreview?.durationMs ?? audio.durationMs;
  const progress = durationMs === 0 ? 0 : (positionMs / durationMs) * 100;
  const currentTrackId = current?.id;
  const liked = currentTrackId === undefined ? false : feedback.isLiked(currentTrackId);
  const disliked = currentTrackId === undefined ? false : feedback.isDisliked(currentTrackId);
  const likePending =
    currentTrackId === undefined ? false : feedback.isPending("track_like", currentTrackId);
  const dislikePending =
    currentTrackId === undefined ? false : feedback.isPending("track_dislike", currentTrackId);
  return (
    <section className="radio-main radio-main--playing" aria-label="当前节目">
      <article className="radio-player">
        <div className="radio-player__topline">
          <span className="radio-cover" aria-hidden="true">
            <ArtworkImage src={current?.artworkUrl} />
          </span>
          <div className="radio-player__meta">
            <p className="radio-eyebrow">NOW PLAYING</p>
            <h2>{current?.title ?? program?.program.title ?? "DJ 点播"}</h2>
            <p>
              {current === undefined
                ? (program?.program.title ?? "DJ 点播")
                : `${current.artist} · ${current.album}`}
            </p>
          </div>
          <div
            className="radio-player__actions"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setMoreOpen(false);
            }}
          >
            <button
              className={
                liked
                  ? "radio-feedback-action radio-feedback-action--active"
                  : "radio-feedback-action"
              }
              type="button"
              aria-label={liked ? "取消喜欢当前歌曲" : "喜欢当前歌曲"}
              aria-pressed={liked}
              aria-busy={likePending || undefined}
              disabled={currentTrackId === undefined || likePending}
              onClick={() => {
                if (currentTrackId !== undefined) feedback.toggleLike(currentTrackId);
              }}
            >
              <Icon name="heart" />
            </button>
            <button
              type="button"
              aria-label="更多播放操作"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              disabled={currentTrackId === undefined}
              onClick={() => {
                setMoreOpen((open) => !open);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setMoreOpen(false);
              }}
              ref={moreButtonRef}
            >
              <Icon name="more" />
            </button>
            {moreOpen && currentTrackId !== undefined && (
              <div
                className="radio-feedback-menu"
                role="menu"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setMoreOpen(false);
                    moreButtonRef.current?.focus();
                  }
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-busy={dislikePending || undefined}
                  disabled={dislikePending}
                  onClick={() => {
                    feedback.toggleDislike(currentTrackId);
                    setMoreOpen(false);
                    moreButtonRef.current?.focus();
                  }}
                >
                  {disliked ? "撤销不喜欢当前歌曲" : "不喜欢当前歌曲"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="radio-player__progress">
          <span>{formatClockDuration(positionMs)}</span>
          <input
            aria-label="播放进度"
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            step={1000}
            value={positionMs}
            disabled={!active}
            style={{ "--radio-progress": `${String(progress)}%` } as CSSProperties}
            onChange={(event) => {
              void audioEngine.seek(Number(event.target.value));
            }}
          />
          <span>{formatClockDuration(durationMs || current?.durationMs || 1)}</span>
        </div>
        <div className="radio-player__controls" aria-label="播放控制">
          <button
            type="button"
            aria-label={audio.volume === 0 ? "恢复音量" : "静音"}
            disabled={!active}
            onClick={() => {
              audioEngine.setVolume(audio.volume === 0 ? 1 : 0);
            }}
          >
            <Icon name="volume" />
          </button>
          <button
            type="button"
            aria-label="上一段"
            disabled={!active}
            onClick={() => void audioEngine.previous()}
          >
            <Icon name="previous" />
          </button>
          <button
            className="radio-player__pause"
            type="button"
            aria-label={active ? (playing ? "暂停" : "播放") : "接管并播放"}
            onClick={() => void (active && playing ? audioEngine.pause() : audioEngine.play())}
          >
            <Icon name={playing ? "pause" : "play"} />
          </button>
          <button
            type="button"
            aria-label={currentTrackId === undefined ? "下一段" : "跳过当前歌曲"}
            disabled={!active}
            onClick={() => {
              if (currentTrackId !== undefined) feedback.recordSkip(currentTrackId);
              void audioEngine.next();
            }}
          >
            <Icon name="next" />
          </button>
          <button type="button" aria-label="队列管理将在后续任务接入" disabled>
            <Icon name="queue" />
          </button>
        </div>
      </article>
    </section>
  );
}

function RadioQueue({
  audio,
  currentTrackId,
  expanded,
  onExpandedChange,
  program,
  state,
}: {
  audio: AudioEngineSnapshot;
  currentTrackId: string | undefined;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  program: ProgramDetail | null;
  state: RadioViewState;
}): ReactElement {
  const tracks = program === null ? [] : orderedTracks(program);
  const previewTrack = audio.preview?.kind === "track" ? audio.preview.track : undefined;
  const queuedPreviewTrack =
    audio.queuedPreview?.kind === "track" ? audio.queuedPreview.track : undefined;
  const temporaryTracks = [previewTrack, queuedPreviewTrack].filter(
    (track): track is MusicTrack => track !== undefined,
  );
  const label =
    state === "generating"
      ? "QUEUE · PREPARING"
      : `QUEUE · ${String(tracks.length + temporaryTracks.length)} TRACKS`;
  return (
    <section
      className={`radio-queue radio-queue--${state}${expanded ? "" : " radio-queue--collapsed"}`}
      aria-label="播放队列"
    >
      <header>
        <h2>{label}</h2>
        {state === "generating" ? (
          <span>BUILDING</span>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            disabled={tracks.length + temporaryTracks.length === 0}
            onClick={() => {
              onExpandedChange(!expanded);
            }}
          >
            {expanded ? "HIDE" : "LIST"}
          </button>
        )}
      </header>
      {state === "generating" ? (
        <ol aria-label="正在生成队列" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <li className="radio-queue__skeleton" key={index}>
              <i />
              <span>
                <i />
                <i />
              </span>
              <i />
            </li>
          ))}
        </ol>
      ) : tracks.length === 0 && previewTrack === undefined && queuedPreviewTrack === undefined ? (
        <div className="radio-queue__empty">
          <Icon name="queue" />
          <p>Your next session will appear here.</p>
        </div>
      ) : expanded ? (
        <ol aria-label="节目曲目" tabIndex={tracks.length > 4 ? 0 : undefined}>
          {[previewTrack, queuedPreviewTrack].flatMap((track, index) =>
            track === undefined
              ? []
              : [
                  <li
                    className={
                      index === 0
                        ? "radio-queue__track radio-queue__track--current"
                        : "radio-queue__track"
                    }
                    key={`dj-preview-${track.id}`}
                  >
                    <span>{index === 0 ? "DJ" : "NEXT"}</span>
                    <span>
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                    <span>{formatClockDuration(track.durationMs)}</span>
                  </li>,
                ],
          )}
          {tracks.map((track, index) => {
            const isCurrent = track.id === currentTrackId;
            return (
              <li
                className={
                  isCurrent
                    ? "radio-queue__track radio-queue__track--current"
                    : "radio-queue__track"
                }
                key={track.id}
              >
                <span>
                  {isCurrent ? (
                    <i className="radio-equalizer" aria-label="当前曲目" role="img">
                      <b />
                      <b />
                      <b />
                    </i>
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </span>
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
                <span>{formatClockDuration(track.durationMs)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

function RadioDialogue({
  audio,
  audioEngine,
  conversation,
  failure,
  handoff,
  handoffPending,
  initialError,
  navigate,
  onConversationCleared,
  onHandoffActivate,
  onRetry,
  profileId,
  profile,
  program,
  pendingTurn,
  scenarioText,
  stage,
  state,
  transport,
  turnError,
  turnPending,
}: {
  audio: AudioEngineSnapshot;
  audioEngine: AudioEngineFacade;
  conversation: RadioTurn[];
  failure: { code: string; scenarioText: string } | undefined;
  handoff: ProgramDetail | null;
  handoffPending: boolean;
  initialError: boolean;
  navigate: (path: string) => void;
  onConversationCleared: () => void;
  onHandoffActivate: () => void;
  onRetry: (scenario?: string) => void;
  profileId: string;
  profile: Profile;
  program: ProgramDetail | null;
  pendingTurn: PendingRadioTurn | undefined;
  scenarioText: string | undefined;
  stage: ProgramGenerationStage | undefined;
  state: RadioViewState;
  transport: ServiceTransport;
  turnError: string | undefined;
  turnPending: boolean;
}): ReactElement {
  const dialogueRef = useRef<HTMLDivElement>(null);
  const transcriptPinnedToEnd = useRef(true);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [recommendedTrackMessage, setRecommendedTrackMessage] = useState<
    { message: string; trackId: string } | undefined
  >();
  useEffect(() => {
    setRecommendedTrackMessage(undefined);
  }, [conversation.length]);
  const error = failure === undefined ? undefined : failureCopy(failure.code);
  const intro = program?.djScripts.find((script) => script.type === "intro")?.text;
  const [revealedScriptTimes, setRevealedScriptTimes] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const visibleProgramScripts = useMemo(
    () =>
      (program?.djScripts ?? []).filter(
        (script) => script.revealedAt != null || revealedScriptTimes.has(script.id),
      ),
    [program?.djScripts, revealedScriptTimes],
  );
  const dialogueTimeline = useMemo(
    () =>
      buildDialogueTimeline(
        conversation,
        visibleProgramScripts.map((script) => ({
          script,
          occurredAt: script.revealedAt ?? revealedScriptTimes.get(script.id) ?? "",
        })),
      ),
    [conversation, revealedScriptTimes, visibleProgramScripts],
  );
  const visibleScenario =
    conversation.length === 0
      ? (scenarioText ?? (state === "playing" ? program?.program.scenarioText : undefined))
      : undefined;
  const transcriptContentKey = useMemo(
    () =>
      [
        conversation.map((turn) => turn.id).join(","),
        pendingTurn === undefined ? "" : `${pendingTurn.status}:${pendingTurn.content}`,
        dialogueTimeline.map((entry) => `${entry.kind}:${entry.occurredAt}`).join(","),
        visibleScenario ?? "",
        scenarioText ?? "",
        turnError ?? "",
        error?.message ?? "",
        initialError ? "initial-error" : "",
      ].join("|"),
    [
      conversation,
      error?.message,
      initialError,
      pendingTurn,
      scenarioText,
      turnError,
      dialogueTimeline,
      visibleScenario,
    ],
  );
  const playTrack = useMutation({
    mutationFn: async ({ mode, track }: { mode: "now" | "next"; track: MusicTrack | null }) => {
      if (track === null) return;
      const resolution = await resolveTrackAudio(transport, profileId, track.id);
      await audioEngine.activateProfile(profileId);
      const preview = {
        kind: "track",
        previewId: track.id,
        resolvedAudioRef: resolution.resolvedAudioRef,
        durationMs: track.durationMs,
        track,
      } as const;
      if (mode === "now") await audioEngine.previewAudio(preview);
      else if (audioEngine.queuePreviewNext !== undefined)
        await audioEngine.queuePreviewNext(preview);
    },
    onMutate() {
      setRecommendedTrackMessage(undefined);
    },
    onError(error, variables) {
      if (
        error instanceof ApiRequestError &&
        error.envelope?.code === "MUSIC_PROVIDER_UNAVAILABLE"
      ) {
        setRecommendedTrackMessage({
          message: "这首歌暂时无法取得可播放音频，请换一首或稍后重试。",
          trackId: variables.track?.id ?? "",
        });
        return;
      }
      setRecommendedTrackMessage({
        message: "这首歌暂时无法播放，请稍后重试。",
        trackId: variables.track?.id ?? "",
      });
    },
  });
  const replayScript = useMutation({
    mutationFn: async (segment: NonNullable<ProgramDetail>["djScripts"][number]) => {
      if (segment.ttsAudioRef === null) return;
      const timelineItem = program?.timeline.find(
        (item) => item.kind === "dj" && item.segmentId === segment.id,
      );
      if (timelineItem === undefined) return;
      await audioEngine.previewAudio({
        kind: "dj",
        previewId: segment.id,
        resolvedAudioRef: segment.ttsAudioRef,
        durationMs: timelineItem.durationMs,
      });
    },
  });
  const clearConversationMutation = useMutation({
    mutationFn: () => clearRadioConversation(transport, profileId),
    onSuccess() {
      setClearConfirmation(false);
      onConversationCleared();
    },
  });
  useEffect(() => {
    const dialogue = dialogueRef.current;
    if (dialogue === null || !transcriptPinnedToEnd.current) return;
    dialogue.scrollTop = dialogue.scrollHeight;
  }, [transcriptContentKey]);
  useEffect(() => {
    if (!audio.voiceActive || audio.voiceSegmentId === undefined) return;
    setRevealedScriptTimes((current) => {
      if (current.has(audio.voiceSegmentId ?? "")) return current;
      const next = new Map(current);
      next.set(audio.voiceSegmentId ?? "", new Date().toISOString());
      return next;
    });
  }, [audio.voiceActive, audio.voiceSegmentId]);
  return (
    <section
      className={`radio-dialogue radio-dialogue--${state}${conversation.length > 0 || pendingTurn !== undefined ? " radio-dialogue--has-conversation" : ""}`}
      aria-label="DJ 对话"
    >
      <header className="radio-dialogue__header">
        <span>CONVERSATION · {conversation.length}/50</span>
        <button
          type="button"
          disabled={clearConversationMutation.isPending}
          onClick={() => {
            if (clearConfirmation) clearConversationMutation.mutate();
            else setClearConfirmation(true);
          }}
          onBlur={() => {
            if (!clearConversationMutation.isPending) setClearConfirmation(false);
          }}
        >
          {clearConversationMutation.isPending
            ? "CLEARING..."
            : clearConfirmation
              ? "CONFIRM CLEAR"
              : "CLEAR CHAT"}
        </button>
      </header>
      <div
        aria-label="DJ 对话记录"
        className="radio-dialogue__transcript"
        onScroll={(event) => {
          const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
          transcriptPinnedToEnd.current = transcriptIsPinnedToEnd(
            clientHeight,
            scrollHeight,
            scrollTop,
          );
        }}
        ref={dialogueRef}
        tabIndex={0}
      >
        {visibleScenario !== undefined && (
          <div className="radio-message radio-message--user">
            <p className="radio-user-bubble">{visibleScenario}</p>
            <KoradioAvatar
              fallback={Array.from(profile.nickname).slice(0, 2).join("")}
              label="我的头像"
              reference={profile.avatarRef}
            />
          </div>
        )}
        {dialogueTimeline.map((entry) =>
          entry.kind === "turn" ? (
            <div className="radio-turn" key={entry.turn.id}>
              <div className="radio-message radio-message--user">
                <p className="radio-user-bubble">{entry.turn.userMessage.content}</p>
                <KoradioAvatar
                  fallback={Array.from(profile.nickname).slice(0, 2).join("")}
                  label="我的头像"
                  reference={profile.avatarRef}
                />
              </div>
              <div className="radio-message radio-message--dj">
                <KoradioAvatar fallback="KO" label="DJ 头像" reference={profile.djAvatarRef} />
                <div className="radio-dj-bubble">
                  <p>{entry.turn.assistantMessage.content}</p>
                  {entry.turn.track !== null && (
                    <>
                      <article className="radio-track-card">
                        <strong>{entry.turn.track.title}</strong>
                        <span>
                          {entry.turn.track.artist} · {entry.turn.track.album}
                        </span>
                        <div>
                          <button
                            type="button"
                            aria-busy={playTrack.isPending || undefined}
                            disabled={playTrack.isPending}
                            onClick={() => {
                              playTrack.mutate({ mode: "now", track: entry.turn.track });
                            }}
                          >
                            PLAY NOW
                          </button>
                          <button
                            type="button"
                            aria-busy={playTrack.isPending || undefined}
                            disabled={playTrack.isPending}
                            onClick={() => {
                              playTrack.mutate({ mode: "next", track: entry.turn.track });
                            }}
                          >
                            PLAY NEXT
                          </button>
                        </div>
                      </article>
                      {recommendedTrackMessage?.trackId === entry.turn.track.id && (
                        <p className="radio-dialogue__turn-error" role="status">
                          {recommendedTrackMessage.message}
                        </p>
                      )}
                    </>
                  )}
                  {(entry.turn.recommendedTracks ?? []).map((track) => (
                    <div key={track.id}>
                      <article className="radio-track-card">
                        <strong>{track.title}</strong>
                        <span>{`${track.artist} · ${track.album}`}</span>
                        <div>
                          <button
                            type="button"
                            aria-busy={playTrack.isPending || undefined}
                            disabled={playTrack.isPending}
                            onClick={() => {
                              playTrack.mutate({ mode: "now", track });
                            }}
                          >
                            PLAY NOW
                          </button>
                          <button
                            type="button"
                            aria-busy={playTrack.isPending || undefined}
                            disabled={playTrack.isPending}
                            onClick={() => {
                              playTrack.mutate({ mode: "next", track });
                            }}
                          >
                            PLAY NEXT
                          </button>
                        </div>
                      </article>
                      {recommendedTrackMessage?.trackId === track.id && (
                        <p className="radio-dialogue__turn-error" role="status">
                          {recommendedTrackMessage.message}
                        </p>
                      )}
                    </div>
                  ))}
                  <small>
                    {new Date(entry.turn.createdAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              </div>
            </div>
          ) : (
            <div className="radio-message radio-message--dj" key={entry.script.id}>
              <KoradioAvatar fallback="KO" label="DJ 头像" reference={profile.djAvatarRef} />
              <div className="radio-dj-bubble">
                <p>{entry.script.text}</p>
                {(entry.script.citations ?? []).map((citation) => (
                  <a
                    className="radio-dj-source"
                    href={citation.url}
                    key={citation.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    SOURCE · {citation.title}
                  </a>
                ))}
                {entry.script.ttsAudioRef !== null
                  ? (() => {
                      const playing =
                        (audio.voiceActive && audio.voiceSegmentId === entry.script.id) ||
                        (audio.preview?.kind === "dj" &&
                          audio.preview.previewId === entry.script.id &&
                          audio.preview.state === "playing");
                      return (
                        <button
                          className={`radio-script-replay${playing ? " radio-script-replay--playing" : ""}`}
                          type="button"
                          disabled={replayScript.isPending}
                          onClick={() => {
                            replayScript.mutate(entry.script);
                          }}
                        >
                          {playing
                            ? "PLAYING"
                            : replayScript.isPending &&
                                replayScript.variables.id === entry.script.id
                              ? "PREPARING…"
                              : "REPLAY"}
                        </button>
                      );
                    })()
                  : null}
              </div>
            </div>
          ),
        )}
        {pendingTurn !== undefined && (
          <div className="radio-turn radio-turn--pending" aria-live="polite">
            <div className="radio-message radio-message--user">
              <p className="radio-user-bubble">{pendingTurn.content}</p>
              <KoradioAvatar
                fallback={Array.from(profile.nickname).slice(0, 2).join("")}
                label="我的头像"
                reference={profile.avatarRef}
              />
            </div>
            <div className="radio-message radio-message--dj">
              <KoradioAvatar fallback="KO" label="DJ 头像" reference={profile.djAvatarRef} />
              <div className="radio-dj-bubble">
                <p>
                  {pendingTurn.status === "pending"
                    ? "Thinking..."
                    : (turnError ?? "DJ 暂时没有完成这次回应，请修改后重试。")}
                </p>
                {pendingTurn.status === "pending" && (
                  <span className="radio-tuning-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {scenarioText !== undefined && !turnPending && (
          <div className="radio-message radio-message--dj" role="status">
            <KoradioAvatar fallback="KO" label="DJ 头像" reference={profile.djAvatarRef} />
            <div className="radio-dj-bubble">
              <p>{generationCopy(stage)}</p>
              <span className="radio-tuning-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}
        {handoff !== null && (
          <div className="radio-program-handoff" role="status">
            <p>NEW SESSION READY · {handoff.program.trackIds.length} TRACKS</p>
            <strong>{handoff.program.title}</strong>
            <span>当前歌曲结束后自动切换</span>
            <button type="button" disabled={handoffPending} onClick={onHandoffActivate}>
              {handoffPending ? "SWITCHING..." : "SWITCH NOW"}
            </button>
          </div>
        )}
        {turnError !== undefined && pendingTurn === undefined && (
          <p className="radio-dialogue__turn-error" role="alert">
            {turnError}
          </p>
        )}
        {replayScript.isError && (
          <p className="radio-dialogue__turn-error" role="alert">
            这段串讲暂时无法播放，文字内容仍会保留。
          </p>
        )}
        {clearConversationMutation.isError && (
          <p className="radio-dialogue__turn-error" role="alert">
            对话记录未能清空，请重试。
          </p>
        )}
        {error !== undefined || initialError ? (
          <div className="radio-dialogue__error" role="alert">
            <p className="radio-dj-label">DJ</p>
            <div>
              <strong>{initialError ? "PROGRAM UNAVAILABLE" : error?.title}</strong>
              <p>{initialError ? "当前节目暂时无法读取，已有数据没有被修改。" : error?.message}</p>
              <span>
                <button
                  type="button"
                  onClick={() => {
                    onRetry(failure?.scenarioText);
                  }}
                >
                  重试
                </button>
                {(error?.settings ?? false) && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/settings");
                    }}
                  >
                    前往 Settings
                  </button>
                )}
              </span>
            </div>
          </div>
        ) : conversation.length === 0 && !turnPending && pendingTurn === undefined ? (
          <div className="radio-message radio-message--dj">
            <KoradioAvatar fallback="KO" label="DJ 头像" reference={profile.djAvatarRef} />
            <div className="radio-dj-bubble">
              <p>
                {state === "generating"
                  ? generationCopy(stage)
                  : (intro ??
                    "I’m here when you’re ready. Give me a mood, a task, or a little context.")}
              </p>
              {state === "generating" && (
                <span className="radio-tuning-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {state === "playing" && <small>JUST NOW · TEXT SESSION</small>}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function RadioExperience({
  audioEngine,
  current,
  eventBus,
  headingRef,
  health,
  initialScenarioDraft,
  navigate,
  onCurrentChanged,
  onOpenProfiles,
  onScenarioDraftConsumed,
  reconnecting,
  transport,
}: RadioExperienceProps): ReactElement {
  const radio = useRadioProgram({
    eventBus,
    initialDraft: initialScenarioDraft,
    profileId: current.profile.id,
    transport,
  });
  const audio = useAudioSnapshot(audioEngine);
  const handoff = useQuery({
    queryKey: ["program-handoff", current.profile.id],
    queryFn: () => getProgramHandoff(transport, current.profile.id),
  });
  const handoffActivation = useMutation({
    mutationFn: () => {
      const programId = handoff.data?.program?.program.id;
      if (programId === undefined) throw new Error("Program handoff is unavailable");
      return activateProgramHandoff(transport, current.profile.id, programId);
    },
    onSuccess(nextProgram) {
      audioEngine.clearProgramHandoff?.();
      void audioEngine.loadProgram(nextProgram, { autoplay: true });
      void handoff.refetch();
    },
  });
  const playbackState: RadioViewState =
    audio.preview?.kind === "track" && audio.preview.track !== undefined
      ? "playing"
      : radio.viewState;
  const feedback = useFeedback({ eventBus, profileId: current.profile.id, transport });
  const [themeError, setThemeError] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUnavailable, setDetailUnavailable] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(true);
  const detailOpenerRef = useRef<HTMLButtonElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const [reuseNotice, setReuseNotice] = useState(initialScenarioDraft !== undefined);
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
  useEffect(() => {
    if (initialScenarioDraft === undefined) return;
    setReuseNotice(true);
    onScenarioDraftConsumed();
    window.setTimeout(() => sceneInputRef.current?.focus(), 0);
  }, [initialScenarioDraft, onScenarioDraftConsumed]);
  useEffect(() => {
    if (!reuseNotice) return;
    const timer = window.setTimeout(() => {
      setReuseNotice(false);
    }, 5_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [reuseNotice]);
  useEffect(() => {
    if (radio.program !== null) {
      if (radio.autoplayProgramId === radio.program.program.id) {
        void audioEngine.loadProgram(radio.program, { autoplay: true });
      } else {
        void (
          audioEngine.syncProgram?.(radio.program) ??
          audioEngine.loadProgram(radio.program, { autoplay: false })
        );
      }
    } else {
      void audioEngine.activateProfile(current.profile.id);
    }
  }, [audioEngine, current.profile.id, radio.autoplayProgramId, radio.program]);
  useEffect(
    () =>
      eventBus.subscribe((event) => {
        if (
          event.eventType === "program.deleted" &&
          event.profileId === current.profile.id &&
          event.payload.clearedCurrentSession
        ) {
          setDetailOpen(false);
          void audioEngine.clearProgram?.();
        }
      }),
    [audioEngine, current.profile.id, eventBus],
  );
  useEffect(() => {
    setQueueExpanded(true);
  }, [radio.program?.program.id]);
  const themeMutation = useMutation({
    mutationFn: (themeMode: "dark" | "light") =>
      updateProfilePreferences(transport, current.profile.id, { themeMode }),
    onSuccess(preferences) {
      onCurrentChanged({ ...current, preferences });
      setThemeError(false);
    },
    onError() {
      applyTheme(current.preferences.themeMode);
      setThemeError(true);
    },
  });
  const renderedTheme = document.documentElement.dataset.theme;
  const nextTheme = renderedTheme === "light" ? "dark" : "light";
  const style = {
    "--radio-dialogue-height": radioTokens.dialogueHeight,
    "--radio-main-height": radioTokens.mainHeight,
    "--radio-player-height": radioTokens.playerHeight,
    "--radio-rail-width": radioTokens.railWidth,
  } as CSSProperties;

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    radio.submitScenario();
  }

  return (
    <>
      <div
        className={`app-surface radio-page${queueExpanded ? "" : " radio-page--queue-collapsed"}`}
        style={style}
      >
        <header className="topbar radio-page__topbar">
          <Brand />
          <div className="radio-page__tools">
            <span className="radio-page__mode">
              {health.mode === "live" ? "LIVE" : "DEMO MODE"}
            </span>
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
            <button
              className="icon-button"
              type="button"
              aria-label={`切换为 ${nextTheme} 主题`}
              disabled={themeMutation.isPending}
              onClick={() => {
                applyTheme(nextTheme);
                themeMutation.mutate(nextTheme);
              }}
            >
              <Icon name={nextTheme === "light" ? "sun" : "moon"} />
            </button>
          </div>
        </header>
        <main className="radio-scroll" aria-busy={radio.initialLoading || undefined}>
          <RadioTime headingRef={headingRef} state={radio.viewState} />
          <RadioMain
            audio={audio}
            audioEngine={audioEngine}
            feedback={feedback}
            program={radio.program}
            stage={radio.stage}
            state={playbackState}
          />
          <RadioQueue
            audio={audio}
            currentTrackId={
              audio.currentItem?.kind === "track" ? audio.currentItem.trackId : undefined
            }
            expanded={queueExpanded}
            onExpandedChange={setQueueExpanded}
            program={radio.program}
            state={playbackState}
          />
          {audio.mediaError === "queue_exhausted" ? (
            <div className="radio-blocking-error" role="alert">
              <span>当前队列无法继续播放。</span>
              <button
                type="button"
                onClick={() => {
                  radio.submitScenario(radio.program?.program.scenarioText);
                }}
              >
                重新生成
              </button>
            </div>
          ) : null}
          <button
            className={`radio-dj-status radio-dj-status--${radio.viewState}`}
            type="button"
            aria-expanded={detailOpen}
            aria-haspopup="dialog"
            aria-label={radio.program === null ? "查看节目详情" : "打开当前节目详情"}
            onClick={() => {
              if (radio.program === null && audio.preview?.track === undefined) {
                setDetailUnavailable(true);
                return;
              }
              setDetailError(false);
              setDetailUnavailable(false);
              setDetailOpen(true);
            }}
            ref={detailOpenerRef}
          >
            <span>
              <i aria-hidden="true" />
              <strong>DJ</strong>
              <span>
                {radio.viewState === "generating"
                  ? "THINKING"
                  : audio.voiceActive || audio.currentItem?.kind === "dj"
                    ? "SPEAKING"
                    : radio.viewState === "playing"
                      ? "PLAYING"
                      : "LIVE"}
              </span>
            </span>
            <b aria-hidden="true">⌃</b>
          </button>
          <RadioDialogue
            audio={audio}
            audioEngine={audioEngine}
            conversation={radio.conversation}
            failure={radio.failure}
            handoff={handoff.data?.program ?? null}
            handoffPending={handoffActivation.isPending}
            initialError={radio.initialError}
            navigate={navigate}
            onConversationCleared={() => {
              radio.clearConversation();
            }}
            onHandoffActivate={() => {
              if (handoff.data?.program !== null && handoff.data?.program !== undefined) {
                handoffActivation.mutate();
              }
            }}
            onRetry={(scenario) => {
              if (scenario === undefined) {
                radio.retryLatestProgram();
              } else {
                radio.submitScenario(scenario);
              }
            }}
            profileId={current.profile.id}
            profile={current.profile}
            program={radio.program}
            pendingTurn={radio.pendingTurn}
            scenarioText={radio.scenarioText}
            stage={radio.stage}
            state={radio.viewState}
            transport={transport}
            turnError={radio.turnError}
            turnPending={radio.turnPending}
          />
        </main>
        <form
          aria-label="DJ 场景输入"
          className={`radio-scene-input${radio.turnPending ? " radio-scene-input--disabled" : ""}${radio.validationError !== undefined ? " radio-scene-input--error" : ""}`}
          onSubmit={submit}
        >
          <label className="visually-hidden" htmlFor="radio-scene">
            告诉 DJ 当前场景
          </label>
          <input
            id="radio-scene"
            ref={sceneInputRef}
            value={radio.draft}
            onChange={(event) => {
              radio.setDraft(event.target.value);
            }}
            placeholder={
              radio.turnPending
                ? "Thinking..."
                : radio.viewState === "playing"
                  ? "Say something else to the DJ..."
                  : "Say something to the DJ..."
            }
            disabled={radio.turnPending}
            aria-invalid={radio.validationError !== undefined || undefined}
            aria-describedby={radio.validationError === undefined ? undefined : "radio-scene-error"}
          />
          <button
            className="radio-scene-input__mic"
            type="button"
            aria-label="语音输入尚未接入"
            disabled
          >
            <Icon name="mic" />
          </button>
          <button
            className="radio-scene-input__send"
            type="submit"
            aria-label="发送给 DJ"
            disabled={radio.turnPending}
          >
            <Icon name="send" />
          </button>
          {radio.validationError !== undefined && (
            <span className="visually-hidden" id="radio-scene-error" role="alert">
              {radio.validationError}
            </span>
          )}
        </form>
        {reconnecting && <TransientToast>EVENTS RECONNECTING · SNAPSHOT ACTIVE</TransientToast>}
        {themeError && (
          <TransientToast
            error
            onDismiss={() => {
              setThemeError(false);
            }}
          >
            主题保存失败，已恢复到之前的主题
          </TransientToast>
        )}
        {reuseNotice && (
          <TransientToast
            onDismiss={() => {
              setReuseNotice(false);
            }}
          >
            已带着这个场景回到 Radio
          </TransientToast>
        )}
        {audio.mediaError !== undefined && audio.mediaError !== "queue_exhausted" && (
          <TransientToast error>
            {audio.mediaError === "autoplay_blocked"
              ? "浏览器阻止了自动播放，请按播放继续"
              : "当前音频无法播放，正在尝试下一段"}
          </TransientToast>
        )}
        {audio.checkpointError && (
          <TransientToast error>播放继续，但历史记录暂未保存</TransientToast>
        )}
        {detailUnavailable && (
          <TransientToast
            error
            onDismiss={() => {
              setDetailUnavailable(false);
            }}
          >
            先生成一段电台，再查看节目详情
          </TransientToast>
        )}
        {detailError && (
          <TransientToast
            error
            onDismiss={() => {
              setDetailError(false);
            }}
          >
            节目详情暂时不可用，播放继续
          </TransientToast>
        )}
        <FeedbackNotice notice={feedback.notice} onDismiss={feedback.dismissNotice} />
        <PrimaryNavigation active="radio" onNavigate={navigate} />
      </div>
      {detailOpen &&
        (radio.program !== null || audio.preview?.track !== undefined) &&
        createPortal(
          <div className="radio-detail-portal">
            <div className="radio-detail-portal__canvas">
              <DetailSheetBoundary
                key={radio.program?.program.id ?? audio.preview?.previewId}
                onFailure={() => {
                  setDetailOpen(false);
                  setDetailError(true);
                  window.queueMicrotask(() => detailOpenerRef.current?.focus());
                }}
              >
                <DetailSheet
                  audio={audio}
                  audioEngine={audioEngine}
                  onClosed={() => {
                    setDetailOpen(false);
                    window.queueMicrotask(() => detailOpenerRef.current?.focus());
                  }}
                  profileId={current.profile.id}
                  program={radio.program}
                  transport={transport}
                />
              </DetailSheetBoundary>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
