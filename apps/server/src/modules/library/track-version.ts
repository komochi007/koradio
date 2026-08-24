import type { MusicTrack } from "@koradio/contracts";

const nonCanonicalVersionMarker =
  /(?:\b(?:live|karaoke|cover|remix|unplugged|sped\s*up|speed\s*up|nightcore|slowed(?:\s*(?:\+|and|&)\s*reverb)?|reverb|dj\s*(?:version|edit|mix)|piano\s*version|fingerstyle|instrumental|inst)\b|现场|演唱会|伴奏|翻唱|翻自|混音|加速|倍速|变速|降速|减速|慢速|慢放|夜核|钢琴版|吉他版|演奏版|纯音乐|器乐)/iu;
const instrumentalMarker =
  /(?:\b(?:instrumental|piano\s*(?:version|solo|sonata)|fingerstyle|karaoke|inst|orchestral|symphony|concerto|original\s*score|type\s*beat|beat\s*maker)\b|纯音乐|器乐|演奏版|钢琴版|吉他版|伴奏|奏鸣曲|交响曲|协奏曲|配乐)/iu;

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

export function hasInstrumentalMarker(value: string): boolean {
  return instrumentalMarker.test(value);
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

export function matchesRequestedTrackQuery(
  track: Pick<MusicTrack, "artist" | "title">,
  query: string,
): boolean {
  const normalizedQuery = normalizeForMatch(query);
  const title = normalizeForMatch(track.title);
  const artist = normalizeForMatch(primaryArtist(track.artist));
  return (
    title.length > 0 &&
    artist.length > 0 &&
    normalizedQuery.includes(title) &&
    normalizedQuery.includes(artist)
  );
}

export function matchesTrackRequest(
  track: Pick<MusicTrack, "artist" | "title">,
  title: string,
  artist?: string | null,
): boolean {
  const requestedTitle = normalizeForMatch(title);
  const candidateTitle = normalizeForMatch(track.title);
  const titleMatches =
    candidateTitle === requestedTitle ||
    (requestedTitle.length >= 2 && candidateTitle.startsWith(requestedTitle));
  if (!titleMatches) return false;
  if (artist === null || artist === undefined || artist.trim().length === 0) return true;
  return (
    normalizeForMatch(primaryArtist(track.artist)) === normalizeForMatch(primaryArtist(artist))
  );
}

export function sortCanonicalCandidates<T extends Pick<MusicTrack, "album" | "artist" | "title">>(
  tracks: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeForMatch(query);
  const score = (track: T): number => {
    const title = normalizeForMatch(track.title);
    let value = 0;
    if (normalizedQuery === title) value -= 100;
    else if (title.length > 0 && normalizedQuery.includes(title)) value -= 50;
    if (isNonCanonicalVersion(track)) value += 1000;
    return value;
  };
  return [...tracks].sort((left, right) => score(left) - score(right));
}
