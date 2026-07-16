import {
  tasteResponseSchema,
  type TasteOverrides,
  type TasteResponse,
  type UpdateTasteOverridesCommand,
} from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";

import { mergeEffectiveTaste } from "./domain/projection.js";
import { TasteNotFoundError, createTasteRepository, type TasteRepository } from "./persistence.js";

export interface TasteDefaultsService {
  get(profileId: string): TasteOverrides;
  initialize(overrides: TasteOverrides): TasteOverrides;
}

export interface TasteService {
  get(profileId: string): TasteResponse;
  updateOverrides(profileId: string, command: UpdateTasteOverridesCommand): TasteResponse;
}

function readTaste(repository: TasteRepository, profileId: string): TasteResponse {
  const projection = repository.getProjection(profileId);
  const overrideRecord = repository.getOverrides(profileId);
  if (projection === null || overrideRecord === null) {
    throw new TasteNotFoundError();
  }

  return tasteResponseSchema.parse({
    projection,
    overrides: overrideRecord.overrides,
    effective: mergeEffectiveTaste(projection, overrideRecord.overrides, overrideRecord.version),
  });
}

export function createTasteDefaultsService(client: DatabaseSync): TasteDefaultsService {
  const repository = createTasteRepository(client);

  function get(profileId: string): TasteOverrides {
    const record = repository.getOverrides(profileId);
    if (record === null) {
      throw new TasteNotFoundError();
    }
    return record.overrides;
  }

  return {
    get,
    initialize(overrides) {
      repository.initialize(overrides);
      return get(overrides.profileId);
    },
  };
}

export interface CreateTasteServiceOptions {
  now?: () => Date;
  repository: TasteRepository;
}

export function createTasteService(options: CreateTasteServiceOptions): TasteService {
  const now = options.now ?? (() => new Date());

  return {
    get(profileId) {
      return readTaste(options.repository, profileId);
    },
    updateOverrides(profileId, command) {
      const updated = options.repository.updateOverrides(profileId, command, now().toISOString());
      if (updated === null) {
        throw new TasteNotFoundError();
      }
      return readTaste(options.repository, profileId);
    },
  };
}
