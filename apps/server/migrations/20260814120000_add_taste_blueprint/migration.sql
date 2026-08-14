CREATE TABLE taste_blueprint (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  version TEXT NOT NULL,
  source_label TEXT NOT NULL,
  summary TEXT NOT NULL,
  blueprint_json TEXT NOT NULL CHECK (json_valid(blueprint_json)),
  feedback_baseline_replay_order INTEGER NOT NULL CHECK (feedback_baseline_replay_order >= 0),
  learning_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
PRAGMA user_version = 18;
