ALTER TABLE taste_overrides
ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
--> statement-breakpoint
CREATE TABLE taste_projection (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  tags_json TEXT NOT NULL CHECK (json_valid(tags_json)),
  affinities_json TEXT NOT NULL CHECK (json_valid(affinities_json)),
  avoid_signals_json TEXT NOT NULL CHECK (json_valid(avoid_signals_json)),
  source_version INTEGER NOT NULL CHECK (source_version >= 0),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO taste_projection (
  profile_id,
  tags_json,
  affinities_json,
  avoid_signals_json,
  source_version,
  updated_at
)
SELECT id, '[]', '[]', '[]', 0, created_at
FROM profile;
--> statement-breakpoint
CREATE TABLE feedback_event (
  replay_order INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  target_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'track_liked',
      'track_like_removed',
      'track_disliked',
      'track_dislike_removed',
      'program_favorited',
      'program_favorite_removed',
      'track_skipped'
    )
  ),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX feedback_event_profile_idempotency
ON feedback_event (profile_id, idempotency_key);
--> statement-breakpoint
CREATE INDEX feedback_event_profile_replay
ON feedback_event (profile_id, replay_order);
--> statement-breakpoint
PRAGMA user_version = 5;
