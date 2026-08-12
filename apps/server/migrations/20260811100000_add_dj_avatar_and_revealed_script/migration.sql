ALTER TABLE profile ADD COLUMN dj_avatar_ref TEXT;
--> statement-breakpoint
ALTER TABLE dj_script_segment ADD COLUMN revealed_at TEXT;
--> statement-breakpoint
PRAGMA user_version = 15;
