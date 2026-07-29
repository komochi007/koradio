ALTER TABLE dj_script_segment
ADD COLUMN timing_markers_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
PRAGMA user_version = 13;
