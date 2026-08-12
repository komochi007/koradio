CREATE TABLE radio_turn_recommendation (
  radio_turn_id TEXT NOT NULL REFERENCES radio_turn(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES music_track(id),
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 5),
  PRIMARY KEY (radio_turn_id, position),
  UNIQUE (radio_turn_id, track_id)
);

CREATE INDEX radio_turn_recommendation_turn_position_idx
  ON radio_turn_recommendation (radio_turn_id, position);
--> statement-breakpoint
PRAGMA user_version = 16;
