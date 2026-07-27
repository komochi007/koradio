CREATE TABLE current_program (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profile(id),
  program_id TEXT NOT NULL UNIQUE REFERENCES program(id)
);
--> statement-breakpoint
INSERT INTO current_program (profile_id, program_id)
SELECT profile_id, id
FROM program AS candidate
WHERE id = (
  SELECT id
  FROM program
  WHERE profile_id = candidate.profile_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1
);
--> statement-breakpoint
CREATE TABLE pending_file_cleanup (
  id TEXT PRIMARY KEY NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  staged_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT
);
--> statement-breakpoint
PRAGMA user_version = 11;
