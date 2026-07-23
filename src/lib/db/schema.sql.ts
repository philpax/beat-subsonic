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

/** Subsonic DDL — added alongside the BeatSaver schema in the same DB. */
export const SCHEMA_SQL_SUBSONIC = `
CREATE TABLE IF NOT EXISTS subsonic_tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  album_id TEXT,
  artist_id TEXT,
  duration INTEGER,
  track_number INTEGER,
  disc_number INTEGER,
  year INTEGER,
  genre TEXT,
  suffix TEXT,
  bit_rate INTEGER,
  path TEXT,
  cover_art TEXT,
  normalized_key TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subsonic_normalized ON subsonic_tracks(normalized_key);
CREATE INDEX IF NOT EXISTS idx_subsonic_artist ON subsonic_tracks(artist);

CREATE TABLE IF NOT EXISTS subsonic_meta (key TEXT PRIMARY KEY, value TEXT);
`
