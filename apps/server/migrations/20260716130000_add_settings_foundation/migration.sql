CREATE TABLE device_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  data_root TEXT NOT NULL,
  codex_command TEXT,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE profile_preferences (
  profile_id TEXT PRIMARY KEY NOT NULL,
  theme_mode TEXT NOT NULL CHECK (theme_mode IN ('dark', 'light', 'system')),
  dj_language TEXT NOT NULL CHECK (dj_language IN ('zh-CN', 'en-GB')),
  dj_voice_style TEXT NOT NULL CHECK (dj_voice_style = 'british-soft-radio'),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE data_root_migration (
  job_id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL,
  target_data_root TEXT NOT NULL,
  backup_data_root TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (
    stage IN (
      'validating',
      'pausing',
      'checkpointing',
      'backing_up',
      'copying',
      'verifying',
      'switching',
      'restarting',
      'completed',
      'rolling_back'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'rolled_back')
  ),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX data_root_migration_idempotency_key
ON data_root_migration (idempotency_key);
--> statement-breakpoint
PRAGMA user_version = 2;
