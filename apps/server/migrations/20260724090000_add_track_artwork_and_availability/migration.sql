ALTER TABLE music_track ADD COLUMN artwork_url TEXT;
--> statement-breakpoint
ALTER TABLE music_track ADD COLUMN playable INTEGER NOT NULL DEFAULT 1 CHECK (playable IN (0, 1));
--> statement-breakpoint
PRAGMA user_version = 8;
