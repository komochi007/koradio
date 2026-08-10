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
});

export interface RadioAssistantProvider {
  respond(context: unknown, options: ProviderCallOptions): Promise<unknown>;
}

export function createMockRadioAssistantProvider(): RadioAssistantProvider {
  return {
    respond(context, options) {
      const parsed = radioConversationContextSchema.parse(context);
      providerCallOptionsSchema.parse(options);
      const content = parsed.content;
      const explicitlyMultiple = /(?:[二三四五六七八九十]+|\d+|几|多)\s*首/u.test(content);
      const single =
        !explicitlyMultiple &&
        /推荐.*(?:一首|首歌)|听.*(?:一首|这首)|放.*(?:一首|首歌)/u.test(content);
      const program =
        !single &&
        /歌单|节目|一组|来\s*\d+\s*首|推荐.*(?:[二三四五六七八九十]+首|\d+\s*首|几首|多首)/u.test(
          content,
        );
      if (program) {
        return Promise.resolve({
          decision: "program",
          reply: "明白，我会按这个场景策划一档完整节目。",
          musicQuery: null,
        });
      }
      if (single) {
        return Promise.resolve({
          decision: "single_track",
          reply: "我先给你挑一首贴近此刻的歌。",
          musicQuery: "Space Song Beach House",
        });
      }
      if (/随便|都行|你懂的|来点音乐/u.test(content)) {
        return Promise.resolve({
          decision: "clarify",
          reply: "你想先听一首，还是让我为这个时刻做一档 8 首节目？",
          musicQuery: null,
        });
      }
      return Promise.resolve({
        decision: "chat",
        reply: `我在听。${content.length > 30 ? "你说的这件事里，最值得先照顾的是当下的感受。" : "想继续聊聊也可以。"}`,
        musicQuery: null,
      });
    },
  };
}

export type RadioConversationContext = z.infer<typeof radioConversationContextSchema>;
export type RadioAssistantOutput = z.infer<typeof radioAssistantOutputSchema>;
