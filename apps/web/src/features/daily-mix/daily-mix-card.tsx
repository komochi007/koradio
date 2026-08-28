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

interface SoundfieldPoint {
  x: number;
  y: number;
}

const soundfieldWidth = 1440;
const soundfieldHeight = 460;
const soundfieldColumns = 144;
const soundfieldRows = 76;

function bell(value: number, center: number, spread: number): number {
  return Math.exp(-((value - center) ** 2) / spread);
}

function surfaceRidge(progress: number): number {
  return (
    262 -
    bell(progress, 0.12, 0.024) * 34 -
    bell(progress, 0.3, 0.026) * 56 -
    bell(progress, 0.52, 0.036) * 102 -
    bell(progress, 0.76, 0.03) * 46 -
    bell(progress, 0.93, 0.022) * 23 +
    Math.sin(progress * Math.PI * 3.1 - 0.45) * 9
  );
}

function surfaceSpan(progress: number): number {
  return 42 + bell(progress, 0.3, 0.07) * 56 + bell(progress, 0.62, 0.055) * 88;
}

function surfacePoint(progress: number, depth: number): SoundfieldPoint {
  const span = surfaceSpan(progress) + Math.sin(progress * Math.PI * 2.1 + 0.6) * 9;
  const perspective = depth * (18 + bell(progress, 0.54, 0.08) * 18);
  return {
    x: -28 + progress * (soundfieldWidth + 56) + perspective,
    y: surfaceRidge(progress) + depth * span,
  };
}

function traceSurfaceBoundary(context: CanvasRenderingContext2D): void {
  context.beginPath();
  for (let column = 0; column <= soundfieldColumns; column += 1) {
    const point = surfacePoint(column / soundfieldColumns, -1);
    if (column === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  for (let column = soundfieldColumns; column >= 0; column -= 1) {
    const point = surfacePoint(column / soundfieldColumns, 1);
    context.lineTo(point.x, point.y);
  }
  context.closePath();
}

function drawStaticSoundfield(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, soundfieldWidth, soundfieldHeight);
  traceSurfaceBoundary(context);
  const surface = context.createLinearGradient(0, 0, soundfieldWidth, 0);
  surface.addColorStop(0, "rgb(67 75 85 / 0)");
  surface.addColorStop(0.3, "rgb(171 183 194 / 0.09)");
  surface.addColorStop(0.55, "rgb(225 231 237 / 0.16)");
  surface.addColorStop(0.82, "rgb(120 133 147 / 0.07)");
  surface.addColorStop(1, "rgb(38 46 55 / 0)");
  context.fillStyle = surface;
  context.fill();
  context.save();
  traceSurfaceBoundary(context);
  context.clip();
  context.lineCap = "round";

  for (let row = 0; row <= soundfieldRows; row += 1) {
    const depth = -1 + (row / soundfieldRows) * 2;
    context.beginPath();
    for (let column = 0; column <= soundfieldColumns; column += 1) {
      const point = surfacePoint(column / soundfieldColumns, depth);
      if (column === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.lineWidth = 1.25;
    context.strokeStyle = `rgb(227 233 238 / ${String(0.07 + (depth + 1) * 0.17 + bell(depth, 0.3, 0.32) * 0.15)})`;
    context.stroke();
  }

  for (let column = 0; column <= soundfieldColumns; column += 4) {
    const progress = column / soundfieldColumns;
    context.beginPath();
    for (let row = 0; row <= soundfieldRows; row += 1) {
      const point = surfacePoint(progress, -1 + (row / soundfieldRows) * 2);
      if (row === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.lineWidth = 0.72;
    context.strokeStyle = `rgb(198 209 220 / ${String(0.025 + bell(progress, 0.52, 0.12) * 0.08)})`;
    context.stroke();
  }
  context.restore();
}

function drawFlowingLight(context: CanvasRenderingContext2D, elapsedMs: number): void {
  const flow = 0.12 + ((elapsedMs / 34_000) % 1) * 0.76;
  const center = surfacePoint(flow, -0.08 + Math.sin(elapsedMs / 9_000) * 0.18);
  context.save();
  traceSurfaceBoundary(context);
  context.clip();
  context.globalCompositeOperation = "screen";
  context.translate(center.x, center.y);
  context.rotate(-0.32);
  context.scale(1.8, 0.54);
  const light = context.createRadialGradient(0, 0, 0, 0, 0, 190);
  light.addColorStop(0, "rgb(255 255 255 / 0.34)");
  light.addColorStop(0.24, "rgb(237 243 248 / 0.18)");
  light.addColorStop(0.62, "rgb(196 212 226 / 0.05)");
  light.addColorStop(1, "rgb(177 195 211 / 0)");
  context.fillStyle = light;
  context.fillRect(-220, -220, 440, 440);
  context.restore();
}

function Soundfield(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof CanvasRenderingContext2D === "undefined") return undefined;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (context === null || context === undefined) return undefined;
    const staticLayer = document.createElement("canvas");
    staticLayer.width = soundfieldWidth;
    staticLayer.height = soundfieldHeight;
    const staticContext = staticLayer.getContext("2d");
    if (staticContext === null) return undefined;
    drawStaticSoundfield(staticContext);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number | undefined;

    const paint = (elapsedMs: number): void => {
      context.clearRect(0, 0, soundfieldWidth, soundfieldHeight);
      context.drawImage(staticLayer, 0, 0);
      drawFlowingLight(context, motion.matches ? 13_600 : elapsedMs);
      if (!motion.matches) frame = window.requestAnimationFrame(paint);
    };

    const restart = (): void => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(paint);
    };

    restart();
    motion.addEventListener("change", restart);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      motion.removeEventListener("change", restart);
    };
  }, []);

  return (
    <canvas
      aria-hidden="true"
      className="daily-mix-soundfield"
      height={soundfieldHeight}
      ref={canvasRef}
      width={soundfieldWidth}
    />
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
