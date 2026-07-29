import type { PlaybackTimelineItem, TimedTextLine, TimedTextToken } from "@koradio/contracts";

export type TimedTextState = "read" | "current" | "upcoming";

export interface DisplayTimedTextToken extends TimedTextToken {
  state: TimedTextState;
}

export interface DisplayTimedTextLine extends TimedTextLine {
  state: TimedTextState;
  tokens: DisplayTimedTextToken[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function readableLength(value: string): number {
  return Math.max(1, Array.from(value.replace(/\s/gu, "")).length);
}

export function tokenizeTimedText(value: string): string[] {
  const units =
    value.match(
      /\s*(?:[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s])/gu,
    ) ?? [];
  const tokens: string[] = [];
  for (const unit of units) {
    const visible = unit.trimStart();
    if (/^[\p{P}\p{S}]+$/u.test(visible) && tokens.length > 0) {
      const previousIndex = tokens.length - 1;
      tokens[previousIndex] = `${tokens[previousIndex] ?? ""}${unit}`;
    } else {
      tokens.push(unit);
    }
  }
  return tokens.filter((token) => token.trim().length > 0);
}

export function estimateTokenTiming(
  text: string,
  startMs: number,
  endMs: number,
): TimedTextToken[] {
  const tokens = tokenizeTimedText(text);
  if (tokens.length === 0) return [];
  const safeEnd = Math.max(startMs + 1, endMs);
  const durationMs = safeEnd - startMs;
  const totalWeight = tokens.reduce((total, token) => total + readableLength(token), 0);
  let elapsed = startMs;
  return tokens.map((token, index) => {
    const tokenStart = elapsed;
    elapsed =
      index === tokens.length - 1
        ? safeEnd
        : Math.round(elapsed + (durationMs * readableLength(token)) / totalWeight);
    return {
      text: token,
      startMs: tokenStart,
      endMs: Math.max(tokenStart + 1, elapsed),
    };
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
    return {
      endMs: elapsed,
      startMs,
      text,
      tokens: estimateTokenTiming(text, startMs, elapsed),
    };
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
  return parsed.map((line, index) => {
    const endMs = Math.max(line.startMs + 1, parsed[index + 1]?.startMs ?? durationMs);
    return {
      ...line,
      endMs,
      tokens: estimateTokenTiming(line.text, line.startMs, endMs),
    };
  });
}

export function parseUntimedLyrics(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\[[^\]]+\]\s*/u, "").trim())
    .filter((line) => line.length > 0);
}

export function estimateUntimedLyrics(value: string, durationMs: number): TimedTextLine[] {
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
    return {
      text,
      startMs,
      endMs: Math.max(startMs + 1, elapsed),
      tokens: estimateTokenTiming(text, startMs, Math.max(startMs + 1, elapsed)),
    };
  });
}

export function timedLinesFromMarkers(
  text: string,
  markers: TimedTextToken[],
  durationMs: number,
): TimedTextLine[] {
  if (markers.length === 0) return estimateDjTiming(text, durationMs);
  const lines: TimedTextLine[] = [];
  let current: TimedTextToken[] = [];
  const flush = (): void => {
    const first = current[0];
    const last = current.at(-1);
    if (first === undefined || last === undefined) return;
    lines.push({
      text: current.map((marker) => marker.text).join(""),
      startMs: first.startMs,
      endMs: last.endMs,
      tokens: current,
    });
    current = [];
  };
  for (const marker of markers) {
    current.push(marker);
    if (/[。！？!?；;]\s*$/u.test(marker.text)) flush();
  }
  flush();
  return lines;
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
    currentIndex = safePosition < (lines[0]?.startMs ?? 0) ? 0 : lines.length - 1;
  }
  return lines.map((line, index) => {
    const state = index < currentIndex ? "read" : index === currentIndex ? "current" : "upcoming";
    let currentTokenIndex = line.tokens.findIndex(
      (token) => safePosition >= token.startMs && safePosition < token.endMs,
    );
    if (currentTokenIndex < 0) {
      currentTokenIndex =
        safePosition < (line.tokens[0]?.startMs ?? line.startMs)
          ? 0
          : Math.max(0, line.tokens.length - 1);
    }
    return {
      ...line,
      state,
      tokens: line.tokens.map((token, tokenIndex) => ({
        ...token,
        state:
          state === "read"
            ? "read"
            : state === "upcoming"
              ? "upcoming"
              : tokenIndex < currentTokenIndex
                ? "read"
                : tokenIndex === currentTokenIndex
                  ? "current"
                  : "upcoming",
      })),
    };
  });
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
