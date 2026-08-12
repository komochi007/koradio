CREATE TABLE radio_turn_next (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('chat', 'clarify', 'single_track', 'recommendations', 'program')),
  user_message_id TEXT NOT NULL REFERENCES radio_message(id),
  assistant_message_id TEXT NOT NULL REFERENCES radio_message(id),
  track_id TEXT REFERENCES music_track(id),
  program_job_id TEXT REFERENCES program_generation_job(id),
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, idempotency_key)
);
--> statement-breakpoint
INSERT INTO radio_turn_next (
  id, profile_id, idempotency_key, decision, user_message_id,
  assistant_message_id, track_id, program_job_id, created_at
)
SELECT
  id, profile_id, idempotency_key, decision, user_message_id,
  assistant_message_id, track_id, program_job_id, created_at
FROM radio_turn;
--> statement-breakpoint
DROP TABLE radio_turn;
--> statement-breakpoint
ALTER TABLE radio_turn_next RENAME TO radio_turn;
--> statement-breakpoint
CREATE INDEX radio_turn_profile_history
  ON radio_turn (profile_id, created_at DESC, id DESC);
--> statement-breakpoint
PRAGMA user_version = 17;
