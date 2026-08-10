import type { DatabaseSync } from "node:sqlite";

import {
  musicTrackSchema,
  radioConversationSchema,
  radioTurnSchema,
  type RadioTurn,
} from "@koradio/contracts";
import { z } from "zod";

import { parseSqliteRow, parseSqliteRows } from "../../platform/db/rows.js";

const rowSchema = z.object({
  id: z.string(),
  profile_id: z.string(),
  decision: z.enum(["chat", "clarify", "single_track", "program"]),
  user_message_id: z.string(),
  user_content: z.string(),
  user_created_at: z.string(),
  assistant_message_id: z.string(),
  assistant_content: z.string(),
  assistant_created_at: z.string(),
  track_id: z.string().nullable(),
  program_job_id: z.string().nullable(),
  created_at: z.string(),
  track_source: z.literal("netease").nullable(),
  track_source_id: z.string().nullable(),
  track_title: z.string().nullable(),
  track_artist: z.string().nullable(),
  track_album: z.string().nullable(),
  track_artwork_url: z.string().nullable(),
  track_duration_ms: z.number().nullable(),
  track_lyric_status: z.enum(["available", "untimed", "unavailable"]).nullable(),
  track_lyrics_queried: z.number().nullable(),
  track_playable: z.number().nullable(),
  track_origin_mode: z.enum(["live", "mock"]).nullable(),
});

export interface RadioTurnRepository {
  clear(profileId: string): void;
  findById(profileId: string, turnId: string): RadioTurn | null;
  findByIdempotency(profileId: string, key: string): RadioTurn | null;
  insert(turn: RadioTurn, idempotencyKey: string): void;
  list(profileId: string): RadioTurn[];
}

function mapRow(row: z.infer<typeof rowSchema>): RadioTurn {
  const track =
    row.track_id === null || row.track_source === null
      ? null
      : musicTrackSchema.parse({
          id: row.track_id,
          source: row.track_source,
          sourceTrackId: row.track_source_id,
          title: row.track_title,
          artist: row.track_artist,
          album: row.track_album,
          artworkUrl: row.track_artwork_url,
          durationMs: row.track_duration_ms,
          lyricStatus:
            row.track_lyric_status === "unavailable" && row.track_lyrics_queried === 0
              ? "unknown"
              : row.track_lyric_status,
          playable: row.track_playable === 1,
          originMode: row.track_origin_mode,
        });
  return radioTurnSchema.parse({
    id: row.id,
    profileId: row.profile_id,
    decision: row.decision,
    userMessage: {
      id: row.user_message_id,
      profileId: row.profile_id,
      role: "user",
      content: row.user_content,
      trackId: null,
      createdAt: row.user_created_at,
    },
    assistantMessage: {
      id: row.assistant_message_id,
      profileId: row.profile_id,
      role: "assistant",
      content: row.assistant_content,
      trackId: row.track_id,
      createdAt: row.assistant_created_at,
    },
    track,
    programJobId: row.program_job_id,
    createdAt: row.created_at,
  });
}

export function createRadioTurnRepository(client: DatabaseSync): RadioTurnRepository {
  const select = `
    SELECT radio_turn.*,
      user_message.content AS user_content, user_message.created_at AS user_created_at,
      assistant_message.content AS assistant_content,
      assistant_message.created_at AS assistant_created_at,
      music_track.source AS track_source,
      music_track.source_track_id AS track_source_id,
      music_track.title AS track_title,
      music_track.artist AS track_artist,
      music_track.album AS track_album,
      music_track.artwork_url AS track_artwork_url,
      music_track.duration_ms AS track_duration_ms,
      music_track.lyric_status AS track_lyric_status,
      music_track.lyrics_queried AS track_lyrics_queried,
      music_track.playable AS track_playable,
      music_track.origin_mode AS track_origin_mode
    FROM radio_turn
    JOIN radio_message AS user_message ON user_message.id = radio_turn.user_message_id
    JOIN radio_message AS assistant_message ON assistant_message.id = radio_turn.assistant_message_id
    LEFT JOIN music_track ON music_track.id = radio_turn.track_id
  `;
  const byId = client.prepare(`${select} WHERE radio_turn.profile_id = ? AND radio_turn.id = ?`);
  const byKey = client.prepare(
    `${select} WHERE radio_turn.profile_id = ? AND radio_turn.idempotency_key = ?`,
  );
  const list = client.prepare(
    `${select} WHERE radio_turn.profile_id = ? ORDER BY radio_turn.created_at DESC, radio_turn.id DESC LIMIT 50`,
  );
  const insertMessage = client.prepare(
    "INSERT INTO radio_message (id, profile_id, role, content, track_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertTurn = client.prepare(`
    INSERT INTO radio_turn (
      id, profile_id, idempotency_key, decision, user_message_id,
      assistant_message_id, track_id, program_job_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteOverflowTurns = client.prepare(`
    DELETE FROM radio_turn WHERE profile_id = ? AND id NOT IN (
      SELECT id FROM radio_turn WHERE profile_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 50
    )
  `);
  const deleteOverflowSpeech = client.prepare(`
    DELETE FROM radio_speech_generation WHERE profile_id = ? AND message_id NOT IN (
      SELECT assistant_message_id FROM radio_turn WHERE profile_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 50
    )
  `);
  const deleteOrphanMessages = client.prepare(`
    DELETE FROM radio_message WHERE profile_id = ? AND id NOT IN (
      SELECT user_message_id FROM radio_turn WHERE profile_id = ?
      UNION SELECT assistant_message_id FROM radio_turn WHERE profile_id = ?
    )
  `);

  return {
    clear(profileId) {
      client.exec("BEGIN IMMEDIATE");
      try {
        client.prepare("DELETE FROM radio_speech_generation WHERE profile_id = ?").run(profileId);
        client.prepare("DELETE FROM radio_turn WHERE profile_id = ?").run(profileId);
        client.prepare("DELETE FROM radio_message WHERE profile_id = ?").run(profileId);
        client.exec("COMMIT");
      } catch (error) {
        client.exec("ROLLBACK");
        throw error;
      }
    },
    findById(profileId, turnId) {
      const value = byId.get(profileId, turnId);
      return value === undefined ? null : mapRow(parseSqliteRow(rowSchema, value));
    },
    findByIdempotency(profileId, key) {
      const value = byKey.get(profileId, key);
      return value === undefined ? null : mapRow(parseSqliteRow(rowSchema, value));
    },
    insert(turn, idempotencyKey) {
      client.exec("BEGIN IMMEDIATE");
      try {
        insertMessage.run(
          turn.userMessage.id,
          turn.profileId,
          "user",
          turn.userMessage.content,
          null,
          turn.userMessage.createdAt,
        );
        insertMessage.run(
          turn.assistantMessage.id,
          turn.profileId,
          "assistant",
          turn.assistantMessage.content,
          turn.assistantMessage.trackId,
          turn.assistantMessage.createdAt,
        );
        insertTurn.run(
          turn.id,
          turn.profileId,
          idempotencyKey,
          turn.decision,
          turn.userMessage.id,
          turn.assistantMessage.id,
          turn.assistantMessage.trackId,
          turn.programJobId,
          turn.createdAt,
        );
        deleteOverflowSpeech.run(turn.profileId, turn.profileId);
        deleteOverflowTurns.run(turn.profileId, turn.profileId);
        deleteOrphanMessages.run(turn.profileId, turn.profileId, turn.profileId);
        client.exec("COMMIT");
      } catch (error) {
        client.exec("ROLLBACK");
        throw error;
      }
    },
    list(profileId) {
      const turns = parseSqliteRows(rowSchema, list.all(profileId)).map((row) => mapRow(row));
      turns.reverse();
      return radioConversationSchema.parse({ turns }).turns;
    },
  };
}
