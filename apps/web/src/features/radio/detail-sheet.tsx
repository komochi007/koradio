import { useQuery } from "@tanstack/react-query";
import type { DjScriptSegment, MusicTrack, ProgramDetail } from "@koradio/contracts";
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  type ReactElement,
  type ReactNode,
} from "react";

import type { AudioEngineFacade, AudioEngineSnapshot } from "../../audio/index.js";
import type { ServiceTransport } from "../../shared/transport.js";
import { formatClockDuration } from "../../shared/format.js";
import { getTrackLyrics } from "./detail-api.js";
import {
  deriveTimedText,
  deriveTimedTextUnits,
  estimateDjTiming,
  parseUntimedLyrics,
  parseTimedLyrics,
  programProgress,
  type DisplayTimedTextLine,
} from "./detail-timed-text.js";
import "./detail-sheet.css";

const timelineBars = 96;

interface DetailSheetProps {
  audio: AudioEngineSnapshot;
  audioEngine: AudioEngineFacade;
  onClosed: () => void;
  profileId: string;
  program: ProgramDetail;
  transport: ServiceTransport;
}

interface DetailSheetBoundaryProps {
  children: ReactNode;
  onFailure: () => void;
}

interface DetailSheetBoundaryState {
  failed: boolean;
}

export class DetailSheetBoundary extends Component<
  DetailSheetBoundaryProps,
  DetailSheetBoundaryState
> {
  state: DetailSheetBoundaryState = { failed: false };

  static getDerivedStateFromError(): DetailSheetBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onFailure();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function deterministicNoise(index: number): number {
  const value = Math.sin((index + 1) * 12.9898 + 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function timelineHeight(index: number): number {
  const cluster = 0.48 + 0.22 * Math.sin(index * 0.17 + 0.7) + 0.14 * Math.sin(index * 0.047 + 2.1);
  const texture =
    0.18 + 0.58 * deterministicNoise(index) + 0.24 * deterministicNoise(index * 2 + 11);
  const accent = deterministicNoise(index + 37) > 0.86 ? 0.22 : 0;
  const activity = Math.min(1, Math.max(0.08, cluster * texture + accent));
  return Math.round(8 + activity * 84);
}

function contextTrack(program: ProgramDetail, audio: AudioEngineSnapshot): MusicTrack | undefined {
  const tracks = new Map(program.tracks.map((track) => [track.id, track]));
  if (audio.currentItem?.kind === "track") return tracks.get(audio.currentItem.trackId);
  for (let index = audio.currentIndex + 1; index < program.timeline.length; index += 1) {
    const item = program.timeline[index];
    if (item?.kind === "track") return tracks.get(item.trackId);
  }
  for (let index = audio.currentIndex - 1; index >= 0; index -= 1) {
    const item = program.timeline[index];
    if (item?.kind === "track") return tracks.get(item.trackId);
  }
  return program.tracks[0];
}

function currentScript(
  program: ProgramDetail,
  audio: AudioEngineSnapshot,
): DjScriptSegment | undefined {
  if (audio.voiceSegmentId !== undefined) {
    return program.djScripts.find((script) => script.id === audio.voiceSegmentId);
  }
  const item = audio.currentItem;
  if (item?.kind !== "dj") return undefined;
  return program.djScripts.find((script) => script.id === item.segmentId);
}

function statusLabel(audio: AudioEngineSnapshot, speaking: boolean): string {
  if (audio.state === "paused" || audio.state === "ready") return "PAUSED";
  if (audio.state === "buffering") return "BUFFERING";
  if (audio.state === "completed") return "SESSION COMPLETE";
  if (audio.state === "failed") return "PLAYBACK ERROR";
  return speaking ? "SPEAKING NOW" : "PLAYING";
}

function waveformCurvePath(values: number[]): { area: string; curve: string } {
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 100;
    const y = 96 - Math.min(1, Math.max(0, value)) * 84;
    return { x, y };
  });
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return { area: "", curve: "" };
  let curve = `M ${String(first.x)} ${String(first.y)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous === undefined || point === undefined) continue;
    const midpointX = (previous.x + point.x) / 2;
    const midpointY = (previous.y + point.y) / 2;
    curve += ` Q ${String(previous.x)} ${String(previous.y)} ${String(midpointX)} ${String(midpointY)}`;
  }
  curve += ` T ${String(last.x)} ${String(last.y)}`;
  return { area: `${curve} L 100 100 L 0 100 Z`, curve };
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>("[data-detail-focus]:not(:disabled)"));
}

function TimedLines({
  lines,
  positionMs,
  scrollContainerRef,
  speaking,
}: {
  lines: DisplayTimedTextLine[];
  positionMs: number;
  scrollContainerRef: RefObject<HTMLElement | null>;
  speaking: boolean;
}) {
  const currentRef = useRef<HTMLElement>(null);
  const currentIndex = lines.findIndex((line) => line.state === "current");
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const current = currentRef.current;
    if (container === null || current === null) return;
    const targetTop = current.offsetTop - (container.clientHeight - current.offsetHeight) / 2;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(maxTop, Math.max(0, targetTop));
  }, [currentIndex, scrollContainerRef]);
  return lines.map((line) => {
    const setCurrent = (element: HTMLElement | null): void => {
      if (line.state === "current") currentRef.current = element;
    };
    return speaking ? (
      <div
        aria-current={line.state === "current" ? "true" : undefined}
        className={`detail-copy__line detail-copy__line--${line.state}`}
        key={`${String(line.startMs)}-${line.text}`}
        ref={setCurrent}
      >
        <small>KORADIO · {formatClockDuration(line.startMs)}</small>
        <p>{line.text}</p>
      </div>
    ) : (
      <p
        aria-current={line.state === "current" ? "true" : undefined}
        className={`detail-copy__line detail-copy__line--${line.state}`}
        key={`${String(line.startMs)}-${line.text}`}
        ref={setCurrent}
      >
        {line.units === undefined
          ? line.text
          : deriveTimedTextUnits(line, positionMs).map((unit) => (
              <span
                className={`detail-copy__unit detail-copy__unit--${unit.state}`}
                key={`${String(unit.startMs)}-${unit.text}`}
                style={
                  { "--detail-unit-progress": `${String(unit.progress * 100)}%` } as CSSProperties
                }
              >
                {unit.text}
              </span>
            ))}
      </p>
    );
  });
}

function PlaybackIcon({ paused }: { paused: boolean }): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paused ? <path d="m8 5 11 7-11 7Z" /> : <path d="M8 5v14m8-14v14" />}
    </svg>
  );
}

export function DetailSheet({
  audio,
  audioEngine,
  onClosed,
  profileId,
  program,
  transport,
}: DetailSheetProps): ReactElement {
  const [closing, setClosing] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const dragOffsetRef = useRef(0);
  const dragStart = useRef<number | undefined>(undefined);
  const track = contextTrack(program, audio);
  const script = currentScript(program, audio);
  const speaking = (audio.voiceActive || audio.currentItem?.kind === "dj") && script !== undefined;
  const scriptDurationMs = audio.voiceActive
    ? (audio.voiceDurationMs ?? audio.durationMs)
    : audio.durationMs;
  const scriptPositionMs = audio.voiceActive ? (audio.voicePositionMs ?? 0) : audio.positionMs;
  const lyrics = useQuery({
    queryKey: ["track-lyrics", profileId, track?.id],
    queryFn: () => {
      if (track === undefined) throw new Error("Track lyrics requested without a track");
      return getTrackLyrics(transport, profileId, track.id);
    },
    enabled: !speaking && track !== undefined && track.lyricStatus !== "unavailable",
    retry: false,
  });
  const timedLines = useMemo(() => {
    if (speaking) {
      return deriveTimedText(
        estimateDjTiming(script.text, Math.max(1, scriptDurationMs)),
        scriptPositionMs,
      );
    }
    if (lyrics.data === undefined || lyrics.data.status === "unavailable") return [];
    if (lyrics.data.status !== "available") return [];
    const lines = parseTimedLyrics(lyrics.data.content, audio.durationMs);
    return deriveTimedText(lines, audio.positionMs);
  }, [audio.durationMs, lyrics.data, script, scriptDurationMs, scriptPositionMs, speaking]);
  const untimedLyrics = useMemo(
    () =>
      !speaking && lyrics.data?.status === "untimed" ? parseUntimedLyrics(lyrics.data.content) : [],
    [lyrics.data, speaking],
  );
  const totalProgress = programProgress(program.timeline, audio.currentIndex, audio.positionMs);
  const trackProgress =
    audio.durationMs === 0 ? 0 : Math.min(1, Math.max(0, audio.positionMs / audio.durationMs));
  const playing = audio.state === "playing" || audio.state === "buffering";
  const waveformPath = useMemo(
    () => (audio.waveform === undefined ? undefined : waveformCurvePath(audio.waveform)),
    [audio.waveform],
  );
  const style = {
    "--detail-drag-offset": `${String(dragOffset)}px`,
    "--detail-track-progress": `${String(trackProgress * 100)}%`,
  } as CSSProperties;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.queueMicrotask(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previous;
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function requestClose(): void {
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = window.setTimeout(onClosed, reducedMotion ? 0 : 440);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab" || dialogRef.current === null) return;
    const focusable = focusableElements(dialogRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function beginDrag(event: PointerEvent<HTMLDivElement>): void {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>): void {
    if (dragStart.current === undefined) return;
    const nextOffset = Math.max(0, event.clientY - dragStart.current);
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    if (dragStart.current === undefined) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStart.current = undefined;
    if (dragOffsetRef.current >= 80) requestClose();
    else {
      dragOffsetRef.current = 0;
      setDragOffset(0);
    }
  }

  return (
    <div
      className={`radio-detail-layer${closing ? " radio-detail-layer--closing" : " radio-detail-layer--entering"}`}
      style={style}
    >
      <div
        aria-labelledby="radio-detail-title"
        aria-modal="true"
        className={`radio-detail-sheet${playing ? "" : " radio-detail-sheet--paused"}`}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div
          aria-hidden="true"
          className="detail-drag-handle"
          onPointerCancel={() => {
            dragStart.current = undefined;
            dragOffsetRef.current = 0;
            setDragOffset(0);
          }}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        />
        <button
          aria-label="关闭节目详情，播放继续"
          className="detail-close"
          data-detail-focus
          onClick={requestClose}
          ref={closeRef}
          type="button"
        >
          <span aria-hidden="true" className="detail-close__visual">
            <svg viewBox="0 0 24 24">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </span>
        </button>
        <p aria-live="polite" className="detail-status">
          <span aria-hidden="true" /> {statusLabel(audio, speaking)}
        </p>
        <div className="detail-waveform" aria-label="实时音频波形">
          {waveformPath === undefined ? (
            <p>WAVEFORM UNAVAILABLE</p>
          ) : (
            <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
              <path className="detail-waveform__area" d={waveformPath.area} />
              <path className="detail-waveform__curve" d={waveformPath.curve} />
            </svg>
          )}
        </div>
        <section className="detail-paper">
          <h1 id="radio-detail-title">{program.program.title}</h1>
          <p className="detail-track">
            {track === undefined ? "Koradio live session" : `${track.title} · ${track.artist}`}
          </p>
          <div
            aria-label={`当前段进度 ${formatClockDuration(audio.positionMs)} / ${formatClockDuration(audio.durationMs)}`}
            aria-valuemax={Math.max(1, audio.durationMs)}
            aria-valuemin={0}
            aria-valuenow={audio.positionMs}
            className="detail-track-progress"
            role="progressbar"
          >
            <span>{formatClockDuration(audio.positionMs)}</span>
            <i />
            <span>{formatClockDuration(audio.durationMs)}</span>
          </div>
          <article
            aria-label={speaking ? "DJ 串讲词" : "跟随歌词"}
            className={`detail-copy detail-copy--${speaking ? "speaking" : "lyrics"}`}
          >
            <div className="detail-copy__scroller" data-detail-focus ref={copyRef} tabIndex={0}>
              {speaking ? (
                timedLines.length === 0 ? (
                  <p className="detail-copy__fallback">文字串讲暂时不可用，歌曲播放不受影响</p>
                ) : (
                  <TimedLines
                    lines={timedLines}
                    positionMs={scriptPositionMs}
                    scrollContainerRef={copyRef}
                    speaking
                  />
                )
              ) : track?.lyricStatus === "unavailable" || lyrics.data?.status === "unavailable" ? (
                <p className="detail-copy__fallback">暂无歌词，正在播放 DJ 推荐曲目</p>
              ) : lyrics.isError ? (
                <div className="detail-copy__fallback" role="status">
                  <p>歌词加载失败，播放不受影响</p>
                  <button type="button" onClick={() => void lyrics.refetch()}>
                    重试歌词
                  </button>
                </div>
              ) : lyrics.isPending ? (
                <p className="detail-copy__fallback" role="status">
                  LOADING LYRICS...
                </p>
              ) : timedLines.length > 0 ? (
                <TimedLines
                  lines={timedLines}
                  positionMs={audio.positionMs}
                  scrollContainerRef={copyRef}
                  speaking={false}
                />
              ) : untimedLyrics.length > 0 ? (
                <>
                  <p className="detail-copy__notice">STATIC LYRICS · NO TIMECODES</p>
                  {untimedLyrics.map((line, index) => (
                    <p
                      className="detail-copy__line detail-copy__line--static"
                      key={`${String(index)}-${line}`}
                    >
                      {line}
                    </p>
                  ))}
                </>
              ) : (
                <p className="detail-copy__fallback">暂无歌词，正在播放 DJ 推荐曲目</p>
              )}
            </div>
          </article>
          <div className="detail-bottom-control">
            <div
              aria-label={`节目整体进度 ${String(Math.round(totalProgress * 100))}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(totalProgress * 100)}
              className="detail-program-progress"
              role="progressbar"
            >
              {Array.from({ length: timelineBars }, (_, index) => (
                <span
                  className={index < Math.round(timelineBars * totalProgress) ? "is-played" : ""}
                  key={index}
                  style={
                    {
                      "--detail-timeline-height": `${String(timelineHeight(index))}%`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <button
              aria-label={audio.ownership === "active" ? (playing ? "暂停" : "播放") : "接管并播放"}
              className="detail-play"
              data-detail-focus
              onClick={() =>
                void (audio.ownership === "active" && playing
                  ? audioEngine.pause()
                  : audioEngine.play())
              }
              type="button"
            >
              <PlaybackIcon paused={!playing} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
