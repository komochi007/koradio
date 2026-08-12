import { radioTurnDecisionSchema } from "@koradio/contracts";
import { z } from "zod";

import { providerCallOptionsSchema, type ProviderCallOptions } from "../programs/index.js";

export const radioConversationContextSchema = z.strictObject({
  content: z.string().trim().min(1).max(500),
  recentMessages: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(5000),
      }),
    )
    .max(100),
});

export const radioAssistantOutputSchema = z.strictObject({
  decision: radioTurnDecisionSchema,
  reply: z.string().trim().min(1).max(5000),
  musicQuery: z.string().trim().min(1).max(100).nullable(),
  musicQueries: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
});

export interface RadioAssistantProvider {
  respond(context: unknown, options: ProviderCallOptions): Promise<unknown>;
}

function scenarioSeed(value: string): number {
  return Array.from(value).reduce(
    (seed, character, index) => (seed + (character.codePointAt(0) ?? 0) * (index + 1)) % 997,
    0,
  );
}

function topicFor(value: string): string {
  const normalized = value.trim().replace(/[。！？!?]+$/u, "");
  if (normalized.length <= 32) return normalized;
  return `${Array.from(normalized).slice(0, 31).join("")}…`;
}

function isChinese(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function isProgramIntent(value: string): boolean {
  const multiple = /(?:[二三四五六七八九十百]+|\d+|几|多)\s*首/u.test(value);
  const namedProgram = /歌单|节目|音乐清单|歌单列表|一组/u.test(value);
  const musicCue = /歌|音乐|歌曲|曲目|听歌|听点|放歌/u.test(value);
  const directAction = /推荐|播放|放点|安排|策划|准备|想听|适合|有没有|需要/u.test(value);
  const sceneCue = /(?:写作|写东西|工作|学习|通勤|阅读|整理|做饭|跑步|睡前|夜晚|晚上|清晨)/u.test(
    value,
  );
  const listeningPreferenceCue = /(?:安静|放松|轻松|温柔|沉闷|困|氛围|节奏|BGM)/iu.test(value);
  return (
    namedProgram || multiple || (musicCue && directAction) || (sceneCue && listeningPreferenceCue)
  );
}

function requestedRecommendationCount(value: string): number | undefined {
  const matched = /(?:推荐|挑|选).{0,8}?([345五三四])\s*首/u.exec(value);
  if (matched === null) return undefined;
  const valueByCharacter: Record<string, number> = { "3": 3, "4": 4, "5": 5, 三: 3, 四: 4, 五: 5 };
  return valueByCharacter[matched[1] ?? ""];
}

const mockSingleTrackQueries = [
  "Space Song Beach House",
  "Midnight City M83",
  "Quiet Signal Artist Three",
  "Paper Moon Artist Seven",
  "Blue Hour Artist Thirteen",
  "Window Seat Artist Fourteen",
];

export function createMockRadioAssistantProvider(): RadioAssistantProvider {
  return {
    respond(context, options) {
      const parsed = radioConversationContextSchema.parse(context);
      providerCallOptionsSchema.parse(options);
      const content = parsed.content;
      const seed = scenarioSeed(`${content}|${String(parsed.recentMessages.length)}`);
      const recommendationCount = requestedRecommendationCount(content);
      const explicitlyMultiple = /(?:[二三四五六七八九十]+|\d+|几|多)\s*首/u.test(content);
      const single =
        !explicitlyMultiple &&
        /推荐.*(?:一首|首歌)|听.*(?:一首|这首)|放.*(?:一首|首歌)/u.test(content);
      const broad = /随便|都行|你懂的|来点音乐/u.test(content);
      const program =
        recommendationCount === undefined && !single && !broad && isProgramIntent(content);
      if (recommendationCount !== undefined) {
        const queries = Array.from(
          { length: 5 },
          (_, index) =>
            mockSingleTrackQueries[(seed + index) % mockSingleTrackQueries.length] ??
            "Space Song Beach House",
        );
        return Promise.resolve({
          decision: "recommendations",
          reply: isChinese(content)
            ? "我挑了五首，先从最贴近你此刻心情的开始；它们会一点点把氛围推开。"
            : "I picked five tracks that start close to this moment, then let the mood open gradually.",
          musicQuery: null,
          musicQueries: queries,
        });
      }
      if (program) {
        const topic = topicFor(content);
        const replies = isChinese(content)
          ? [
              `收到，我会围绕“${topic}”策划一档完整节目，先把情绪和节奏排顺。`,
              `懂了，你想听的是“${topic}”。我现在按这个方向挑歌，稍等我把整段氛围接起来。`,
              `这个场景很适合做成一段连续的听感，我会以“${topic}”为主线安排一档完整节目。`,
            ]
          : [
              `Got it — I’ll shape a full programme around “${topic}” and let the mood unfold naturally.`,
              `I understand the scene. I’m choosing a connected set of songs for “${topic}” now.`,
              `That sounds like a good setting for a continuous programme; I’ll build one around “${topic}”.`,
            ];
        return Promise.resolve({
          decision: "program",
          reply: replies[seed % replies.length] ?? replies[0],
          musicQuery: null,
          musicQueries: [],
        });
      }
      if (single) {
        const replies = isChinese(content)
          ? [
              "我先替你挑一首贴近此刻的歌。",
              "先给你放一首，让这个情绪有个落点。",
              "我想到一首很合适的，先从它开始。",
            ]
          : [
              "I’ll find one song that fits this moment.",
              "Let’s give this feeling one song to land on first.",
              "I have a good starting point in mind — let’s begin there.",
            ];
        return Promise.resolve({
          decision: "single_track",
          reply: replies[seed % replies.length] ?? replies[0],
          musicQuery:
            content.trim() === "推荐一首歌"
              ? "Space Song Beach House"
              : (mockSingleTrackQueries[seed % mockSingleTrackQueries.length] ??
                "Space Song Beach House"),
          musicQueries: [],
        });
      }
      if (broad) {
        return Promise.resolve({
          decision: "clarify",
          reply: isChinese(content)
            ? "你想先听一首，还是让我把这个时刻排成一档 8 首左右的节目？"
            : "Would you like one song first, or a full programme of around eight tracks?",
          musicQuery: null,
          musicQueries: [],
        });
      }
      const topic = topicFor(content);
      const chatReplies = isChinese(content)
        ? [
            `我听到了。${topic} 这句话里有一点值得慢慢展开，你现在最在意的是哪一部分？`,
            `嗯，这个话题有点意思。先不急着放歌，你愿意说说它为什么在今天被你想起来吗？`,
            `我在听。${topic.length > 12 ? "这件事的背景似乎比一句话更丰富。" : "你可以继续说，我跟得上。"}`,
          ]
        : [
            `I’m with you. There’s more to “${topic}” than one sentence — which part is on your mind?`,
            `That’s an interesting thread. We don’t have to play anything yet; what brought it to you today?`,
            `I’m listening. You can keep going — I’ll stay with the thought before we choose any music.`,
          ];
      return Promise.resolve({
        decision: "chat",
        reply: chatReplies[seed % chatReplies.length] ?? chatReplies[0],
        musicQuery: null,
        musicQueries: [],
      });
    },
  };
}

export type RadioConversationContext = z.infer<typeof radioConversationContextSchema>;
export type RadioAssistantOutput = z.infer<typeof radioAssistantOutputSchema>;
