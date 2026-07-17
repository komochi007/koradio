CREATE TABLE program_generation_job (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profile(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  stage TEXT NOT NULL CHECK (
    stage IN (
      'queued',
      'planning',
      'resolving_tracks',
      'enriching_tracks',
      'synthesizing_dj',
      'committing',
      'completed'
    )
  ),
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  program_id TEXT REFERENCES program(id),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, idempotency_key),
  CHECK (
    (status = 'succeeded' AND stage = 'completed' AND program_id IS NOT NULL)
    OR
    (status <> 'succeeded' AND program_id IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX program_generation_one_active_per_profile
ON program_generation_job (profile_id)
WHERE status IN ('queued', 'running');
--> statement-breakpoint
CREATE INDEX program_generation_profile_history
ON program_generation_job (profile_id, created_at DESC, id DESC);
--> statement-breakpoint
PRAGMA user_version = 7;
