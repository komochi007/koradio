import type { PlaybackTimelineItem } from "@koradio/contracts";

export type TimedTextState = "read" | "current" | "upcoming";

export interface TimedTextUnit {
  endMs: number;
  startMs: number;
  text: string;
}

export interface TimedTextLine {
  endMs: number;
  startMs: number;
  text: string;
  units?: TimedTextUnit[];
}

export interface DisplayTimedTextLine extends TimedTextLine {
  state: TimedTextState;
}

export interface DisplayTimedTextUnit {
  endMs: number;
  progress: number;
  startMs: number;
  state: TimedTextState | "played";
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
    const previous = units.at(-1);
    if (/\p{Script=Han}/u.test(character)) units.push({ text: `${prefix}${character}`, weight: 1 });
    else if (previous === undefined) prefix += character;
    else previous.text += character;
    if (/\p{Script=Han}/u.test(character)) prefix = "";
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
  if (line.units !== undefined) {
    return line.units.map((unit) => {
      const state =
        line.state === "current"
          ? positionMs >= unit.endMs
            ? "played"
            : positionMs >= unit.startMs
              ? "current"
              : "upcoming"
          : line.state;
      return {
        ...unit,
        state,
        progress:
          state === "played" || state === "read"
            ? 1
            : state === "current"
              ? clamp((positionMs - unit.startMs) / Math.max(1, unit.endMs - unit.startMs), 0, 1)
              : 0,
      };
    });
  }
  const units = splitTextUnits(line.text);
  const durationMs = Math.max(1, line.endMs - line.startMs);
  const totalWeight = units.reduce((total, unit) => total + unit.weight, 0);
  let elapsed = line.startMs;
  return units.map((unit, index) => {
    const startMs = elapsed;
    elapsed =
      index === units.length - 1
        ? line.endMs
        : Math.round(elapsed + (durationMs * unit.weight) / totalWeight);
    const endMs = Math.max(startMs + 1, elapsed);
    const state =
      line.state === "current"
        ? positionMs >= endMs
          ? "played"
          : positionMs >= startMs
            ? "current"
            : "upcoming"
        : line.state;
    return {
      endMs,
      startMs,
      text: unit.text,
      state,
      progress:
        state === "played" || state === "read"
          ? 1
          : state === "current"
            ? clamp((positionMs - startMs) / Math.max(1, endMs - startMs), 0, 1)
            : 0,
    };
  });
}

function parseYrc(value: string, durationMs: number): TimedTextLine[] {
  const parsed = value
    .split(/\r?\n/u)
    .flatMap((line) => {
      const matchedLine = /^\[(\d+),(\d+)\](.*)$/u.exec(line.trim());
      if (matchedLine === null) return [];
      const startMs = Number(matchedLine[1]);
      const lineDurationMs = Number(matchedLine[2]);
      if (
        !Number.isSafeInteger(startMs) ||
        !Number.isSafeInteger(lineDurationMs) ||
        lineDurationMs <= 0
      )
        return [];
      const units = Array.from(matchedLine[3]?.matchAll(/\((\d+),(\d+),\d+\)([^()]*)/gu) ?? [])
        .map((match) => {
          const unitStartMs = Number(match[1]);
          const unitDurationMs = Number(match[2]);
          const text = match[3] ?? "";
          if (
            !Number.isSafeInteger(unitStartMs) ||
            !Number.isSafeInteger(unitDurationMs) ||
            unitDurationMs <= 0 ||
            text.trim().length === 0
          ) {
            return undefined;
          }
          return { endMs: unitStartMs + unitDurationMs, startMs: unitStartMs, text };
        })
        .filter((unit): unit is TimedTextUnit => unit !== undefined);
      const text = units.map((unit) => unit.text).join("");
      if (text.length === 0 || isLyricMetadata(line, text)) return [];
      return [
        {
          endMs: Math.min(durationMs, startMs + lineDurationMs),
          startMs,
          text,
          units,
        },
      ];
    })
    .sort((left, right) => left.startMs - right.startMs);
  return parsed.filter((line) => line.endMs > line.startMs);
}

export function splitDjSentences(value: string): string[] {
  const chunks = value.match(/[^。！？!?；;.\n]+[。！？!?；;.]?/gu) ?? [];
  return chunks.flatMap((chunk) => {
    const sentence = chunk.trim();
    if (sentence.length === 0) return [];
    const natural = sentence.split(/(?<=[，、：,;:])\s*/u).filter(Boolean);
    return natural.flatMap(splitDjLine);
  });
}

function displayWidth(value: string): number {
  return Array.from(value).reduce((width, character) => {
    if (/\s/u.test(character)) return width + 0.25;
    if (/\p{Script=Han}/u.test(character)) return width + 1;
    if (/[\p{L}\p{N}]/u.test(character)) return width + 0.55;
    return width + 0.45;
  }, 0);
}

function splitDjLine(value: string): string[] {
  const tokens =
    value.trim().match(/[\p{Script=Han}]|[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*\s*|[^\s]\s*/gu) ??
    [];
  const lines: string[] = [];
  const characters = Array.from(value);
  const cjkCount = characters.filter((character) => /\p{Script=Han}/u.test(character)).length;
  const latinCount = characters.filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
  const maximumWidth = cjkCount >= latinCount ? 24 : 18;
  let line = "";
  for (const token of tokens) {
    const isTrailingPunctuation = /^[，。！？!?；;、,:：）］】》」』〉>]+\s*$/u.test(token);
    if (isTrailingPunctuation) {
      line += token;
      continue;
    }
    const next = `${line}${token}`;
    if (line.trim().length > 0 && displayWidth(next) > maximumWidth) {
      lines.push(line.trim());
      line = token;
      continue;
    }
    line = next;
  }
  if (line.trim().length > 0) lines.push(line.trim());
  return lines;
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

function isLyricMetadata(originalLine: string, text: string): boolean {
  if (/^\[(?:ar|al|ti|by|offset|re|ve|length):/iu.test(originalLine.trim())) return true;
  return /^(?:作词|作曲|编曲|制作人|词曲|lyricist|composer|arranger|producer)\s*[:：]/iu.test(text);
}

export function parseLrc(value: string, durationMs: number): TimedTextLine[] {
  const parsed = value
    .split(/\r?\n/u)
    .flatMap((line) => {
      const text = line.replace(/(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+/gu, "").trim();
      if (text.length === 0 || isLyricMetadata(line, text)) return [];
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

export function parseTimedLyrics(value: string, durationMs: number): TimedTextLine[] {
  const wordTimed = parseYrc(value, durationMs);
  return wordTimed.length > 0 ? wordTimed : parseLrc(value, durationMs);
}

export function parseUntimedLyrics(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => ({ original: line, text: line.replace(/^\[[^\]]+\]\s*/u, "").trim() }))
    .filter(({ original, text }) => text.length > 0 && !isLyricMetadata(original, text))
    .map(({ text }) => text);
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
