ALTER TABLE device_settings ADD COLUMN planner_provider TEXT NOT NULL DEFAULT 'codex' CHECK (planner_provider IN ('codex', 'deepseek'));
--> statement-breakpoint
ALTER TABLE device_settings ADD COLUMN deepseek_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash' CHECK (deepseek_model IN ('deepseek-v4-flash', 'deepseek-v4-pro'));
--> statement-breakpoint
ALTER TABLE device_settings ADD COLUMN deepseek_privacy_notice_accepted INTEGER NOT NULL DEFAULT 0 CHECK (deepseek_privacy_notice_accepted IN (0, 1));
--> statement-breakpoint
PRAGMA user_version = 13;
