import type { DailyMixDetail, DailyMixTodayResponse, MusicTrack } from "@koradio/contracts";
import { useEffect, useRef, type CSSProperties, type ReactElement } from "react";
import { createPortal } from "react-dom";

import type { AudioEngineFacade } from "../../audio/index.js";
import { ArtworkImage } from "../../shared/artwork.js";
import { Icon } from "../../shared/icon.js";

import "./daily-mix.css";

interface DailyMixCardProps {
  audioEngine: AudioEngineFacade;
  onClose: () => void;
  onPlayNext: (track: MusicTrack) => void;
  onRetry: () => void;
  open: boolean;
  retrying: boolean;
  today: DailyMixTodayResponse | undefined;
}

function Soundfield(): ReactElement {
  return (
    <svg className="daily-mix-soundfield" viewBox="0 0 720 230" aria-hidden="true">
      {Array.from({ length: 19 }, (_, index) => {
        const y = 28 + index * 10;
        return (
          <path
            d={`M-20 ${String(y)} C 100 ${String(y - 50)}, 180 ${String(y + 40)}, 310 ${String(y - 2)} S 520 ${String(y - 42)}, 760 ${String(y + 4)}`}
            key={index}
            style={{ "--daily-line": index } as CSSProperties}
          />
        );
      })}
    </svg>
  );
}

function formattedDate(localDate: string | undefined): string {
  if (localDate === undefined) return "--/--";
  const [, month, day] = localDate.split("-");
  return `${month ?? "--"}/${day ?? "--"}`;
}

function DailyTracks({
  audioEngine,
  mix,
  onPlayNext,
}: {
  audioEngine: AudioEngineFacade;
  mix: DailyMixDetail;
  onPlayNext: (track: MusicTrack) => void;
}): ReactElement {
  return (
    <ol className="daily-mix-list" aria-label="TODAY'S PICKS">
      {mix.tracks.map(({ position, track }) => (
        <li key={track.id}>
          <span className="daily-mix-list__number">{String(position + 1).padStart(2, "0")}</span>
          <span className="daily-mix-list__artwork">
            <ArtworkImage src={track.artworkUrl} />
          </span>
          <span className="daily-mix-list__meta">
            <strong>{track.title}</strong>
            <small>{track.artist}</small>
          </span>
          <button
            type="button"
            className="daily-mix-list__action"
            aria-label={`PLAY ${track.title}`}
            onClick={() =>
              void audioEngine.loadDailyMix?.(mix, { autoplay: true, startIndex: position })
            }
          >
            <Icon className="daily-mix-icon" name="play" />
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
  const generation = props.today?.generation;
  const mix = props.today?.mix;
  const generating =
    generation !== null &&
    generation !== undefined &&
    generation.status !== "succeeded" &&
    generation.status !== "failed" &&
    generation.status !== "canceled";

  useEffect(() => {
    if (!props.open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        props.onClose();
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
  }, [props.open, props.onClose]);

  if (!props.open) return null;
  return createPortal(
    <div
      className="daily-mix-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        className="daily-mix-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-mix-title"
        ref={cardRef}
      >
        <header className="daily-mix-hero">
          <Soundfield />
          <div className="daily-mix-hero__copy">
            <p id="daily-mix-title">DAILY MIX</p>
            <h2>{formattedDate(props.today?.localDate)}</h2>
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
            onClick={props.onClose}
            ref={closeRef}
          >
            <Icon className="daily-mix-icon" name="close" />
          </button>
        </header>
        {mix !== null && mix !== undefined ? (
          <div className="daily-mix-body">
            <p className="daily-mix-kicker">TODAY'S PICKS · 20 TRACKS</p>
            <DailyTracks audioEngine={props.audioEngine} mix={mix} onPlayNext={props.onPlayNext} />
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
