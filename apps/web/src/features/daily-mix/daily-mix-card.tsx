import type { DailyMixDetail, DailyMixTodayResponse, MusicTrack } from "@koradio/contracts";
import { useEffect, useCallback, useRef, useState, type ReactElement } from "react";
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

type SoundfieldLayer = "crest" | "crossing" | "trough";

interface SoundfieldPoint {
  x: number;
  y: number;
}

const soundfieldLayers: Array<{ id: SoundfieldLayer; count: number }> = [
  { id: "crest", count: 34 },
  { id: "trough", count: 30 },
  { id: "crossing", count: 24 },
];

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

function soundfieldPoints(layer: SoundfieldLayer, index: number, count: number): SoundfieldPoint[] {
  const progress = index / Math.max(1, count - 1);
  const offset = (progress - 0.5) * 2;
  const phase = index * 0.47;
  const texture = Math.sin(phase) * 2.6 + Math.cos(phase * 0.63) * 1.7;
  if (layer === "crest") {
    return [
      { x: -72, y: 132 + offset * 88 + texture },
      { x: 82, y: 68 + offset * 78 - texture * 0.6 },
      { x: 238, y: 28 + offset * 62 + texture * 0.35 },
      { x: 408, y: 72 + offset * 20 - texture * 0.4 },
      { x: 586, y: 136 + offset * 70 + texture * 0.5 },
      { x: 792, y: 154 + offset * 88 - texture },
    ];
  }
  if (layer === "trough") {
    return [
      { x: -72, y: 84 + offset * 82 - texture },
      { x: 92, y: 168 + offset * 74 + texture * 0.5 },
      { x: 256, y: 214 + offset * 56 - texture * 0.35 },
      { x: 424, y: 164 + offset * 18 + texture * 0.4 },
      { x: 604, y: 116 + offset * 66 - texture * 0.5 },
      { x: 792, y: 188 + offset * 86 + texture },
    ];
  }
  return [
    { x: -72, y: 190 + offset * 90 + texture * 0.7 },
    { x: 112, y: 146 + offset * 76 - texture * 0.4 },
    { x: 286, y: 86 + offset * 58 + texture * 0.3 },
    { x: 454, y: 128 + offset * 18 - texture * 0.5 },
    { x: 632, y: 186 + offset * 64 + texture * 0.4 },
    { x: 792, y: 110 + offset * 88 - texture * 0.7 },
  ];
}

function soundfieldTone(index: number): "primary" | "secondary" | "ambient" {
  return index % 7 === 0 ? "primary" : index % 7 <= 4 ? "secondary" : "ambient";
}

function Soundfield(): ReactElement {
  return (
    <svg
      className="daily-mix-soundfield"
      viewBox="0 0 720 230"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {soundfieldLayers.map(({ id, count }) => (
        <g className={`daily-mix-soundfield__layer daily-mix-soundfield__layer--${id}`} key={id}>
          {Array.from({ length: count }, (_, index) => {
            const progress = index / Math.max(1, count - 1);
            const edgeFade = 0.16 + Math.sin(Math.PI * progress) * 0.84;
            const tone = soundfieldTone(index);
            return (
              <path
                className={`daily-mix-soundfield__line daily-mix-soundfield__line--${tone}`}
                d={soundfieldPath(soundfieldPoints(id, index, count))}
                key={index}
                style={{ opacity: edgeFade }}
              />
            );
          })}
        </g>
      ))}
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
                <Icon className="daily-mix-icon" name="play" />
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
