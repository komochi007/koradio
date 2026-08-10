ALTER TABLE program ADD COLUMN playback_mode TEXT NOT NULL DEFAULT 'sequential' CHECK (playback_mode IN ('sequential', 'voice-overlay'));
--> statement-breakpoint
CREATE TABLE radio_message (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  track_id TEXT REFERENCES music_track(id),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX radio_message_profile_history
ON radio_message (profile_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE radio_turn (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('chat', 'clarify', 'single_track', 'program')),
  user_message_id TEXT NOT NULL REFERENCES radio_message(id),
  assistant_message_id TEXT NOT NULL REFERENCES radio_message(id),
  track_id TEXT REFERENCES music_track(id),
  program_job_id TEXT REFERENCES program_generation_job(id),
  created_at TEXT NOT NULL,
  UNIQUE (profile_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX radio_turn_profile_history
ON radio_turn (profile_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE radio_speech_generation (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  message_id TEXT NOT NULL REFERENCES radio_message(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  audio_ref TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX radio_speech_generation_profile_history
ON radio_speech_generation (profile_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE dj_citation (
  id TEXT PRIMARY KEY NOT NULL,
  segment_id TEXT NOT NULL REFERENCES dj_script_segment(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('musicbrainz', 'wikimedia')),
  UNIQUE (segment_id, position)
);
--> statement-breakpoint
PRAGMA user_version = 14;
