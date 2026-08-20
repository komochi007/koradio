import { randomUUID } from "node:crypto";

import {
  radioConversationSchema,
  radioTurnSchema,
  type CreateRadioTurnCommand,
  type ProgramListeningIntent,
  type RadioConversation,
  type RadioTurn,
} from "@koradio/contracts";

import type { LibraryService } from "../library/index.js";
import {
  hasNonCanonicalVersionMarker,
  isCanonicalOriginalCandidate,
  sortCanonicalCandidates,
} from "../library/track-version.js";
import {
  isProgramRetryRequest,
  parseProgramListeningIntent,
  requestedProgramTrackCount,
  resolveRetryScenario,
  type ProgramGenerationService,
  type ProgramService,
} from "../programs/index.js";
import {
  radioAssistantOutputSchema,
  radioConversationContextSchema,
  type RadioAssistantProvider,
} from "./providers.js";
import type { RadioTurnRepository } from "./persistence.js";

export class RadioTurnNotFoundError extends Error {}
export class RadioTurnUnavailableError extends Error {}

export {
  isProgramRetryRequest,
  parseAnchorTrack,
  parseProgramListeningIntent,
} from "../programs/index.js";

export function isHighConfidenceProgramRequest(content: string): boolean {
  const normalized = content.trim();
  if (/(?:一首|一曲|单曲|这首|这支)/u.test(normalized)) return false;
  if (isAnchorProgramRequest(normalized)) return true;
  if (isRecommendationRequest(normalized)) return false;
  if (
    /(?:歌单|节目|音乐清单|歌单列表|[二三四五六七八九十百\d]+\s*首|几首|多首)/u.test(normalized)
  ) {
    return true;
  }
  const musicCue = /(?:歌|音乐|歌曲|曲目|听歌|听点|放歌)/u.test(normalized);
  const directActionCue = /(?:推荐|播放|放点|来点|听点|安排|策划|准备|想听|找.*(?:歌|音乐))/u.test(
    normalized,
  );
  const contextualListeningCue = /(?:适合|有没有|需要).*(?:听|歌|音乐)/u.test(normalized);
  const sceneCue = /(?:写作|写东西|工作|学习|通勤|阅读|整理|做饭|跑步|睡前|夜晚|晚上|清晨)/u.test(
    normalized,
  );
  const listeningPreferenceCue = /(?:安静|放松|轻松|温柔|沉闷|困|氛围|节奏|BGM)/iu.test(normalized);
  return (
    (musicCue && (directActionCue || contextualListeningCue)) ||
    (sceneCue && listeningPreferenceCue)
  );
}

export function isRecommendationRequest(content: string): boolean {
  return /(?:还有|其他|类似|再(?:推荐|来)).{0,16}(?:歌|歌曲|音乐|推荐)|(?:歌|歌曲|音乐).{0,12}(?:推荐|类似)/u.test(
    content.trim(),
  );
}

export function isAnchorProgramRequest(content: string): boolean {
  const normalized = content.trim();
  const programCue = /(?:歌单|节目|音乐清单|歌单列表|[二三四五六七八九十百\d]+\s*首)/u.test(
    normalized,
  );
  const anchorCue = /(?:围绕|基于|以.+为(?:主|核心|锚点)|参考|相似于|类似于)/u.test(normalized);
  return programCue && anchorCue && !/(?:一首|一曲|单曲)/u.test(normalized);
}

function requestedRecommendationCount(content: string): number | undefined {
  const match = /(?:推荐|挑|选).{0,8}?([345三四五])\s*首/u.exec(content);
  if (match === null) return undefined;
  return ({ "3": 3, "4": 4, "5": 5, 三: 3, 四: 4, 五: 5 } as Record<string, number>)[
    match[1] ?? ""
  ];
}

function requestedRecommendationArtist(content: string): string | undefined {
  const match = /(?:推荐|挑|选).{0,8}?([a-z][a-z0-9 .&'’-]{1,80}?)(?:的歌曲|的歌|的音乐)/iu.exec(
    content,
  );
  return match?.[1]?.trim().toLowerCase();
}

function acknowledgementFocus(intent: ProgramListeningIntent): string {
  if (intent.anchorTrack !== null)
    return `《${intent.anchorTrack.title}》的${intent.similarityDimensions.join("、")}线索`;
  if (intent.regionScope === "western" && intent.genreHints.includes("pop")) return "欧美流行人声";
  if (intent.regionScope === "western") return "欧美语种人声";
  if (intent.languageScope === "chinese") return "华语人声";
  if (intent.languageScope === "japanese") return "日语歌曲";
  if (intent.languageScope === "korean") return "韩语歌曲";
  if (intent.vocalMode === "instrumental-only") return "纯音乐";
  if (intent.vocalMode === "vocal-only") return "有人声的歌曲";
  return "你要的场景和氛围";
}

function acknowledgementScene(content: string): string {
  if (/雨天|下雨/u.test(content)) return "雨天就把声音放近一点";
  if (/秋日|秋天/u.test(content)) return "秋日的晴光适合留在旋律里";
  if (/夜晚|晚上|睡前/u.test(content)) return "夜里适合留一点呼吸感";
  if (/通勤/u.test(content)) return "通勤路上需要一点恰好的推力";
  if (/写作|写东西|阅读|学习|工作/u.test(content)) return "这一段先留住专注的空间";
  if (/抒情|柔和|温柔|安静|放松/u.test(content)) return "这一段不用急着把情绪推高";
  return "我先把你要的听感定住";
}

function acknowledgementVariant(content: string, recentTurnCount: number): number {
  return (
    Array.from(content).reduce(
      (total, character) => total + (character.codePointAt(0) ?? 0),
      recentTurnCount,
    ) % 3
  );
}

function replyForVariant(
  replies: readonly [string, string, string],
  content: string,
  recentTurnCount: number,
): string {
  return replies[acknowledgementVariant(content, recentTurnCount)] ?? replies[0];
}

export function programAcknowledgement(
  content: string,
  intent: ProgramListeningIntent,
  recentTurnCount: number,
): string {
  const focus = acknowledgementFocus(intent);
  if (/\p{Script=Han}/u.test(content)) {
    const scene = acknowledgementScene(content);
    return replyForVariant(
      [
        `好，${scene}。这档会以${focus}为线索，把情绪和节奏慢慢接起来。`,
        `${scene}；我会沿着${focus}铺开这一段听感。`,
        `这就对上了：${scene}。我会先定住${focus}的方向，再让整档节目自然展开。`,
      ],
      content,
      recentTurnCount,
    );
  }
  return replyForVariant(
    [
      "That gives us a clear starting point. I’ll shape the programme around the mood you described and let the pacing breathe.",
      "Nice direction — I’ll keep the atmosphere in focus and build the programme with a natural arc.",
      "I’ve got the feel of it. I’ll set the tone first, then let the programme unfold at its own pace.",
    ],
    content,
    recentTurnCount,
  );
}

export interface CreateRadioServiceOptions {
  assistant: RadioAssistantProvider | (() => RadioAssistantProvider);
  currentProgram: Pick<ProgramService, "current">;
  library: Pick<LibraryService, "resolveAudio" | "search">;
  now?: () => Date;
  programs: Pick<ProgramGenerationService, "start">;
  randomId?: () => string;
  repository: RadioTurnRepository;
}

export function createRadioService(options: CreateRadioServiceOptions) {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;
  return {
    clear(profileId: string): void {
      options.repository.clear(profileId);
    },
    get(profileId: string, turnId: string): RadioTurn {
      const turn = options.repository.findById(profileId, turnId);
      if (turn === null) throw new RadioTurnNotFoundError();
      return turn;
    },
    list(profileId: string): RadioConversation {
      return radioConversationSchema.parse({ turns: options.repository.list(profileId) });
    },
    async create(
      profileId: string,
      command: CreateRadioTurnCommand,
      idempotencyKey: string,
    ): Promise<RadioTurn> {
      const existing = options.repository.findByIdempotency(profileId, idempotencyKey);
      if (existing !== null) return existing;
      const recent = options.repository.list(profileId);
      const currentProgram = options.currentProgram.current(profileId);
      const context = radioConversationContextSchema.parse({
        content: command.content,
        currentProgram:
          currentProgram === null
            ? null
            : {
                scenarioText: currentProgram.program.scenarioText,
                title: currentProgram.program.title,
                tracks: currentProgram.tracks.slice(0, 12).map((track) => ({
                  artist: track.artist,
                  title: track.title,
                })),
              },
        recentMessages: recent.flatMap((turn) => [
          { role: turn.userMessage.role, content: turn.userMessage.content },
          {
            role: turn.assistantMessage.role,
            content:
              turn.recommendedTracks === undefined || turn.recommendedTracks.length === 0
                ? turn.assistantMessage.content
                : `${turn.assistantMessage.content}\nRecommended tracks: ${turn.recommendedTracks.map((track) => `${track.title} — ${track.artist}`).join("; ")}`,
          },
        ]),
      });
      const retryRequest = isProgramRetryRequest(command.content);
      const resolvedScenarioText = resolveRetryScenario(command.content, recent);
      const scenarioText = resolvedScenarioText ?? command.content;
      const retryUnavailable = retryRequest && resolvedScenarioText === undefined;
      const requestedTrackCount = requestedProgramTrackCount(scenarioText);
      const recommendationCount = requestedRecommendationCount(command.content);
      const recommendationArtist = requestedRecommendationArtist(command.content);
      const recommendationRequest = isRecommendationRequest(command.content);
      const anchorProgramRequest = isAnchorProgramRequest(scenarioText);
      const listeningIntent = parseProgramListeningIntent(scenarioText);
      const invalidTrackCount =
        requestedTrackCount !== null &&
        recommendationCount === undefined &&
        (requestedTrackCount < 8 || requestedTrackCount > 12);
      const deterministicProgram =
        recommendationCount === undefined &&
        (retryRequest ||
          anchorProgramRequest ||
          (!recommendationRequest && isHighConfidenceProgramRequest(command.content)));
      const response = retryUnavailable
        ? {
            decision: "clarify" as const,
            reply: "我没有找到可以重试的上一档节目条件，请重新告诉我想听什么。",
            musicQuery: null,
            musicQueries: [],
          }
        : invalidTrackCount
          ? {
              decision: "clarify" as const,
              reply: "一档完整节目可以安排 8–12 首歌。你希望我做 8、9、10、11 还是 12 首？",
              musicQuery: null,
              musicQueries: [],
            }
          : deterministicProgram
            ? {
                decision: "program" as const,
                reply: programAcknowledgement(scenarioText, listeningIntent, recent.length),
                musicQuery: null,
                musicQueries: [],
              }
            : await (async () => {
                const assistant =
                  typeof options.assistant === "function" ? options.assistant() : options.assistant;
                const output = radioAssistantOutputSchema.safeParse(
                  await assistant.respond(context, { correlationId: randomId() }),
                );
                if (!output.success) throw new RadioTurnUnavailableError();
                return output.data;
              })();
      let track = null;
      const recommendedTracks: NonNullable<RadioTurn["recommendedTracks"]> = [];
      let programJobId: string | null = null;
      const previousRecommendations = [...recent]
        .reverse()
        .find((turn) => (turn.recommendedTracks?.length ?? 0) > 0)?.recommendedTracks;
      const recommendationFollowUp =
        /(?:最推荐|哪.*(?:首|一首)|top pick|best pick|recommend.*most)/iu.test(command.content);
      const explicitlyRequestedNonCanonicalVersion = hasNonCanonicalVersionMarker(command.content);
      if (response.decision === "single_track") {
        if (recommendationFollowUp && previousRecommendations !== undefined) {
          track =
            previousRecommendations.find((candidate) =>
              `${candidate.title} ${candidate.artist}`
                .toLocaleLowerCase("en-US")
                .includes((response.musicQuery ?? "").toLocaleLowerCase("en-US")),
            ) ??
            previousRecommendations[0] ??
            null;
        } else if (response.musicQuery !== null) {
          const result = await options.library.search(response.musicQuery);
          track =
            sortCanonicalCandidates(
              result.items.filter(
                (candidate) =>
                  candidate.playable &&
                  (explicitlyRequestedNonCanonicalVersion ||
                    isCanonicalOriginalCandidate(candidate, response.musicQuery ?? "")),
              ),
              response.musicQuery,
            )[0] ?? null;
        }
        if (track === null) throw new RadioTurnUnavailableError();
      } else if (response.decision === "recommendations") {
        const seen = new Set<string>();
        for (const query of response.musicQueries.slice(0, 5)) {
          const candidates = sortCanonicalCandidates(
            (await options.library.search(query)).items.filter(
              (item) =>
                item.playable &&
                !seen.has(item.id) &&
                (explicitlyRequestedNonCanonicalVersion ||
                  isCanonicalOriginalCandidate(item, query)) &&
                (recommendationArtist === undefined ||
                  item.artist.toLowerCase().includes(recommendationArtist)),
            ),
            query,
          );
          const candidate = (
            await Promise.all(
              candidates.map(async (item) => {
                try {
                  await options.library.resolveAudio(item.id);
                  return item;
                } catch {
                  return undefined;
                }
              }),
            )
          ).find((item) => item !== undefined);
          if (candidate === undefined) continue;
          seen.add(candidate.id);
          recommendedTracks.push(candidate);
        }
        if (recommendedTracks.length === 0) throw new RadioTurnUnavailableError();
      } else if (response.decision === "program") {
        programJobId = options.programs.start(
          profileId,
          { scenarioText, listeningIntent },
          `radio:${idempotencyKey}`,
        ).jobId;
      }
      const createdAt = now().toISOString();
      const reply =
        response.decision === "recommendations" && recommendedTracks.length < 5
          ? recommendationArtist === undefined
            ? `${response.reply} 目前只找到 ${String(recommendedTracks.length)} 首可播放的歌曲。`
            : `${response.reply} 目前只找到 ${String(recommendedTracks.length)} 首可播放的 ${recommendationArtist} 歌曲。`
          : response.reply;
      const turn = radioTurnSchema.parse({
        id: randomId(),
        profileId,
        decision: response.decision,
        userMessage: {
          id: randomId(),
          profileId,
          role: "user",
          content: command.content,
          trackId: null,
          createdAt,
        },
        assistantMessage: {
          id: randomId(),
          profileId,
          role: "assistant",
          content: reply,
          trackId: track?.id ?? null,
          createdAt,
        },
        track,
        recommendedTracks,
        programJobId,
        createdAt,
      });
      options.repository.insert(turn, idempotencyKey);
      return turn;
    },
  };
}
