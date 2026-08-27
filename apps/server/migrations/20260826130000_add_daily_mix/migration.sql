CREATE TABLE daily_mix (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  local_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  stage TEXT NOT NULL CHECK (stage IN ('queued', 'planning', 'resolving_tracks', 'committing', 'completed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_code TEXT,
  generated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, local_date),
  CHECK (
    (status = 'succeeded' AND stage = 'completed' AND generated_at IS NOT NULL)
    OR
    (status <> 'succeeded' AND generated_at IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX daily_mix_profile_history
ON daily_mix (profile_id, local_date DESC, id DESC);
--> statement-breakpoint
CREATE TABLE daily_mix_track (
  daily_mix_id TEXT NOT NULL REFERENCES daily_mix(id),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 20),
  track_id TEXT NOT NULL REFERENCES music_track(id),
  bucket TEXT NOT NULL CHECK (bucket IN ('library', 'close', 'adjacent', 'surprise')),
  PRIMARY KEY (daily_mix_id, position),
  UNIQUE (daily_mix_id, track_id)
);
--> statement-breakpoint
CREATE TABLE daily_mix_checkpoint (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  daily_mix_id TEXT NOT NULL REFERENCES daily_mix(id),
  track_id TEXT NOT NULL REFERENCES music_track(id),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 20),
  position_ms INTEGER NOT NULL CHECK (position_ms >= 0),
  volume REAL NOT NULL CHECK (volume >= 0 AND volume <= 1),
  status TEXT NOT NULL CHECK (status IN ('playing', 'paused', 'completed', 'failed')),
  lease_epoch INTEGER NOT NULL CHECK (lease_epoch >= 0),
  saved_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE playback_source_session (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  active_kind TEXT NOT NULL CHECK (active_kind IN ('program', 'daily')),
  program_id TEXT REFERENCES program(id),
  daily_mix_id TEXT REFERENCES daily_mix(id),
  updated_at TEXT NOT NULL,
  CHECK (
    (active_kind = 'program' AND program_id IS NOT NULL)
    OR
    (active_kind = 'daily' AND daily_mix_id IS NOT NULL)
  )
);
--> statement-breakpoint
PRAGMA user_version = 20;
