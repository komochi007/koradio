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

type SoundfieldLayer = "crest" | "crossing" | "trough";

interface SoundfieldPoint {
  x: number;
  y: number;
}

const soundfieldLayers: Array<{ id: SoundfieldLayer; count: number }> = [
  { id: "crest", count: 43 },
  { id: "trough", count: 41 },
  { id: "crossing", count: 37 },
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
  const normalizedIndex = index / Math.max(1, count - 1);
  const progress = Math.min(
    1,
    Math.max(0, normalizedIndex + Math.sin(index * 1.71) * 0.008 + Math.cos(index * 0.29) * 0.004),
  );
  const offset = (progress - 0.5) * 2;
  const phase = index * 0.53;
  const texture = Math.sin(phase) * 2.2 + Math.cos(phase * 0.71) * 1.5;
  if (layer === "crest") {
    return [
      { x: -72, y: 138 + offset * 88 + texture },
      { x: 74, y: 82 + offset * 74 - texture * 0.5 },
      { x: 224, y: 34 + offset * 52 + texture * 0.3 },
      { x: 354, y: 104 + offset * 20 - texture * 0.45 },
      { x: 514, y: 166 + offset * 34 + texture * 0.42 },
      { x: 652, y: 118 + offset * 68 - texture * 0.38 },
      { x: 792, y: 152 + offset * 88 + texture * 0.7 },
    ];
  }
  if (layer === "trough") {
    return [
      { x: -72, y: 82 + offset * 84 - texture * 0.7 },
      { x: 84, y: 154 + offset * 70 + texture * 0.45 },
      { x: 240, y: 198 + offset * 48 - texture * 0.3 },
      { x: 390, y: 130 + offset * 18 + texture * 0.4 },
      { x: 540, y: 76 + offset * 36 - texture * 0.45 },
      { x: 668, y: 144 + offset * 68 + texture * 0.34 },
      { x: 792, y: 184 + offset * 84 - texture * 0.65 },
    ];
  }
  return [
    { x: -72, y: 194 + offset * 90 + texture * 0.58 },
    { x: 104, y: 156 + offset * 70 - texture * 0.35 },
    { x: 270, y: 72 + offset * 48 + texture * 0.25 },
    { x: 412, y: 110 + offset * 16 - texture * 0.45 },
    { x: 558, y: 192 + offset * 36 + texture * 0.35 },
    { x: 678, y: 116 + offset * 68 - texture * 0.38 },
    { x: 792, y: 108 + offset * 88 + texture * 0.58 },
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
            const layerDelayOffset = id === "trough" ? 720 : id === "crossing" ? 340 : 0;
            const waveDelay = `${String(-(index * 140 + layerDelayOffset))}ms`;
            return (
              <path
                className={`daily-mix-soundfield__line daily-mix-soundfield__line--${tone}`}
                d={soundfieldPath(soundfieldPoints(id, index, count))}
                key={index}
                style={
                  {
                    opacity: edgeFade,
                    "--daily-mix-line-delay": waveDelay,
                  } as CSSProperties
                }
              />
            );
          })}
        </g>
      ))}
      {[
        { layer: "crest" as const, index: 13, delay: "-4s" },
        { layer: "crossing" as const, index: 18, delay: "-10s" },
        { layer: "trough" as const, index: 27, delay: "-16s" },
      ].map(({ delay, index, layer }) => (
        <path
          className="daily-mix-soundfield__glow"
          d={soundfieldPath(
            soundfieldPoints(
              layer,
              index,
              soundfieldLayers.find(({ id }) => id === layer)?.count ?? 1,
            ),
          )}
          key={`${layer}-${String(index)}`}
          pathLength="1"
          style={{ "--daily-mix-glow-delay": delay } as CSSProperties}
        />
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
