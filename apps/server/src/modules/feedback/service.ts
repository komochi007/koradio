import {
  feedbackEventSchema,
  type CreateFeedbackCommand,
  type FeedbackEvent,
  type TasteProjection,
} from "@koradio/contracts";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  TasteNotFoundError,
  rebuildTasteProjection,
  type TasteRepository,
} from "../taste/index.js";
import type { FeedbackRepository } from "./persistence.js";

export interface FeedbackTargetResolver {
  programExists(profileId: string, programId: string): boolean;
  trackExists(profileId: string, trackId: string): boolean;
}

export class FeedbackTargetNotFoundError extends Error {
  constructor() {
    super("Feedback target was not found");
    this.name = "FeedbackTargetNotFoundError";
  }
}

export interface PersistFeedbackResult {
  created: boolean;
  event: FeedbackEvent;
  projection: TasteProjection;
}

export interface FeedbackService {
  create(
    profileId: string,
    command: CreateFeedbackCommand,
    idempotencyKey: string,
  ): PersistFeedbackResult;
  rebuildProjection(profileId: string): TasteProjection;
}

export interface CreateFeedbackServiceOptions {
  client: DatabaseSync;
  now?: () => Date;
  randomId?: () => string;
  repository: FeedbackRepository;
  targets: FeedbackTargetResolver;
  tasteRepository: TasteRepository;
}

function isProgramFeedback(command: CreateFeedbackCommand): boolean {
  return command.type === "program_favorited" || command.type === "program_favorite_removed";
}

export function createFeedbackService(options: CreateFeedbackServiceOptions): FeedbackService {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;

  function readProjection(profileId: string): TasteProjection {
    const projection = options.tasteRepository.getProjection(profileId);
    if (projection === null) {
      throw new TasteNotFoundError();
    }
    return projection;
  }

  function rebuild(profileId: string): TasteProjection {
    const current = readProjection(profileId);
    const projection = rebuildTasteProjection(
      profileId,
      options.repository.list(profileId),
      current.updatedAt,
    );
    options.tasteRepository.saveProjection(projection);
    return projection;
  }

  return {
    create(profileId, command, idempotencyKey) {
      const repeated = options.repository.findByIdempotencyKey(profileId, idempotencyKey);
      if (repeated !== null) {
        return {
          created: false,
          event: repeated,
          projection: readProjection(profileId),
        };
      }

      const targetExists = isProgramFeedback(command)
        ? options.targets.programExists(profileId, command.targetId)
        : options.targets.trackExists(profileId, command.targetId);
      if (!targetExists) {
        throw new FeedbackTargetNotFoundError();
      }

      const event = feedbackEventSchema.parse({
        id: randomId(),
        profileId,
        targetId: command.targetId,
        type: command.type,
        idempotencyKey,
        createdAt: now().toISOString(),
      });

      options.client.exec("BEGIN IMMEDIATE");
      try {
        const concurrent = options.repository.findByIdempotencyKey(profileId, idempotencyKey);
        if (concurrent !== null) {
          const projection = readProjection(profileId);
          options.client.exec("ROLLBACK");
          return {
            created: false,
            event: concurrent,
            projection,
          };
        }

        options.repository.insert(event);
        const projection = rebuild(profileId);
        options.client.exec("COMMIT");
        return { created: true, event, projection };
      } catch (error) {
        options.client.exec("ROLLBACK");
        throw error;
      }
    },
    rebuildProjection(profileId) {
      options.client.exec("BEGIN IMMEDIATE");
      try {
        const projection = rebuild(profileId);
        options.client.exec("COMMIT");
        return projection;
      } catch (error) {
        options.client.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
