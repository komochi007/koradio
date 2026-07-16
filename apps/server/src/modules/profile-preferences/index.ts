import {
  profilePreferencesSchema,
  type ProfilePreferences,
  type UpdateProfilePreferencesCommand,
} from "@koradio/contracts";
import type { DatabaseSync } from "node:sqlite";

interface ProfilePreferencesRow {
  profile_id: string;
  theme_mode: string;
  dj_language: string;
  dj_voice_style: string;
  updated_at: string;
}

export interface CreateProfilePreferencesServiceOptions {
  client: DatabaseSync;
  now?: () => Date;
}

export interface ProfilePreferencesService {
  initialize(profileId: string, updatedAt?: string): ProfilePreferences;
  get(profileId: string): ProfilePreferences;
  update(profileId: string, command: UpdateProfilePreferencesCommand): ProfilePreferences;
}

export class ProfilePreferencesNotFoundError extends Error {
  constructor() {
    super("Profile preferences were not found");
    this.name = "ProfilePreferencesNotFoundError";
  }
}

function mapRow(row: ProfilePreferencesRow): ProfilePreferences {
  return profilePreferencesSchema.parse({
    profileId: row.profile_id,
    themeMode: row.theme_mode,
    djLanguage: row.dj_language,
    djVoiceStyle: row.dj_voice_style,
    updatedAt: row.updated_at,
  });
}

export function createProfilePreferencesService(
  options: CreateProfilePreferencesServiceOptions,
): ProfilePreferencesService {
  const now = options.now ?? (() => new Date());
  const insertDefaults = options.client.prepare(`
    INSERT INTO profile_preferences (
      profile_id,
      theme_mode,
      dj_language,
      dj_voice_style,
      updated_at
    )
    VALUES (?, 'dark', 'zh-CN', 'british-soft-radio', ?)
    ON CONFLICT(profile_id) DO NOTHING
  `);
  const selectByProfileId = options.client.prepare(`
    SELECT profile_id, theme_mode, dj_language, dj_voice_style, updated_at
    FROM profile_preferences
    WHERE profile_id = ?
  `);
  const updateByProfileId = options.client.prepare(`
    UPDATE profile_preferences
    SET
      theme_mode = ?,
      dj_language = ?,
      dj_voice_style = ?,
      updated_at = ?
    WHERE profile_id = ?
  `);

  function get(profileId: string): ProfilePreferences {
    const row = selectByProfileId.get(profileId) as ProfilePreferencesRow | undefined;

    if (row === undefined) {
      throw new ProfilePreferencesNotFoundError();
    }

    return mapRow(row);
  }

  return {
    initialize(profileId, updatedAt = now().toISOString()) {
      insertDefaults.run(profileId, updatedAt);
      return get(profileId);
    },
    get,
    update(profileId, command) {
      const current = get(profileId);
      updateByProfileId.run(
        command.themeMode ?? current.themeMode,
        command.djLanguage ?? current.djLanguage,
        command.djVoiceStyle ?? current.djVoiceStyle,
        now().toISOString(),
        profileId,
      );
      return get(profileId);
    },
  };
}
