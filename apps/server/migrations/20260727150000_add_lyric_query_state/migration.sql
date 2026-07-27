ALTER TABLE music_track ADD COLUMN lyrics_queried INTEGER NOT NULL DEFAULT 0 CHECK (lyrics_queried IN (0, 1));
--> statement-breakpoint
UPDATE music_track
SET lyrics_queried = 1
WHERE lyric_status IN ('available', 'untimed')
   OR source_track_id = 'mock-unavailable';
--> statement-breakpoint
PRAGMA user_version = 10;
