CREATE TABLE profile_preferences_next (
  profile_id TEXT PRIMARY KEY NOT NULL,
  theme_mode TEXT NOT NULL CHECK (theme_mode IN ('dark', 'light', 'system')),
  dj_language TEXT NOT NULL CHECK (dj_language IN ('zh-CN', 'en-GB')),
  dj_voice_style TEXT NOT NULL CHECK (dj_voice_style = 'natural-radio'),
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO profile_preferences_next (
  profile_id,
  theme_mode,
  dj_language,
  dj_voice_style,
  updated_at
)
SELECT
  profile_id,
  theme_mode,
  dj_language,
  'natural-radio',
  updated_at
FROM profile_preferences;
--> statement-breakpoint
DROP TABLE profile_preferences;
--> statement-breakpoint
ALTER TABLE profile_preferences_next RENAME TO profile_preferences;
--> statement-breakpoint
PRAGMA user_version = 12;
