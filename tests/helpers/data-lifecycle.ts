import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { s6LegacyData, s6LegacyMigrationTag } from "../fixtures/data-lifecycle.js";

export async function installS6LegacyMigrations(
  sourceMigrationsFolder: string,
  destinationMigrationsFolder: string,
): Promise<void> {
  const directories = (await readdir(sourceMigrationsFolder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const lastIndex = directories.indexOf(s6LegacyMigrationTag);

  if (lastIndex < 0) {
    throw new Error(`Legacy migration ${s6LegacyMigrationTag} does not exist`);
  }

  await Promise.all(
    directories.slice(0, lastIndex + 1).map((directory) =>
      cp(join(sourceMigrationsFolder, directory), join(destinationMigrationsFolder, directory), {
        recursive: true,
      }),
    ),
  );
}

export async function seedS6LegacyData(client: DatabaseSync, dataRoot: string): Promise<void> {
  const avatarPath = join(dataRoot, "files", ...s6LegacyData.avatarRef.split("/"));
  await mkdir(dirname(avatarPath), { mode: 0o700, recursive: true });
  await writeFile(avatarPath, "s6-legacy-avatar-bytes");

  client.exec("BEGIN IMMEDIATE");

  try {
    client
      .prepare(
        `
          INSERT OR REPLACE INTO device_settings (id, data_root, codex_command, updated_at)
          VALUES (1, ?, 'codex', ?)
        `,
      )
      .run(dataRoot, s6LegacyData.createdAt);
    client
      .prepare(
        `
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
          VALUES (?, 's6-legacy-profile', 'Legacy Signals', 'Legacy', ?, '["ambient"]', '夜晚写作', ?, ?)
        `,
      )
      .run(
        s6LegacyData.profileId,
        s6LegacyData.avatarRef,
        s6LegacyData.createdAt,
        s6LegacyData.createdAt,
      );
    client
      .prepare(
        `
          INSERT INTO profile_preferences (
            profile_id,
            theme_mode,
            dj_language,
            dj_voice_style,
            updated_at
          )
          VALUES (?, 'light', 'en-GB', 'british-soft-radio', ?)
        `,
      )
      .run(s6LegacyData.profileId, s6LegacyData.createdAt);
    client
      .prepare(
        `
          INSERT INTO taste_overrides (
            profile_id,
            tags_json,
            avoid_rules_json,
            scene_rules_json,
            updated_at,
            version
          )
          VALUES (?, '["ambient"]', '["harsh treble"]', '["夜晚写作"]', ?, 3)
        `,
      )
      .run(s6LegacyData.profileId, s6LegacyData.createdAt);
    client
      .prepare(
        `
          INSERT INTO taste_projection (
            profile_id,
            tags_json,
            affinities_json,
            avoid_signals_json,
            source_version,
            updated_at
          )
          VALUES (?, '[]', '["track:62000000-0000-4000-8000-000000000002"]', '[]', 1, ?)
        `,
      )
      .run(s6LegacyData.profileId, s6LegacyData.createdAt);
    client
      .prepare(
        `
          INSERT INTO music_track (
            id,
            source,
            source_track_id,
            title,
            artist,
            album,
            duration_ms,
            lyric_status,
            created_at,
            updated_at
          )
          VALUES (?, 'netease', 's6-legacy-track', 'Legacy Track', 'Koradio', 'S6', 180000, 'available', ?, ?)
        `,
      )
      .run(s6LegacyData.trackId, s6LegacyData.createdAt, s6LegacyData.createdAt);
    client
      .prepare(
        `
          INSERT INTO library_item (
            profile_id,
            track_id,
            playlist_source_id,
            creation_idempotency_key,
            added_at
          )
          VALUES (?, ?, NULL, 's6-legacy-library-item', ?)
        `,
      )
      .run(s6LegacyData.profileId, s6LegacyData.trackId, s6LegacyData.createdAt);
    client
      .prepare(
        `
          INSERT INTO feedback_event (
            id,
            profile_id,
            target_id,
            type,
            idempotency_key,
            created_at
          )
          VALUES (?, ?, ?, 'track_liked', 's6-legacy-feedback', ?)
        `,
      )
      .run(
        s6LegacyData.feedbackId,
        s6LegacyData.profileId,
        s6LegacyData.trackId,
        s6LegacyData.createdAt,
      );
    client
      .prepare(
        `
          INSERT INTO program (id, profile_id, scenario_text, title, status, created_at)
          VALUES (?, ?, '旧版本恢复场景', 'Legacy Session', 'ready', ?)
        `,
      )
      .run(s6LegacyData.programId, s6LegacyData.profileId, s6LegacyData.createdAt);
    client
      .prepare(
        `
          INSERT INTO program_track (program_id, position, track_id)
          VALUES (?, 0, ?)
        `,
      )
      .run(s6LegacyData.programId, s6LegacyData.trackId);
    client
      .prepare(
        `
          INSERT INTO dj_script_segment (
            id,
            program_id,
            position,
            type,
            language,
            text,
            display_text,
            estimated_timing,
            tts_audio_ref
          )
          VALUES (?, ?, 0, 'intro', 'zh-CN', '旧串讲必须保留', '旧串讲必须保留', 1, NULL)
        `,
      )
      .run(s6LegacyData.segmentId, s6LegacyData.programId);
    client
      .prepare(
        `
          INSERT INTO playback_timeline_item (
            id,
            program_id,
            position,
            kind,
            segment_id,
            track_id,
            audio_ref,
            duration_ms
          )
          VALUES (?, ?, 0, 'track', NULL, ?, 'media/s6-legacy-track.wav', 180000)
        `,
      )
      .run(s6LegacyData.timelineItemId, s6LegacyData.programId, s6LegacyData.trackId);
    client
      .prepare(
        `
          INSERT INTO playback_checkpoint (
            profile_id,
            program_id,
            timeline_item_id,
            position_ms,
            volume,
            status,
            lease_epoch,
            saved_at
          )
          VALUES (?, ?, ?, ?, 0.75, 'paused', 4, ?)
        `,
      )
      .run(
        s6LegacyData.profileId,
        s6LegacyData.programId,
        s6LegacyData.timelineItemId,
        s6LegacyData.checkpointPositionMs,
        s6LegacyData.createdAt,
      );
    client.exec("COMMIT");
  } catch (error) {
    client.exec("ROLLBACK");
    throw error;
  }
}
