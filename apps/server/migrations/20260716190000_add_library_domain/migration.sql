CREATE TABLE music_track (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source = 'netease'),
  source_track_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  lyric_status TEXT NOT NULL CHECK (lyric_status IN ('available', 'untimed', 'unavailable')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX music_track_source_identity
ON music_track (source, source_track_id);
--> statement-breakpoint
CREATE TABLE playlist_source (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  source TEXT NOT NULL CHECK (source = 'netease'),
  source_playlist_id TEXT NOT NULL,
  title TEXT NOT NULL,
  available_track_count INTEGER NOT NULL CHECK (available_track_count >= 0),
  unavailable_track_count INTEGER NOT NULL CHECK (unavailable_track_count >= 0),
  imported_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX playlist_source_profile_identity
ON playlist_source (profile_id, source, source_playlist_id);
--> statement-breakpoint
CREATE TABLE library_item (
  profile_id TEXT NOT NULL REFERENCES profile(id),
  track_id TEXT NOT NULL REFERENCES music_track(id),
  playlist_source_id TEXT REFERENCES playlist_source(id),
  creation_idempotency_key TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, track_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX library_item_profile_idempotency
ON library_item (profile_id, creation_idempotency_key);
--> statement-breakpoint
CREATE TABLE playlist_import_job (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  idempotency_key TEXT NOT NULL,
  playlist_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  unavailable_count INTEGER NOT NULL DEFAULT 0 CHECK (unavailable_count >= 0),
  playlist_source_id TEXT REFERENCES playlist_source(id),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX playlist_import_job_profile_idempotency
ON playlist_import_job (profile_id, idempotency_key);
--> statement-breakpoint
PRAGMA user_version = 4;
