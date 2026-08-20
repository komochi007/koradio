import {
  programListeningIntentSchema,
  type ProgramListeningIntent,
  type RadioTurn,
} from "@koradio/contracts";

const chineseLanguagePattern = /华语|中文|国语|国語|粤语|廣東歌|普通话|闽南|台语/u;
const englishLanguagePattern = /英语|英文|english|英伦|美式英语/iu;
const japaneseLanguagePattern = /日语|日文|日本語|j-?pop|日系/iu;
const koreanLanguagePattern = /韩语|韩文|한국어|korean|k-?pop/iu;
const westernRegionPattern = /欧美|英美|西洋|western|american|british|欧陆|欧美流行/iu;
const vocalOnlyPattern =
  /(?:不要|别|不含|排除|避免|不想听|拒绝).{0,12}(?:纯音乐|器乐|伴奏|无歌词|无人声)|(?:人声|有人唱|带歌词|有歌词|vocal)/iu;
const instrumentalOnlyPattern =
  /(?:纯音乐|器乐|伴奏|无人声|无歌词|instrumental|piano\s*version)(?![^，。！？!?]{0,8}(?:不要|别|不含|排除|避免))/iu;
const retryPattern =
  /^(?:重试(?:一下|一次)?|再试(?:一下|一次)?|重新(?:规划|来一次?)|按刚才(?:的条件)?(?:重来|再来)|继续刚才的条件)$/iu;

function requestedGenreHints(content: string): string[] {
  const hints: string[] = [];
  if (/(?:流行|pop)/iu.test(content)) hints.push("pop");
  if (/(?:摇滚|rock)/iu.test(content)) hints.push("rock");
  if (/(?:爵士|jazz)/iu.test(content)) hints.push("jazz");
  if (/(?:民谣|folk)/iu.test(content)) hints.push("folk");
  return hints;
}

export function isProgramRetryRequest(content: string): boolean {
  return retryPattern.test(content.trim());
}

export function parseAnchorTrack(content: string): ProgramListeningIntent["anchorTrack"] {
  const quoted = /[《「“"]([^》」”"]{1,120})[》」”"]/u.exec(content)?.[1]?.trim();
  const unquoted =
    /(?:围绕|基于|参考|相似于|类似于)\s*(?:歌曲|歌)?\s*([^，。！？,!?\n]{1,100}?)(?:这首歌|这首|这支歌|规划|歌单|节目|推荐|相似|类似|$)/u
      .exec(content)?.[1]
      ?.trim();
  const raw = (quoted ?? unquoted)?.replace(/^(?:某首|一首|特定的?)\s*/u, "").trim();
  if (
    raw === undefined ||
    raw.length < 2 ||
    /(?:某首|特定歌曲|这首歌$)/u.test(raw) ||
    /^(?:华语|中文|国语|粤语|普通话|闽南|音乐|歌曲|歌单|节目)(?:歌|歌曲|音乐|歌单|节目)?$/u.test(
      raw,
    )
  ) {
    return null;
  }
  const parts = raw.split(/\s+(?:-|—|\/|\\)\s+|\s+by\s+/iu).map((part) => part.trim());
  const title = parts[0]?.replace(/(?:这首歌|这首|这支歌)$/u, "").trim();
  if (title === undefined || title.length < 2) return null;
  return { title, artist: parts[1] === undefined || parts[1].length === 0 ? null : parts[1] };
}

export function parseProgramListeningIntent(content: string): ProgramListeningIntent {
  const dimensionPatterns: Array<[ProgramListeningIntent["similarityDimensions"][number], RegExp]> =
    [
      ["melody", /旋律|曲调|和声/u],
      ["arrangement", /编曲|配器|制作/u],
      ["timbre", /音色|声线|嗓音/u],
      ["emotion", /情绪|氛围|感觉|情感/u],
      ["rhythm", /节奏|律动|鼓点/u],
      ["era", /年代|时期|时代/u],
    ];
  const requestedDimensions = dimensionPatterns
    .map(([dimension, pattern]) => ({ dimension, index: content.search(pattern) }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index)
    .map(({ dimension }) => dimension);

  const chinese = chineseLanguagePattern.test(content);
  const english = englishLanguagePattern.test(content);
  const japanese = japaneseLanguagePattern.test(content);
  const korean = koreanLanguagePattern.test(content);
  const western = westernRegionPattern.test(content);
  const languageScope = chinese
    ? "chinese"
    : japanese
      ? "japanese"
      : korean
        ? "korean"
        : english
          ? "english"
          : western
            ? "western-languages"
            : "any";
  const regionScope = chinese
    ? "greater-china"
    : japanese
      ? "japan"
      : korean
        ? "korea"
        : western
          ? "western"
          : "any";
  const vocalMode = vocalOnlyPattern.test(content)
    ? "vocal-only"
    : instrumentalOnlyPattern.test(content)
      ? "instrumental-only"
      : languageScope !== "any"
        ? "vocal-only"
        : "any";

  return programListeningIntentSchema.parse({
    anchorTrack: parseAnchorTrack(content),
    similarityDimensions:
      requestedDimensions.length > 0
        ? requestedDimensions
        : dimensionPatterns.map(([dimension]) => dimension),
    languageConstraint: chinese ? "chinese-vocal" : "any",
    languageScope,
    regionScope,
    vocalMode,
    genreHints: requestedGenreHints(content),
  });
}

export function normalizeProgramListeningIntent(
  scenarioText: string,
  listeningIntent?: ProgramListeningIntent | null,
): ProgramListeningIntent {
  const parsed = programListeningIntentSchema.parse(
    listeningIntent ?? parseProgramListeningIntent(scenarioText),
  );
  const inferred = parseProgramListeningIntent(scenarioText);
  return programListeningIntentSchema.parse({
    ...parsed,
    languageScope:
      parsed.languageScope !== "any"
        ? parsed.languageScope
        : parsed.languageConstraint === "chinese-vocal"
          ? "chinese"
          : inferred.languageScope,
    regionScope: parsed.regionScope !== "any" ? parsed.regionScope : inferred.regionScope,
    vocalMode:
      parsed.vocalMode !== "any"
        ? parsed.vocalMode
        : parsed.languageConstraint === "chinese-vocal"
          ? "vocal-only"
          : inferred.vocalMode,
    genreHints: parsed.genreHints.length > 0 ? parsed.genreHints : inferred.genreHints,
  });
}

export function resolveRetryScenario(
  content: string,
  recentTurns: readonly RadioTurn[],
): string | undefined {
  if (!isProgramRetryRequest(content)) return content.trim();
  return [...recentTurns]
    .filter((turn) => turn.decision === "program")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((turn) => turn.userMessage.content.trim())
    .find((scenarioText) => !isProgramRetryRequest(scenarioText));
}
