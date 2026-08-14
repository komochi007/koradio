CREATE TABLE program_handoff (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  program_id TEXT NOT NULL UNIQUE REFERENCES program(id),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
PRAGMA user_version = 18;
