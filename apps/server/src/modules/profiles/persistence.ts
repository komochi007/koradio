import { profileSchema, type Profile, type UpdateProfileCommand } from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

interface ProfileRow {
  id: string;
  creation_idempotency_key: string;
  radio_name: string;
  nickname: string;
  avatar_ref: string | null;
  frequent_genres_json: string;
  default_scenario: string;
  created_at: string;
  updated_at: string;
}

export class ProfileDataError extends Error {
  constructor() {
    super("Profile data could not be read");
    this.name = "ProfileDataError";
  }
}

export interface ProfileRepository {
  findByCreationIdempotencyKey(idempotencyKey: string): Profile | null;
  findById(profileId: string): Profile | null;
  insert(profile: Profile, idempotencyKey: string): void;
  list(): Profile[];
  update(profileId: string, command: UpdateProfileCommand, updatedAt: string): Profile | null;
}

function mapRow(row: ProfileRow): Profile {
  try {
    return profileSchema.parse({
      id: row.id,
      radioName: row.radio_name,
      nickname: row.nickname,
      avatarRef: row.avatar_ref,
      frequentGenres: JSON.parse(row.frequent_genres_json) as unknown,
      defaultScenario: row.default_scenario,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new ProfileDataError();
    }

    throw error;
  }
}

export function createProfileRepository(client: DatabaseSync): ProfileRepository {
  const selectColumns = `
    id,
    creation_idempotency_key,
    radio_name,
    nickname,
    avatar_ref,
    frequent_genres_json,
    default_scenario,
    created_at,
    updated_at
  `;
  const selectById = client.prepare(`
    SELECT ${selectColumns}
    FROM profile
    WHERE id = ?
  `);
  const selectByCreationIdempotencyKey = client.prepare(`
    SELECT ${selectColumns}
    FROM profile
    WHERE creation_idempotency_key = ?
  `);
  const selectAll = client.prepare(`
    SELECT ${selectColumns}
    FROM profile
    ORDER BY created_at ASC, id ASC
  `);
  const insert = client.prepare(`
    INSERT INTO profile (
      id,
      creation_idempotency_key,
      radio_name,
      nickname,
      avatar_ref,
      frequent_genres_json,
      default_scenario,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const update = client.prepare(`
    UPDATE profile
    SET
      radio_name = ?,
      nickname = ?,
      avatar_ref = ?,
      frequent_genres_json = ?,
      default_scenario = ?,
      updated_at = ?
    WHERE id = ?
  `);

  function find(statement: ReturnType<DatabaseSync["prepare"]>, value: string): Profile | null {
    const row = statement.get(value) as ProfileRow | undefined;
    return row === undefined ? null : mapRow(row);
  }

  return {
    findByCreationIdempotencyKey(idempotencyKey) {
      return find(selectByCreationIdempotencyKey, idempotencyKey);
    },
    findById(profileId) {
      return find(selectById, profileId);
    },
    insert(profile, idempotencyKey) {
      insert.run(
        profile.id,
        idempotencyKey,
        profile.radioName,
        profile.nickname,
        profile.avatarRef,
        JSON.stringify(profile.frequentGenres),
        profile.defaultScenario,
        profile.createdAt,
        profile.updatedAt,
      );
    },
    list() {
      const rows = selectAll.all() as unknown as ProfileRow[];
      const profiles: Profile[] = [];

      for (const row of rows) {
        try {
          profiles.push(mapRow(row));
        } catch (error) {
          if (!(error instanceof ProfileDataError)) {
            throw error;
          }
        }
      }

      return profiles;
    },
    update(profileId, command, updatedAt) {
      const current = find(selectById, profileId);
      if (current === null) {
        return null;
      }

      update.run(
        command.radioName ?? current.radioName,
        command.nickname ?? current.nickname,
        command.avatarRef === undefined ? current.avatarRef : command.avatarRef,
        JSON.stringify(command.frequentGenres ?? current.frequentGenres),
        command.defaultScenario ?? current.defaultScenario,
        updatedAt,
        profileId,
      );
      return find(selectById, profileId);
    },
  };
}
