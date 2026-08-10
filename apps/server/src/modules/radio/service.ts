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
        output.data.decision === "program" &&
        requestedTrackCount !== null &&
        (requestedTrackCount < 8 || requestedTrackCount > 12)
          ? {
              decision: "clarify" as const,
              reply: "一档完整节目可以安排 8–12 首歌。你希望我做 8、9、10、11 还是 12 首？",
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
