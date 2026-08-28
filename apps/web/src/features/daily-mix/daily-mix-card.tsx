import type { DailyMixDetail, DailyMixTodayResponse, MusicTrack } from "@koradio/contracts";
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import type { AudioEngineFacade, AudioEngineSnapshot } from "../../audio/index.js";
import { ArtworkImage } from "../../shared/artwork.js";
import { Icon } from "../../shared/icon.js";

import "./daily-mix.css";

interface DailyMixCardProps {
  audio: AudioEngineSnapshot;
  audioEngine: AudioEngineFacade;
  onClose: () => void;
  onPlayNext: (track: MusicTrack) => void;
  onRetry: () => void;
  open: boolean;
  retrying: boolean;
  today: DailyMixTodayResponse | undefined;
}

interface SoundfieldPoint {
  x: number;
  y: number;
}

const soundfieldLineCount = 72;
const soundfieldSampleCount = 28;

function soundfieldPath(points: SoundfieldPoint[]): string {
  const first = points[0];
  if (first === undefined) return "";
  let path = `M ${String(first.x)} ${String(first.y)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous === undefined || point === undefined) continue;
    const before = points[index - 2] ?? previous;
    const after = points[index + 1] ?? point;
    const controlOne = {
      x: previous.x + (point.x - before.x) / 6,
      y: previous.y + (point.y - before.y) / 6,
    };
    const controlTwo = {
      x: point.x - (after.x - previous.x) / 6,
      y: point.y - (after.y - previous.y) / 6,
    };
    path += ` C ${String(controlOne.x)} ${String(controlOne.y)}, ${String(controlTwo.x)} ${String(controlTwo.y)}, ${String(point.x)} ${String(point.y)}`;
  }
  return path;
}

function bell(value: number, center: number, spread: number): number {
  return Math.exp(-((value - center) ** 2) / spread);
}

function surfaceRidge(progress: number): number {
  return (
    123 -
    bell(progress, 0.19, 0.018) * 22 +
    bell(progress, 0.43, 0.034) * 35 -
    bell(progress, 0.68, 0.022) * 28 +
    bell(progress, 0.88, 0.028) * 17 +
    Math.sin(progress * Math.PI * 3.3 - 0.7) * 5
  );
}

function surfaceSpan(progress: number): number {
  return 22 + bell(progress, 0.34, 0.06) * 26 + bell(progress, 0.7, 0.05) * 34;
}

function surfacePoint(progress: number, depth: number): SoundfieldPoint {
  const span = surfaceSpan(progress) + Math.sin(progress * Math.PI * 2.4 + 0.8) * 5;
  return {
    x: -36 + progress * 792,
    y: surfaceRidge(progress) + depth * span,
  };
}

function surfaceLinePoints(depth: number): SoundfieldPoint[] {
  return Array.from({ length: soundfieldSampleCount }, (_, index) =>
    surfacePoint(index / Math.max(1, soundfieldSampleCount - 1), depth),
  );
}

function surfaceLineDepth(index: number): number {
  const regularDepth = -1 + (index / Math.max(1, soundfieldLineCount - 1)) * 2;
  return Math.min(1, Math.max(-1, regularDepth + Math.sin(index * 1.37) * 0.009));
}

function soundfieldTone(depth: number): "primary" | "secondary" | "ambient" {
  if (depth > 0.34) return "primary";
  if (depth > -0.48) return "secondary";
  return "ambient";
}

function surfaceShape(): string {
  const upper = surfaceLinePoints(-1);
  const lower = surfaceLinePoints(1).toReversed();
  return `${soundfieldPath(upper)} ${soundfieldPath(lower).replace(/^M /u, "L ")} Z`;
}

function Soundfield(): ReactElement {
  const lines = Array.from({ length: soundfieldLineCount }, (_, index) => {
    const depth = surfaceLineDepth(index);
    return { depth, index, path: soundfieldPath(surfaceLinePoints(depth)) };
  });
  return (
    <svg
      className="daily-mix-soundfield"
      viewBox="0 0 720 230"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="daily-mix-soundfield-surface" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#1d252c" stopOpacity="0" />
          <stop offset="0.26" stopColor="#b8c1ca" stopOpacity="0.08" />
          <stop offset="0.54" stopColor="#f0f3f6" stopOpacity="0.14" />
          <stop offset="0.78" stopColor="#9aa5b0" stopOpacity="0.06" />
          <stop offset="1" stopColor="#151b21" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="daily-mix-soundfield__surface" d={surfaceShape()} />
      <g className="daily-mix-soundfield__mesh">
        {lines.map(({ depth, index, path }) => (
          <path
            className={`daily-mix-soundfield__line daily-mix-soundfield__line--${soundfieldTone(depth)}`}
            d={path}
            key={index}
            pathLength="1"
            style={{ opacity: 0.3 + (depth + 1) * 0.35 }}
          />
        ))}
      </g>
      <g className="daily-mix-soundfield__glints">
        {lines
          .filter(({ index }) => index % 3 === 1)
          .map(({ index, path }) => (
            <path
              className="daily-mix-soundfield__glint"
              d={path}
              key={index}
              pathLength="1"
              style={{ "--daily-mix-glint-delay": `${String(-index * 85)}ms` } as CSSProperties}
            />
          ))}
      </g>
    </svg>
  );
}

function formattedDate(localDate: string | undefined): { month: string; day: string } {
  if (localDate === undefined) return { month: "--", day: "--" };
  const [, month, day] = localDate.split("-");
  return { month: month ?? "--", day: day ?? "--" };
}

function DailyTracks({
  audio,
  audioEngine,
  mix,
  onPlayNext,
}: {
  audio: AudioEngineSnapshot;
  audioEngine: AudioEngineFacade;
  mix: DailyMixDetail;
  onPlayNext: (track: MusicTrack) => void;
}): ReactElement {
  const currentTrackId =
    audio.sourceKind === "daily" &&
    audio.preview === undefined &&
    audio.currentItem?.kind === "track"
      ? audio.currentItem.trackId
      : undefined;
  const isPlaying = (track: MusicTrack): boolean =>
    track.id === currentTrackId && (audio.state === "playing" || audio.state === "buffering");
  const isCurrent = (track: MusicTrack): boolean => track.id === currentTrackId;
  return (
    <ol className="daily-mix-list" aria-label="TODAY'S PICKS">
      {mix.tracks.map(({ position, track }) => (
        <li
          className={isCurrent(track) ? "daily-mix-list__track--current" : undefined}
          key={track.id}
          aria-current={isCurrent(track) ? "true" : undefined}
        >
          <span className="daily-mix-list__number">{String(position + 1).padStart(2, "0")}</span>
          <span className="daily-mix-list__artwork">
            <ArtworkImage src={track.artworkUrl} />
          </span>
          <span className="daily-mix-list__meta">
            <strong>
              {isCurrent(track) ? (
                <span
                  className={`daily-mix-list__playing${isPlaying(track) ? "" : " daily-mix-list__playing--paused"}`}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              {track.title}
            </strong>
            <small>{track.artist}</small>
          </span>
          <button
            type="button"
            className={`daily-mix-list__action${isPlaying(track) ? " daily-mix-list__action--active" : ""}`}
            aria-label={`${isPlaying(track) ? "PAUSE" : "PLAY"} ${track.title}`}
            onClick={() => {
              if (isPlaying(track)) {
                void audioEngine.pause();
                return;
              }
              if (isCurrent(track) && (audio.state === "paused" || audio.state === "ready")) {
                void audioEngine.play();
                return;
              }
              void audioEngine.loadDailyMix?.(mix, { autoplay: true, startIndex: position });
            }}
          >
            <Icon className="daily-mix-icon" name={isPlaying(track) ? "pause" : "play"} />
          </button>
          <button
            type="button"
            className="daily-mix-list__action"
            aria-label={`PLAY ${track.title} NEXT`}
            onClick={() => {
              onPlayNext(track);
            }}
          >
            <Icon className="daily-mix-icon" name="next" />
          </button>
        </li>
      ))}
    </ol>
  );
}

export function DailyMixCard(props: DailyMixCardProps): ReactElement | null {
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  const generation = props.today?.generation;
  const mix = props.today?.mix;
  const date = formattedDate(props.today?.localDate);
  const generating =
    generation !== null &&
    generation !== undefined &&
    generation.status !== "succeeded" &&
    generation.status !== "failed" &&
    generation.status !== "canceled";

  const requestClose = useCallback((): void => {
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = window.setTimeout(
      () => {
        closeTimer.current = undefined;
        props.onClose();
      },
      reducedMotion ? 0 : 320,
    );
  }, [closing, props.onClose]);

  useEffect(() => {
    if (!props.open) {
      setClosing(false);
      if (closeTimer.current !== undefined) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = undefined;
      }
      return;
    }
    setClosing(false);
    closeRef.current?.focus();
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = [
        ...(cardRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
      ];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, requestClose]);

  useEffect(
    () => () => {
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  if (!props.open) return null;
  return createPortal(
    <div
      className={`daily-mix-backdrop${closing ? " daily-mix-backdrop--closing" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className={`daily-mix-card${closing ? " daily-mix-card--closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-mix-title"
        ref={cardRef}
      >
        <header className="daily-mix-hero">
          <Soundfield />
          <div className="daily-mix-hero__copy">
            <p id="daily-mix-title">DAILY MIX</p>
            <h2 aria-label={`${date.month}/${date.day}`}>
              <span>{date.month}</span>
              <span className="daily-mix-date__slash" aria-hidden="true">
                /
              </span>
              <span>{date.day}</span>
            </h2>
            {mix !== null && mix !== undefined ? (
              <button
                className="daily-mix-play-all"
                type="button"
                onClick={() =>
                  void props.audioEngine.loadDailyMix?.(mix, { autoplay: true, startIndex: 0 })
                }
              >
                <span className="daily-mix-play-all__icon" aria-hidden="true">
                  <Icon className="daily-mix-icon" name="play" />
                </span>
                PLAY ALL
              </button>
            ) : null}
          </div>
          <button
            className="daily-mix-close"
            type="button"
            aria-label="CLOSE DAILY MIX"
            onClick={requestClose}
            ref={closeRef}
          >
            <Icon className="daily-mix-icon" name="close" />
          </button>
        </header>
        {mix !== null && mix !== undefined ? (
          <div className="daily-mix-body">
            <p className="daily-mix-kicker">TODAY'S PICKS · 20 TRACKS</p>
            <DailyTracks
              audio={props.audio}
              audioEngine={props.audioEngine}
              mix={mix}
              onPlayNext={props.onPlayNext}
            />
          </div>
        ) : (
          <div className="daily-mix-state" aria-live="polite">
            {generating ? (
              <>
                <span className="daily-mix-loader" aria-hidden="true" />
                <h3>PREPARING TODAY'S MIX</h3>
                <p>CHECKING PLAYABLE TRACKS BEFORE THE LIST IS PUBLISHED.</p>
              </>
            ) : (
              <>
                <h3>TODAY'S MIX IS NOT READY</h3>
                <p>YESTERDAY'S LIST WILL NOT BE SHOWN AS TODAY'S MIX.</p>
                <button type="button" disabled={props.retrying} onClick={props.onRetry}>
                  {props.retrying ? "RETRYING..." : "RETRY"}
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
