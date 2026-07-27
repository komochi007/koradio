ALTER TABLE music_track ADD COLUMN origin_mode TEXT NOT NULL DEFAULT 'live' CHECK (origin_mode IN ('live', 'mock'));
--> statement-breakpoint
ALTER TABLE playlist_source ADD COLUMN origin_mode TEXT NOT NULL DEFAULT 'live' CHECK (origin_mode IN ('live', 'mock'));
--> statement-breakpoint
ALTER TABLE program ADD COLUMN origin_mode TEXT NOT NULL DEFAULT 'live' CHECK (origin_mode IN ('live', 'mock'));
--> statement-breakpoint
UPDATE music_track
SET origin_mode = 'mock'
WHERE source = 'netease'
  AND source_track_id IN ('mock-space-song', 'mock-midnight-city', 'mock-unavailable');
--> statement-breakpoint
UPDATE playlist_source
SET origin_mode = 'mock'
WHERE EXISTS (
  SELECT 1
  FROM library_item
  JOIN music_track ON music_track.id = library_item.track_id
  WHERE library_item.playlist_source_id = playlist_source.id
    AND music_track.source = 'netease'
    AND music_track.source_track_id IN ('mock-space-song', 'mock-midnight-city', 'mock-unavailable')
)
AND NOT EXISTS (
  SELECT 1
  FROM library_item
  JOIN music_track ON music_track.id = library_item.track_id
  WHERE library_item.playlist_source_id = playlist_source.id
    AND NOT (
      music_track.source = 'netease'
      AND music_track.source_track_id IN ('mock-space-song', 'mock-midnight-city', 'mock-unavailable')
    )
);
--> statement-breakpoint
UPDATE program
SET origin_mode = 'mock'
WHERE EXISTS (
  SELECT 1
  FROM program_track
  JOIN music_track ON music_track.id = program_track.track_id
  WHERE program_track.program_id = program.id
    AND music_track.source = 'netease'
    AND music_track.source_track_id IN ('mock-space-song', 'mock-midnight-city', 'mock-unavailable')
)
AND NOT EXISTS (
  SELECT 1
  FROM program_track
  JOIN music_track ON music_track.id = program_track.track_id
  WHERE program_track.program_id = program.id
    AND NOT (
      music_track.source = 'netease'
      AND music_track.source_track_id IN ('mock-space-song', 'mock-midnight-city', 'mock-unavailable')
    )
);
--> statement-breakpoint
PRAGMA user_version = 9;
