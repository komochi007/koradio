import type { MusicTrack } from "@koradio/contracts";

const nonCanonicalVersionMarker =
  /(?:\b(?:live|karaoke|cover|remix|unplugged|sped\s*up|speed\s*up|nightcore|slowed(?:\s*(?:\+|and|&)\s*reverb)?|reverb|dj\s*(?:version|edit|mix))\b|现场|演唱会|伴奏|翻唱|翻自|混音|加速|倍速|变速|降速|减速|慢速|慢放|夜核)/iu;

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function primaryArtist(value: string): string {
  return value.split(/\s*(?:,|，|、|&|\band\b|\bfeat\.?\b|\bft\.?\b)\s*/iu)[0]?.trim() ?? "";
}

export function hasNonCanonicalVersionMarker(value: string): boolean {
  return nonCanonicalVersionMarker.test(value);
}

export function isNonCanonicalVersion(
  track: Pick<MusicTrack, "album" | "artist" | "title">,
): boolean {
  return hasNonCanonicalVersionMarker(`${track.title}\n${track.artist}\n${track.album}`);
}

export function isCanonicalOriginalCandidate(
  track: Pick<MusicTrack, "album" | "artist" | "title">,
  query: string,
): boolean {
  if (isNonCanonicalVersion(track)) return false;
  const expectedArtist = normalizeForMatch(primaryArtist(track.artist));
  return expectedArtist.length > 0 && normalizeForMatch(query).includes(expectedArtist);
}
