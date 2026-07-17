CREATE TABLE program (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  scenario_text TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'completed')),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX program_profile_history
ON program (profile_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE program_track (
  program_id TEXT NOT NULL REFERENCES program(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  track_id TEXT NOT NULL REFERENCES music_track(id),
  PRIMARY KEY (program_id, position)
);
--> statement-breakpoint
CREATE TABLE dj_script_segment (
  id TEXT PRIMARY KEY NOT NULL,
  program_id TEXT NOT NULL REFERENCES program(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL CHECK (type IN ('intro', 'segue', 'outro')),
  language TEXT NOT NULL CHECK (language IN ('zh-CN', 'en-GB')),
  text TEXT NOT NULL,
  display_text TEXT NOT NULL,
  estimated_timing INTEGER NOT NULL CHECK (estimated_timing IN (0, 1)),
  tts_audio_ref TEXT,
  UNIQUE (program_id, position)
);
--> statement-breakpoint
CREATE TABLE playback_timeline_item (
  id TEXT PRIMARY KEY NOT NULL,
  program_id TEXT NOT NULL REFERENCES program(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('dj', 'track')),
  segment_id TEXT REFERENCES dj_script_segment(id),
  track_id TEXT REFERENCES music_track(id),
  audio_ref TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  UNIQUE (program_id, position),
  CHECK (
    (kind = 'dj' AND segment_id IS NOT NULL AND track_id IS NULL)
    OR
    (kind = 'track' AND segment_id IS NULL AND track_id IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE TABLE playback_checkpoint (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  program_id TEXT NOT NULL REFERENCES program(id),
  timeline_item_id TEXT NOT NULL REFERENCES playback_timeline_item(id),
  position_ms INTEGER NOT NULL CHECK (position_ms >= 0),
  volume REAL NOT NULL CHECK (volume >= 0 AND volume <= 1),
  status TEXT NOT NULL CHECK (status IN ('playing', 'paused', 'completed', 'failed')),
  lease_epoch INTEGER NOT NULL CHECK (lease_epoch >= 0),
  saved_at TEXT NOT NULL
);
--> statement-breakpoint
PRAGMA user_version = 6;
