CREATE TABLE profile (
  id TEXT PRIMARY KEY NOT NULL,
  creation_idempotency_key TEXT NOT NULL,
  radio_name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar_ref TEXT,
  frequent_genres_json TEXT NOT NULL CHECK (json_valid(frequent_genres_json)),
  default_scenario TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX profile_creation_idempotency_key
ON profile (creation_idempotency_key);
--> statement-breakpoint
CREATE TABLE taste_overrides (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  tags_json TEXT NOT NULL CHECK (json_valid(tags_json)),
  avoid_rules_json TEXT NOT NULL CHECK (json_valid(avoid_rules_json)),
  scene_rules_json TEXT NOT NULL CHECK (json_valid(scene_rules_json)),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
PRAGMA user_version = 3;
