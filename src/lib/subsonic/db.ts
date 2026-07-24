/**
 * SubsonicDatabase — SQLite operations for cached Subsonic tracks.
 *
 * FCI split:
 * - trackToBindParams / computeNormalizedKey = pure data mapping (testable)
 * - SubsonicDatabase class = imperative shell (sqlite I/O)
 *
 * Shares the same SqliteDb instance as SongDatabase — no separate DB file.
 */

import { SCHEMA_SQL_SUBSONIC } from '../db/schema.sql'
import type { SqliteDb } from '../db/song-database'
import type { Child } from './types'
import { normalizeForMatching } from '../matching/normalize'
import {
  buildSubsonicQuery,
  buildSubsonicCountQuery,
  type SubsonicQuery,
} from './queries'

// ---- Pure functions (Functional Core) ----

/**
 * Compute the normalized key for a Subsonic track.
 * Used for matching against BeatSaver maps.
 */
export function computeNormalizedKey(track: { artist: string; title: string }): string {
  return normalizeForMatching(`${track.artist} ${track.title}`)
}

/**
 * Map a Subsonic Child (song) to the bind array for the INSERT statement.
 * Order must match the INSERT column list in importTracks.
 */
export function trackToBindParams(track: Child, fetchedAt: number): unknown[] {
  return [
    track.id,
    track.title,
    track.artist ?? '',
    track.album ?? null,
    track.albumId ?? null,
    track.artistId ?? null,
    track.duration ?? null,
    track.track ?? null,
    track.discNumber ?? null,
    track.year ?? null,
    track.genre ?? null,
    track.suffix ?? null,
    track.bitRate ?? null,
    track.path ?? null,
    track.coverArt ?? null,
    computeNormalizedKey({ artist: track.artist ?? '', title: track.title }),
    fetchedAt,
  ]
}

// ---- Types ----

export interface SubsonicTrackRow {
  id: string
  title: string
  artist: string
  album: string | null
  normalized_key: string
}

export interface SubsonicStats {
  trackCount: number
  fetchedAt: number | null
}

// ---- Imperative Shell ----

export class SubsonicDatabase {
  private db: SqliteDb | null = null

  /**
   * Open using an already-open DB instance (shared with SongDatabase).
   * Runs the Subsonic DDL alongside the existing schema.
   */
  open(db: SqliteDb): void {
    if (this.db) return
    this.db = db
    this.db.exec(SCHEMA_SQL_SUBSONIC)
  }

  private getDb(): SqliteDb {
    if (!this.db) throw new Error('SubsonicDatabase not initialized — call open() first')
    return this.db
  }

  /** Bulk import tracks in a transaction, replacing existing data. */
  importTracks(tracks: Child[], fetchedAt: number): void {
    const db = this.getDb()

    db.exec('BEGIN TRANSACTION')
    db.exec('DELETE FROM subsonic_tracks')
    db.exec('DELETE FROM subsonic_meta')

    // Store fetched_at in meta
    const insertMeta = db.prepare('INSERT OR REPLACE INTO subsonic_meta (key, value) VALUES (?, ?)')
    insertMeta.bind(['fetched_at', String(fetchedAt)])
    insertMeta.stepFinalize()

    // Bulk insert tracks
    const insertTrack = db.prepare(`
      INSERT OR REPLACE INTO subsonic_tracks (
        id, title, artist, album, album_id, artist_id, duration,
        track_number, disc_number, year, genre, suffix, bit_rate,
        path, cover_art, normalized_key, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const track of tracks) {
      insertTrack.bind(trackToBindParams(track, fetchedAt))
      insertTrack.stepReset()
    }
    insertTrack.finalize()

    db.exec('COMMIT')
  }

  /** Get all tracks for matching (minimal columns). */
  getAllTracks(): SubsonicTrackRow[] {
    const db = this.getDb()
    return db.exec(
      'SELECT id, title, artist, album, normalized_key FROM subsonic_tracks ORDER BY artist, title',
      { returnValue: 'resultRows', rowMode: 'object' }
    ) as unknown as SubsonicTrackRow[]
  }

  /** Query tracks with filters, sorting, and pagination. */
  queryTracks(query: SubsonicQuery): { rows: Record<string, unknown>[]; total: number } {
    const db = this.getDb()
    const filters = query.filters ?? {}

    const countBuilt = buildSubsonicCountQuery(filters)
    const total = (db.exec(countBuilt.sql, {
      bind: countBuilt.params,
      returnValue: 'resultRows',
    }) as unknown[][])[0][0] as number

    const queryBuilt = buildSubsonicQuery(query)
    const rows = db.exec(queryBuilt.sql, {
      bind: queryBuilt.params,
      returnValue: 'resultRows',
      rowMode: 'object',
    }) as Record<string, unknown>[]

    return { rows, total }
  }

  /** Get total track count. */
  getTrackCount(): number {
    const db = this.getDb()
    const rows = db.exec('SELECT COUNT(*) FROM subsonic_tracks', {
      returnValue: 'resultRows',
    }) as unknown[][]
    return rows.length > 0 ? (rows[0][0] as number) : 0
  }

  /** Get the timestamp of the last fetch. */
  getFetchedAt(): number | null {
    const db = this.getDb()
    const rows = db.exec('SELECT value FROM subsonic_meta WHERE key = ?', {
      bind: ['fetched_at'],
      returnValue: 'resultRows',
    }) as unknown[][]
    if (rows.length === 0) return null
    const val = rows[0][0] as string
    return val ? parseInt(val, 10) : null
  }

  /** Get stats for display. */
  getStats(): SubsonicStats {
    return {
      trackCount: this.getTrackCount(),
      fetchedAt: this.getFetchedAt(),
    }
  }

  /** Clear all Subsonic data. */
  clear(): void {
    const db = this.getDb()
    db.exec('DELETE FROM subsonic_tracks')
    db.exec('DELETE FROM subsonic_meta')
  }
}
