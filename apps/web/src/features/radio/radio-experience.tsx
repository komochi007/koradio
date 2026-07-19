import { useMutation } from "@tanstack/react-query";
import {
  type MusicTrack,
  type ProfileContext,
  type ProgramDetail,
  type ProgramGenerationStage,
} from "@koradio/contracts";
import { radioTokens } from "@koradio/design-tokens";
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { applyTheme, updateProfilePreferences } from "../profile-preferences/index.js";
import { Brand, PrimaryNavigation } from "../../shared/ui.js";
import type { AppEventBus } from "../../shared/events.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { useRadioProgram, type RadioViewState } from "./use-radio-program.js";
import "./radio.css";

interface RadioExperienceProps {
  current: ProfileContext;
  eventBus: AppEventBus;
  headingRef: RefObject<HTMLHeadingElement | null>;
  navigate: (path: string) => void;
  onCurrentChanged: (current: ProfileContext) => void;
  onOpenProfiles: () => void;
  reconnecting: boolean;
  transport: ServiceTransport;
}

type IconName =
  | "heart"
  | "mic"
  | "moon"
  | "more"
  | "next"
  | "pause"
  | "previous"
  | "queue"
  | "send"
  | "sun"
  | "volume";

const iconPaths: Record<IconName, ReactElement> = {
  heart: <path d="M12 20.4 4.8 13.6A4.9 4.9 0 0 1 12 7a4.9 4.9 0 0 1 7.2 6.6Z" />,
  mic: <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0Zm-3 6a6 6 0 0 0 12 0M12 17v4m-4 0h8" />,
  moon: <path d="M20 15.2A8.7 8.7 0 0 1 8.8 4 8.7 8.7 0 1 0 20 15.2Z" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  next: <path d="m7 5 9 7-9 7Zm10 0v14" />,
  pause: <path d="M8 5v14m8-14v14" />,
  previous: <path d="m17 5-9 7 9 7ZM7 5v14" />,
  queue: <path d="M4 7h11M4 12h11M4 17h11m4-10v10l3-2" />,
  send: <path d="m4 5 16 7-16 7 3-7Zm3 7h13" />,
  sun: (
    <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
  ),
  volume: <path d="M5 10v4h4l5 4V6L9 10Zm12-2a6 6 0 0 1 0 8m2.5-10.5a9 9 0 0 1 0 13" />,
};

function Icon({ name }: { name: IconName }): ReactElement {
  return (
    <svg aria-hidden="true" className="radio-icon" viewBox="0 0 24 24">
      {iconPaths[name]}
    </svg>
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

function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
    synthesizing_dj: "Preparing the opening voice when available.",
    committing: "Putting the final session on air.",
    completed: "Your new session is almost on air.",
  };
  return copy[stage ?? "queued"];
}

function failureCopy(code: string): { message: string; settings: boolean; title: string } {
  if (code.includes("NO_PLAYABLE") || code.includes("TRACK")) {
    return {
      title: "NO TRACKS FOUND",
      message: "没有找到合适歌曲，换个说法后再试一次。",
      settings: false,
    };
  }
  if (code.includes("UNAVAILABLE") || code.includes("CONFIG")) {
    return {
      title: "SERVICE CHECK NEEDED",
      message: "核心服务暂时不可用，请前往 Settings 检查 Codex 与音乐服务。",
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
  program,
  stage,
  state,
}: {
  program: ProgramDetail | null;
  stage: ProgramGenerationStage | undefined;
  state: RadioViewState;
}): ReactElement {
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
  if (state === "empty" || program === null) {
    return (
      <section className="radio-main radio-main--empty" aria-label="当前节目">
        <p className="radio-eyebrow">NOW PLAYING</p>
        <h2>NO SESSION ON AIR</h2>
        <p>告诉 DJ 你现在正在做什么，或者想让这一段时间听起来怎样。</p>
      </section>
    );
  }
  const current = orderedTracks(program)[0];
  return (
    <section className="radio-main radio-main--playing" aria-label="当前节目">
      <article className="radio-player">
        <div className="radio-player__topline">
          <span className="radio-cover" aria-hidden="true" />
          <div className="radio-player__meta">
            <p className="radio-eyebrow">NOW PLAYING</p>
            <h2>{current?.title ?? program.program.title}</h2>
            <p>
              {current === undefined
                ? program.program.title
                : `${current.artist} · ${current.album}`}
            </p>
          </div>
          <div className="radio-player__actions">
            <button type="button" aria-label="喜欢当前歌曲，将在反馈功能接入后可用" disabled>
              <Icon name="heart" />
            </button>
            <button type="button" aria-label="更多播放操作，将在播放功能接入后可用" disabled>
              <Icon name="more" />
            </button>
          </div>
        </div>
        <div className="radio-player__progress" aria-label="播放进度将在 Audio Engine 接入后可用">
          <span>00:00</span>
          <i />
          <span>{formatDuration(current?.durationMs ?? 1)}</span>
        </div>
        <div className="radio-player__controls" aria-label="播放控制将在 Audio Engine 接入后可用">
          {(["volume", "previous", "pause", "next", "queue"] as const).map((name) => (
            <button
              className={name === "pause" ? "radio-player__pause" : ""}
              key={name}
              type="button"
              aria-label={`${name}，将在 Audio Engine 接入后可用`}
              disabled
            >
              <Icon name={name} />
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

function RadioQueue({
  program,
  state,
}: {
  program: ProgramDetail | null;
  state: RadioViewState;
}): ReactElement {
  const tracks = program === null ? [] : orderedTracks(program).slice(0, 4);
  const label =
    state === "generating" ? "QUEUE · PREPARING" : `QUEUE · ${String(tracks.length)} TRACKS`;
  return (
    <section className={`radio-queue radio-queue--${state}`} aria-label="播放队列">
      <header>
        <h2>{label}</h2>
        <span>{state === "generating" ? "BUILDING" : state === "playing" ? "HIDE" : "LIST"}</span>
      </header>
      {state === "generating" ? (
        <ol aria-label="正在生成队列" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
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
      ) : tracks.length === 0 ? (
        <div className="radio-queue__empty">
          <Icon name="queue" />
          <p>Your next session will appear here.</p>
        </div>
      ) : (
        <ol>
          {tracks.map((track, index) => (
            <li
              className={
                index === 0
                  ? "radio-queue__track radio-queue__track--current"
                  : "radio-queue__track"
              }
              key={track.id}
            >
              <span>
                {index === 0 ? (
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
              <span>{formatDuration(track.durationMs)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RadioDialogue({
  failure,
  initialError,
  navigate,
  onRetry,
  program,
  scenarioText,
  state,
}: {
  failure: { code: string; scenarioText: string } | undefined;
  initialError: boolean;
  navigate: (path: string) => void;
  onRetry: (scenario?: string) => void;
  program: ProgramDetail | null;
  scenarioText: string | undefined;
  state: RadioViewState;
}): ReactElement {
  const error = failure === undefined ? undefined : failureCopy(failure.code);
  const intro = program?.djScripts.find((script) => script.type === "intro")?.displayText;
  const visibleScenario =
    scenarioText ?? (state === "playing" ? program?.program.scenarioText : undefined);
  return (
    <section className={`radio-dialogue radio-dialogue--${state}`} aria-label="DJ 对话">
      {visibleScenario !== undefined && <p className="radio-user-bubble">{visibleScenario}</p>}
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
      ) : (
        <div className="radio-dj-copy">
          <p className="radio-dj-label">DJ</p>
          <div>
            <p>
              {state === "generating"
                ? "Tuning your station..."
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
      )}
    </section>
  );
}

export function RadioExperience({
  current,
  eventBus,
  headingRef,
  navigate,
  onCurrentChanged,
  onOpenProfiles,
  reconnecting,
  transport,
}: RadioExperienceProps): ReactElement {
  const radio = useRadioProgram({ eventBus, profileId: current.profile.id, transport });
  const [themeError, setThemeError] = useState(false);
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
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
    <div className="app-surface radio-page" style={style}>
      <header className="topbar radio-page__topbar">
        <Brand />
        <div className="radio-page__tools">
          <button
            className="profile-tool"
            type="button"
            onClick={onOpenProfiles}
            aria-label="切换档案"
          >
            {Array.from(current.profile.nickname).slice(0, 2).join("")}
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
        <RadioMain program={radio.program} stage={radio.stage} state={radio.viewState} />
        <RadioQueue program={radio.program} state={radio.viewState} />
        <button
          className={`radio-dj-status radio-dj-status--${radio.viewState}`}
          type="button"
          aria-label="节目详情将在 Detail Sheet 接入后可用"
          disabled
        >
          <span>
            <i aria-hidden="true" />
            <strong>DJ</strong>
            <span>
              {radio.viewState === "generating"
                ? "THINKING"
                : radio.viewState === "playing"
                  ? "PLAYING"
                  : "LIVE"}
            </span>
          </span>
          <b aria-hidden="true">⌃</b>
        </button>
        <RadioDialogue
          failure={radio.failure}
          initialError={radio.initialError}
          navigate={navigate}
          onRetry={(scenario) => {
            if (scenario === undefined) {
              radio.retryLatestProgram();
            } else {
              radio.submitScenario(scenario);
            }
          }}
          program={radio.program}
          scenarioText={radio.scenarioText}
          state={radio.viewState}
        />
      </main>
      <form
        aria-label="DJ 场景输入"
        className={`radio-scene-input${radio.viewState === "generating" ? " radio-scene-input--disabled" : ""}${radio.validationError !== undefined ? " radio-scene-input--error" : ""}`}
        onSubmit={submit}
      >
        <label className="visually-hidden" htmlFor="radio-scene">
          告诉 DJ 当前场景
        </label>
        <input
          id="radio-scene"
          value={radio.viewState === "generating" ? "" : radio.draft}
          onChange={(event) => {
            radio.setDraft(event.target.value);
          }}
          placeholder={
            radio.viewState === "generating"
              ? "Generating..."
              : radio.viewState === "playing"
                ? "Say something else to the DJ..."
                : "Say something to the DJ..."
          }
          disabled={radio.viewState === "generating"}
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
          disabled={radio.viewState === "generating"}
        >
          <Icon name="send" />
        </button>
        {radio.validationError !== undefined && (
          <span className="visually-hidden" id="radio-scene-error" role="alert">
            {radio.validationError}
          </span>
        )}
      </form>
      {reconnecting && (
        <p className="radio-toast" role="status">
          EVENTS RECONNECTING · SNAPSHOT ACTIVE
        </p>
      )}
      {themeError && (
        <p className="radio-toast radio-toast--error" role="status">
          主题保存失败，已恢复到之前的主题
        </p>
      )}
      <PrimaryNavigation active="radio" onNavigate={navigate} />
    </div>
  );
}
