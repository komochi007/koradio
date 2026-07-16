import {
  tasteOverridesSchema,
  tasteProjectionSchema,
  type TasteOverrides,
  type TasteProjection,
  type UpdateTasteOverridesCommand,
} from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

interface TasteOverridesRow {
  profile_id: string;
  tags_json: string;
  avoid_rules_json: string;
  scene_rules_json: string;
  updated_at: string;
  version: number;
}

interface TasteProjectionRow {
  profile_id: string;
  tags_json: string;
  affinities_json: string;
  avoid_signals_json: string;
  source_version: number;
  updated_at: string;
}

export interface TasteOverridesRecord {
  overrides: TasteOverrides;
  version: number;
}

export class TasteDataError extends Error {
  constructor() {
    super("Taste data could not be read");
    this.name = "TasteDataError";
  }
}

export class TasteNotFoundError extends Error {
  constructor() {
    super("Taste data was not found");
    this.name = "TasteNotFoundError";
  }
}

export interface TasteRepository {
  getOverrides(profileId: string): TasteOverridesRecord | null;
  getProjection(profileId: string): TasteProjection | null;
  initialize(overrides: TasteOverrides): void;
  saveProjection(projection: TasteProjection): void;
  updateOverrides(
    profileId: string,
    command: UpdateTasteOverridesCommand,
    updatedAt: string,
  ): TasteOverridesRecord | null;
}

function parseStored<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TasteDataError();
  }
  return parsed.data;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new TasteDataError();
  }
}

function mapOverrides(row: TasteOverridesRow): TasteOverridesRecord {
  return {
    overrides: parseStored(tasteOverridesSchema, {
      profileId: row.profile_id,
      tags: parseJson(row.tags_json),
      avoidRules: parseJson(row.avoid_rules_json),
      sceneRules: parseJson(row.scene_rules_json),
      updatedAt: row.updated_at,
    }),
    version: row.version,
  };
}

function mapProjection(row: TasteProjectionRow): TasteProjection {
  return parseStored(tasteProjectionSchema, {
    profileId: row.profile_id,
    tags: parseJson(row.tags_json),
    affinities: parseJson(row.affinities_json),
    avoidSignals: parseJson(row.avoid_signals_json),
    sourceVersion: row.source_version,
    updatedAt: row.updated_at,
  });
}

export function createTasteRepository(client: DatabaseSync): TasteRepository {
  const insertOverrides = client.prepare(`
    INSERT INTO taste_overrides (
      profile_id,
      tags_json,
      avoid_rules_json,
      scene_rules_json,
      updated_at,
      version
    )
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(profile_id) DO NOTHING
  `);
  const insertProjection = client.prepare(`
    INSERT INTO taste_projection (
      profile_id,
      tags_json,
      affinities_json,
      avoid_signals_json,
      source_version,
      updated_at
    )
    VALUES (?, '[]', '[]', '[]', 0, ?)
    ON CONFLICT(profile_id) DO NOTHING
  `);
  const selectOverrides = client.prepare(`
    SELECT profile_id, tags_json, avoid_rules_json, scene_rules_json, updated_at, version
    FROM taste_overrides
    WHERE profile_id = ?
  `);
  const selectProjection = client.prepare(`
    SELECT
      profile_id,
      tags_json,
      affinities_json,
      avoid_signals_json,
      source_version,
      updated_at
    FROM taste_projection
    WHERE profile_id = ?
  `);
  const updateOverrides = client.prepare(`
    UPDATE taste_overrides
    SET
      tags_json = ?,
      avoid_rules_json = ?,
      scene_rules_json = ?,
      updated_at = ?,
      version = version + 1
    WHERE profile_id = ?
  `);
  const upsertProjection = client.prepare(`
    INSERT INTO taste_projection (
      profile_id,
      tags_json,
      affinities_json,
      avoid_signals_json,
      source_version,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      tags_json = excluded.tags_json,
      affinities_json = excluded.affinities_json,
      avoid_signals_json = excluded.avoid_signals_json,
      source_version = excluded.source_version,
      updated_at = excluded.updated_at
  `);

  return {
    getOverrides(profileId) {
      const row = selectOverrides.get(profileId) as TasteOverridesRow | undefined;
      return row === undefined ? null : mapOverrides(row);
    },
    getProjection(profileId) {
      const row = selectProjection.get(profileId) as TasteProjectionRow | undefined;
      return row === undefined ? null : mapProjection(row);
    },
    initialize(overrides) {
      insertOverrides.run(
        overrides.profileId,
        JSON.stringify(overrides.tags),
        JSON.stringify(overrides.avoidRules),
        JSON.stringify(overrides.sceneRules),
        overrides.updatedAt,
      );
      insertProjection.run(overrides.profileId, overrides.updatedAt);
    },
    saveProjection(projection) {
      upsertProjection.run(
        projection.profileId,
        JSON.stringify(projection.tags),
        JSON.stringify(projection.affinities),
        JSON.stringify(projection.avoidSignals),
        projection.sourceVersion,
        projection.updatedAt,
      );
    },
    updateOverrides(profileId, command, updatedAt) {
      const result = updateOverrides.run(
        JSON.stringify(command.tags),
        JSON.stringify(command.avoidRules),
        JSON.stringify(command.sceneRules),
        updatedAt,
        profileId,
      );
      if (result.changes === 0) {
        return null;
      }
      const row = selectOverrides.get(profileId) as TasteOverridesRow | undefined;
      return row === undefined ? null : mapOverrides(row);
    },
  };
}
