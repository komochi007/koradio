ALTER TABLE music_track ADD COLUMN release_year INTEGER CHECK (release_year BETWEEN 1900 AND 2100);
--> statement-breakpoint
PRAGMA user_version = 19;
