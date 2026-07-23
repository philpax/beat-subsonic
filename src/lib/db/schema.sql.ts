/**
 * SQLite DDL schema for the BeatSaver map database.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS songs (
  map_id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  hash TEXT NOT NULL,
  bpm REAL NOT NULL,
  upvotes INTEGER NOT NULL,
  downvotes INTEGER NOT NULL,
  rating REAL NOT NULL,
  upload_time INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  song_name TEXT NOT NULL,
  song_author TEXT NOT NULL,
  level_author TEXT NOT NULL,
  uploader_name TEXT NOT NULL,
  ranked_states INTEGER NOT NULL DEFAULT 0,
  ranked_change_time INTEGER NOT NULL DEFAULT 0,
  tags INTEGER NOT NULL DEFAULT 0,
  upload_flags INTEGER NOT NULL DEFAULT 0,
  scrape_ended_time INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS difficulties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_map_id INTEGER NOT NULL REFERENCES songs(map_id),
  characteristic INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,
  stars_ss REAL NOT NULL DEFAULT 0,
  stars_bl REAL NOT NULL DEFAULT 0,
  njs REAL NOT NULL DEFAULT 0,
  bombs INTEGER NOT NULL DEFAULT 0,
  notes INTEGER NOT NULL DEFAULT 0,
  obstacles INTEGER NOT NULL DEFAULT 0,
  mods INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_diff_song ON difficulties(song_map_id);
CREATE INDEX IF NOT EXISTS idx_songs_name ON songs(song_name);
CREATE INDEX IF NOT EXISTS idx_songs_author ON songs(song_author);
CREATE INDEX IF NOT EXISTS idx_songs_uploader ON songs(uploader_name);
CREATE INDEX IF NOT EXISTS idx_songs_upload_time ON songs(upload_time);
CREATE INDEX IF NOT EXISTS idx_songs_rating ON songs(rating);
CREATE INDEX IF NOT EXISTS idx_songs_bpm ON songs(bpm);
`
