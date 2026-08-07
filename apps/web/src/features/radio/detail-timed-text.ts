import type { PlaybackTimelineItem } from "@koradio/contracts";

export type TimedTextState = "read" | "current" | "upcoming";
export type TimedTextUnitState = TimedTextState | "played";

export interface TimedTextLine {
  endMs: number;
  startMs: number;
  text: string;
}

export interface DisplayTimedTextLine extends TimedTextLine {
  state: TimedTextState;
}

export interface DisplayTimedTextUnit {
  endMs: number;
  progress: number;
  startMs: number;
  state: TimedTextUnitState;
  text: string;
}

interface TextUnit {
  text: string;
  weight: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function readableLength(value: string): number {
  return Math.max(1, Array.from(value.replace(/\s/gu, "")).length);
}

function splitTextUnits(value: string): TextUnit[] {
  const units: TextUnit[] = [];
  let latin = "";
  let prefix = "";
  const flushLatin = (): void => {
    if (latin.length === 0) return;
    units.push({ text: `${prefix}${latin}`, weight: Array.from(latin).length });
    latin = "";
    prefix = "";
  };
  for (const character of Array.from(value)) {
    if (/[\p{L}\p{N}'’_-]/u.test(character) && !/\p{Script=Han}/u.test(character)) {
      latin += character;
      continue;
    }
    flushLatin();
    if (/\p{Script=Han}/u.test(character)) {
      units.push({ text: `${prefix}${character}`, weight: 1 });
      prefix = "";
    } else if (/^[\s\p{P}\p{S}]$/u.test(character)) {
      const previous = units.at(-1);
      if (previous === undefined) prefix += character;
      else previous.text += character;
    } else {
      units.push({ text: `${prefix}${character}`, weight: 1 });
      prefix = "";
    }
  }
  flushLatin();
  if (prefix.length > 0) {
    const previous = units.at(-1);
    if (previous === undefined) units.push({ text: prefix, weight: 1 });
    else previous.text += prefix;
  }
  return units;
}

export function splitHighlightUnits(value: string): string[] {
  return splitTextUnits(value).map((unit) => unit.text);
}

export function deriveTimedTextUnits(
  line: DisplayTimedTextLine,
  positionMs: number,
): DisplayTimedTextUnit[] {
  const units = splitTextUnits(line.text);
  if (units.length === 0) return [];
  const durationMs = Math.max(1, line.endMs - line.startMs);
  const totalWeight = units.reduce((total, unit) => total + unit.weight, 0);
  let elapsed = line.startMs;
  const timed = units.map((unit, index) => {
    const startMs = elapsed;
    elapsed =
      index === units.length - 1
        ? line.endMs
        : Math.round(elapsed + (durationMs * unit.weight) / totalWeight);
    return { endMs: Math.max(startMs + 1, elapsed), startMs, text: unit.text };
  });
  if (line.state !== "current") {
    return timed.map((unit) => ({
      ...unit,
      progress: line.state === "read" ? 1 : 0,
      state: line.state,
    }));
  }
  const safePosition = Math.max(line.startMs, Math.min(positionMs, line.endMs));
  let currentIndex = timed.findIndex(
    (unit) => safePosition >= unit.startMs && safePosition < unit.endMs,
  );
  if (currentIndex < 0) currentIndex = timed.length - 1;
  return timed.map((unit, index) => {
    const state = index < currentIndex ? "played" : index === currentIndex ? "current" : "upcoming";
    const progress =
      state === "played"
        ? 1
        : state === "current"
          ? clamp((safePosition - unit.startMs) / Math.max(1, unit.endMs - unit.startMs), 0, 1)
          : 0;
    return { ...unit, progress, state };
  });
}

export function splitDjSentences(value: string): string[] {
  return (value.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function estimateDjTiming(value: string, durationMs: number): TimedTextLine[] {
  const sentences = splitDjSentences(value);
  if (sentences.length === 0) return [];
  const safeDuration = Math.max(1, Math.round(durationMs));
  const totalWeight = sentences.reduce((total, sentence) => total + readableLength(sentence), 0);
  let elapsed = 0;
  return sentences.map((text, index) => {
    const startMs = elapsed;
    elapsed =
      index === sentences.length - 1
        ? safeDuration
        : Math.round(elapsed + (safeDuration * readableLength(text)) / totalWeight);
    return { endMs: elapsed, startMs, text };
  });
}

function parseTimestamp(minutes: string, seconds: string, fraction: string | undefined): number {
  const fractionMs = fraction === undefined ? 0 : Number(fraction.padEnd(3, "0").slice(0, 3));
  return Number(minutes) * 60_000 + Number(seconds) * 1_000 + fractionMs;
}

export function parseLrc(value: string, durationMs: number): TimedTextLine[] {
  const parsed = value
    .split(/\r?\n/u)
    .flatMap((line) => {
      const text = line.replace(/(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+/gu, "").trim();
      if (text.length === 0) return [];
      return Array.from(line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/gu)).map(
        (match) => ({
          startMs: parseTimestamp(match[1] ?? "0", match[2] ?? "0", match[3]),
          text,
        }),
      );
    })
    .sort((left, right) => left.startMs - right.startMs);
  return parsed.map((line, index) => ({
    ...line,
    endMs: Math.max(line.startMs + 1, parsed[index + 1]?.startMs ?? durationMs),
  }));
}

export function parseUntimedLyrics(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\[[^\]]+\]\s*/u, "").trim())
    .filter((line) => line.length > 0);
}

export function estimateUntimedLyricsTiming(value: string, durationMs: number): TimedTextLine[] {
  const lines = parseUntimedLyrics(value);
  if (lines.length === 0) return [];
  const safeDuration = Math.max(1, Math.round(durationMs));
  const totalWeight = lines.reduce((total, line) => total + readableLength(line), 0);
  let elapsed = 0;
  return lines.map((text, index) => {
    const startMs = elapsed;
    elapsed =
      index === lines.length - 1
        ? safeDuration
        : Math.round(elapsed + (safeDuration * readableLength(text)) / totalWeight);
    return { endMs: Math.max(startMs + 1, elapsed), startMs, text };
  });
}

export function deriveTimedText(
  lines: TimedTextLine[],
  positionMs: number,
): DisplayTimedTextLine[] {
  if (lines.length === 0) return [];
  const safePosition = Math.max(0, positionMs);
  let currentIndex = lines.findIndex(
    (line) => safePosition >= line.startMs && safePosition < line.endMs,
  );
  if (currentIndex < 0) {
    currentIndex = lines.findIndex((line) => safePosition < line.startMs);
    if (currentIndex < 0) currentIndex = lines.length;
  }
  return lines.map((line, index) => ({
    ...line,
    state: index < currentIndex ? "read" : index === currentIndex ? "current" : "upcoming",
  }));
}

export function programProgress(
  timeline: PlaybackTimelineItem[],
  currentIndex: number,
  positionMs: number,
): number {
  const totalMs = timeline.reduce((total, item) => total + item.durationMs, 0);
  if (totalMs === 0 || timeline.length === 0) return 0;
  const safeIndex = clamp(Math.round(currentIndex), 0, timeline.length - 1);
  const elapsedBefore = timeline
    .slice(0, safeIndex)
    .reduce((total, item) => total + item.durationMs, 0);
  const currentDuration = timeline[safeIndex]?.durationMs ?? 0;
  return clamp((elapsedBefore + clamp(positionMs, 0, currentDuration)) / totalMs, 0, 1);
}
