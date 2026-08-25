import type {
  MusicTrack,
  ProgramLanguageScope,
  ProgramListeningIntent,
  ProgramRegionScope,
  ProgramVocalMode,
  TrackLyrics,
} from "@koradio/contracts";

import {
  hasDisallowedInstrumentalVersionMarker,
  hasInstrumentalMarker,
} from "../library/track-version.js";
import { normalizeProgramListeningIntent } from "./listening-intent.js";

export type TrackLyricLanguage =
  "chinese" | "english" | "japanese" | "korean" | "western-languages" | "unknown";

export type TrackEligibilityReason =
  "playable" | "instrumental" | "language" | "region" | "lyrics" | "era" | "artist";

interface LyricLine {
  text: string;
  timed: boolean;
}

const lyricTimestampPrefix = /^(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+\s*/u;
const lyricCreditMarker =
  /^(?:作词|作曲|编曲|制作人|演奏|演唱|录音|混音|母带|监制|出品|词|曲|lyrics?|composer|arranged?|produced?|vocals?|bpm|key|音名|调号|调式|beat\s*(?:说明|maker)|风格)\s*[:：]/iu;
const instrumentalLyricMarker =
  /(?:纯音乐\s*[，,。.]?\s*请欣赏|instrumental(?:\s+music)?\s*[，,。.]?\s*please\s+enjoy|type\s*beat|beat\s*maker)/iu;

function substantiveLyricLines(lyrics: TrackLyrics): LyricLine[] {
  const raw = lyrics.originalContent ?? lyrics.content ?? "";
  return raw.split(/\r?\n/u).flatMap((rawLine) => {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || /^\s*\{.*\}\s*$/u.test(trimmed)) return [];
    const timed = lyricTimestampPrefix.test(trimmed);
    const text = trimmed.replace(lyricTimestampPrefix, "").trim();
    if (text.length < 4 || lyricCreditMarker.test(text) || instrumentalLyricMarker.test(text)) {
      return [];
    }
    return [{ text, timed }];
  });
}

function normalizedLyricText(lyrics: TrackLyrics): string {
  return substantiveLyricLines(lyrics)
    .map((line) => line.text)
    .join("")
    .replace(/[\s\p{P}\p{S}\d]/gu, "");
}

function hasSubstantiveLyrics(track: MusicTrack, lyrics: TrackLyrics): boolean {
  const lines = substantiveLyricLines(lyrics);
  const timedLineCount = lines.filter((line) => line.timed).length;
  const requiredLineCount =
    timedLineCount === 0 ? 3 : Math.max(4, Math.ceil(track.durationMs / 18_000));
  return (
    lines.length >= requiredLineCount &&
    Array.from(lines.map((line) => line.text).join("")).length >= requiredLineCount * 6
  );
}

function hasEastAsianScript(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

export function classifyTrackLyrics(lyrics: TrackLyrics): TrackLyricLanguage {
  if (lyrics.content === null) return "unknown";
  const normalized = normalizedLyricText(lyrics);
  if (Array.from(normalized).length < 8) return "unknown";
  const characters = Array.from(normalized);
  const han = normalized.match(/\p{Script=Han}/gu)?.length ?? 0;
  const kana = normalized.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  const hangul = normalized.match(/\p{Script=Hangul}/gu)?.length ?? 0;
  const latin = normalized.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/gu)?.length ?? 0;
  if (hangul / characters.length >= 0.18) return "korean";
  if (kana / characters.length >= 0.12) return "japanese";
  if (han / characters.length >= 0.45 && kana / characters.length < 0.05) return "chinese";
  if (latin / characters.length >= 0.55) return "western-languages";
  return "unknown";
}

function intentScopes(intent: ProgramListeningIntent | null | undefined, scenarioText: string) {
  const normalized = normalizeProgramListeningIntent(scenarioText, intent);
  return {
    languageScope: normalized.languageScope,
    regionScope: normalized.regionScope,
    vocalMode: normalized.vocalMode,
  } satisfies {
    languageScope: ProgramLanguageScope;
    regionScope: ProgramRegionScope;
    vocalMode: ProgramVocalMode;
  };
}

export function isPotentiallyEligibleTrack(
  track: MusicTrack,
  intent: ProgramListeningIntent | null | undefined,
  scenarioText: string,
): boolean {
  if (!track.playable) return false;
  const normalized = normalizeProgramListeningIntent(scenarioText, intent);
  const { languageScope, regionScope, vocalMode } = intentScopes(intent, scenarioText);
  const trackText = `${track.title}\n${track.artist}\n${track.album}`;
  if (
    normalized.excludedArtists.some((artist) =>
      track.artist.toLocaleLowerCase("en-US").includes(artist.toLocaleLowerCase("en-US")),
    )
  )
    return false;
  if (
    normalized.releaseYearRange !== null &&
    (track.releaseYear === null ||
      track.releaseYear === undefined ||
      track.releaseYear < normalized.releaseYearRange.from ||
      track.releaseYear > normalized.releaseYearRange.to)
  )
    return false;
  if (vocalMode === "vocal-only" && hasInstrumentalMarker(trackText)) return false;
  if (vocalMode === "instrumental-only" && hasDisallowedInstrumentalVersionMarker(trackText)) {
    return false;
  }
  if (
    regionScope === "western" &&
    (hasEastAsianScript(trackText) ||
      /korean|japanese|chinese|china|japan|korea|韩|日系|日本|韩国|中文/iu.test(trackText))
  ) {
    return false;
  }
  if (
    languageScope === "english" &&
    (hasEastAsianScript(trackText) || /中文|韩语|日语|korean|japanese/iu.test(trackText))
  ) {
    return false;
  }
  if (languageScope === "japanese" && /\p{Script=Hangul}/u.test(trackText)) return false;
  if (
    languageScope === "korean" &&
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(trackText)
  ) {
    return false;
  }
  if (
    languageScope === "chinese" &&
    /[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(trackText)
  ) {
    return false;
  }
  return true;
}

export function trackEligibilityFailureReason(
  track: MusicTrack,
  intent: ProgramListeningIntent | null | undefined,
  scenarioText: string,
  lyrics?: TrackLyrics,
): TrackEligibilityReason | null {
  if (!track.playable) return "playable";
  const normalized = normalizeProgramListeningIntent(scenarioText, intent);
  const { languageScope, regionScope, vocalMode } = intentScopes(intent, scenarioText);
  const trackText = `${track.title}\n${track.artist}\n${track.album}`;
  if (
    normalized.excludedArtists.some((artist) =>
      track.artist.toLocaleLowerCase("en-US").includes(artist.toLocaleLowerCase("en-US")),
    )
  )
    return "artist";
  if (
    normalized.releaseYearRange !== null &&
    (track.releaseYear === null ||
      track.releaseYear === undefined ||
      track.releaseYear < normalized.releaseYearRange.from ||
      track.releaseYear > normalized.releaseYearRange.to)
  )
    return "era";
  if (vocalMode === "vocal-only" && hasInstrumentalMarker(trackText)) return "instrumental";
  if (vocalMode === "instrumental-only" && hasDisallowedInstrumentalVersionMarker(trackText)) {
    return "instrumental";
  }
  if (
    regionScope === "western" &&
    (hasEastAsianScript(trackText) ||
      /korean|japanese|chinese|china|japan|korea|韩|日系|日本|韩国|中文/iu.test(trackText))
  ) {
    return "region";
  }
  if (vocalMode === "instrumental-only") {
    return lyrics !== undefined && lyrics.content !== null && hasSubstantiveLyrics(track, lyrics)
      ? "instrumental"
      : null;
  }
  if (vocalMode === "vocal-only" || languageScope !== "any" || regionScope !== "any") {
    if (lyrics === undefined || lyrics.content === null) return "lyrics";
    if (vocalMode === "vocal-only" && !hasSubstantiveLyrics(track, lyrics)) return "lyrics";
    const lyricLanguage = classifyTrackLyrics(lyrics);
    if (vocalMode === "vocal-only" && lyricLanguage === "unknown") return "lyrics";
    if (regionScope === "western" && lyricLanguage !== "western-languages") return "region";
    if (
      languageScope !== "any" &&
      languageScope !== lyricLanguage &&
      !(languageScope === "western-languages" && lyricLanguage === "western-languages")
    ) {
      return "language";
    }
  }
  return null;
}

export function isHighConfidenceInstrumentalTrack(track: MusicTrack): boolean {
  const trackText = `${track.title}\n${track.artist}\n${track.album}`;
  return hasInstrumentalMarker(trackText) && !hasDisallowedInstrumentalVersionMarker(trackText);
}

export function isTrackEligible(
  track: MusicTrack,
  intent: ProgramListeningIntent | null | undefined,
  scenarioText: string,
  lyrics?: TrackLyrics,
): boolean {
  return trackEligibilityFailureReason(track, intent, scenarioText, lyrics) === null;
}
