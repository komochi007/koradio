import { randomUUID } from "node:crypto";

import {
  radioConversationSchema,
  radioTurnSchema,
  type CreateRadioTurnCommand,
  type RadioConversation,
  type RadioTurn,
} from "@koradio/contracts";

import type { LibraryService } from "../library/index.js";
import { requestedProgramTrackCount, type ProgramGenerationService } from "../programs/index.js";
import {
  radioAssistantOutputSchema,
  radioConversationContextSchema,
  type RadioAssistantProvider,
} from "./providers.js";
import type { RadioTurnRepository } from "./persistence.js";

export class RadioTurnNotFoundError extends Error {}
export class RadioTurnUnavailableError extends Error {}

export function isHighConfidenceProgramRequest(content: string): boolean {
  const normalized = content.trim();
  if (/(?:一首|一曲|单曲|这首|这支)/u.test(normalized)) return false;
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
  return musicCue && (directActionCue || contextualListeningCue);
}

function programAcknowledgement(content: string): string {
  const scene = content.trim().replace(/[。！？!?]+$/u, "");
  const label =
    Array.from(scene).length > 36 ? `${Array.from(scene).slice(0, 35).join("")}…` : scene;
  if (/\p{Script=Han}/u.test(content)) {
    return `收到，我会围绕“${label}”策划一档完整节目，先把情绪和节奏排顺。`;
  }
  return `Got it — I’ll shape a full programme around “${label}” and let the mood unfold naturally.`;
}

export interface CreateRadioServiceOptions {
  assistant: RadioAssistantProvider | (() => RadioAssistantProvider);
  library: Pick<LibraryService, "search">;
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
      const context = radioConversationContextSchema.parse({
        content: command.content,
        recentMessages: recent.flatMap((turn) => [
          { role: turn.userMessage.role, content: turn.userMessage.content },
          { role: turn.assistantMessage.role, content: turn.assistantMessage.content },
        ]),
      });
      const assistant =
        typeof options.assistant === "function" ? options.assistant() : options.assistant;
      const output = radioAssistantOutputSchema.safeParse(
        await assistant.respond(context, { correlationId: randomId() }),
      );
      if (!output.success) throw new RadioTurnUnavailableError();
      const requestedTrackCount = requestedProgramTrackCount(command.content);
      const response =
        requestedTrackCount !== null && (requestedTrackCount < 8 || requestedTrackCount > 12)
          ? {
              decision: "clarify" as const,
              reply: "一档完整节目可以安排 8–12 首歌。你希望我做 8、9、10、11 还是 12 首？",
              musicQuery: null,
            }
          : isHighConfidenceProgramRequest(command.content) && output.data.decision !== "program"
            ? {
                decision: "program" as const,
                reply: programAcknowledgement(command.content),
                musicQuery: null,
              }
            : output.data;
      let track = null;
      let programJobId: string | null = null;
      if (response.decision === "single_track") {
        if (response.musicQuery === null) throw new RadioTurnUnavailableError();
        const result = await options.library.search(response.musicQuery);
        track = result.items.find((candidate) => candidate.playable) ?? null;
        if (track === null) throw new RadioTurnUnavailableError();
      } else if (response.decision === "program") {
        programJobId = options.programs.start(
          profileId,
          { scenarioText: command.content },
          `radio:${idempotencyKey}`,
        ).jobId;
      }
      const createdAt = now().toISOString();
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
          content: response.reply,
          trackId: track?.id ?? null,
          createdAt,
        },
        track,
        programJobId,
        createdAt,
      });
      options.repository.insert(turn, idempotencyKey);
      return turn;
    },
  };
}
