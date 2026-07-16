import { tasteOverridesSchema, type TasteOverrides } from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";

interface TasteOverridesRow {
  profile_id: string;
  tags_json: string;
  avoid_rules_json: string;
  scene_rules_json: string;
  updated_at: string;
}

export interface TasteDefaultsService {
  get(profileId: string): TasteOverrides;
  initialize(overrides: TasteOverrides): TasteOverrides;
}

function mapRow(row: TasteOverridesRow): TasteOverrides {
  return tasteOverridesSchema.parse({
    profileId: row.profile_id,
    tags: JSON.parse(row.tags_json) as unknown,
    avoidRules: JSON.parse(row.avoid_rules_json) as unknown,
    sceneRules: JSON.parse(row.scene_rules_json) as unknown,
    updatedAt: row.updated_at,
  });
}

export function createTasteDefaultsService(client: DatabaseSync): TasteDefaultsService {
  const insert = client.prepare(`
    INSERT INTO taste_overrides (
      profile_id,
      tags_json,
      avoid_rules_json,
      scene_rules_json,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO NOTHING
  `);
  const select = client.prepare(`
    SELECT profile_id, tags_json, avoid_rules_json, scene_rules_json, updated_at
    FROM taste_overrides
    WHERE profile_id = ?
  `);

  function get(profileId: string): TasteOverrides {
    const row = select.get(profileId) as TasteOverridesRow | undefined;
    if (row === undefined) {
      throw new Error("Taste overrides were not initialized");
    }
    return mapRow(row);
  }

  return {
    get,
    initialize(overrides) {
      insert.run(
        overrides.profileId,
        JSON.stringify(overrides.tags),
        JSON.stringify(overrides.avoidRules),
        JSON.stringify(overrides.sceneRules),
        overrides.updatedAt,
      );
      return get(overrides.profileId);
    },
  };
}
