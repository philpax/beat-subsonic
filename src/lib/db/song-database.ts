/**
 * SongDatabase — the core database operations, decoupled from the Web Worker.
 *
 * FCI split:
 * - songToBindParams / difficultyToBindParams = pure data mapping (testable)
 * - SongDatabase class = imperative shell (sqlite I/O)
 *
 * This class can be used:
 * - In a Web Worker (via worker.ts)
 * - Directly in Node tests (via the sqlite-wasm Node entry point)
 */

import { SCHEMA_SQL } from './schema.sql'
import type { ParsedDatabase, ParsedSong, ParsedDifficulty } from '../proto/schema'
import { buildSongQuery, buildCountQuery, buildDifficultiesQuery, type SongQuery } from './queries'

/** Minimal interface for the sqlite-wasm Database we depend on. */
export interface SqliteDb {
  exec(sql: string, opts?: Record<string, unknown>): unknown
  prepare(sql: string): PreparedStatement
  close(): void
}

export interface PreparedStatement {
  bind(params: unknown[]): this
  step(): boolean
  stepReset(): this
  stepFinalize(): boolean
  finalize(): void
  reset(alsoClearBinds?: boolean): this
  columnCount: number
  parameterCount: number
}

export interface QueryResult {
  rows: Record<string, unknown>[]
  total: number
}

export interface DbStats {
  songCount: number
  scrapeTime: number | null
  tagList: string[]
}

export interface ImportResult {
  songCount: number
  difficultyCount: number
}

const DB_FILENAME = 'beatsaver-maps.sqlite3'

// ---- Pure functions (Functional Core) ----

/** Map a ParsedSong to the bind array for the songs INSERT statement. */
export function songToBindParams(song: ParsedSong, scrapeEndedTime: number): unknown[] {
  return [
    song.mapId,
    song.key,
    song.hash,
    song.bpm,
    song.upvotes,
    song.downvotes,
    song.rating,
    song.uploadTime,
    song.duration,
    song.songName,
    song.songAuthor,
    song.levelAuthor,
    song.uploaderName,
    song.rankedStates,
    song.rankedChangeTime,
    song.tags,
    song.uploadFlags,
    scrapeEndedTime,
  ]
}

/** Map a ParsedDifficulty to the bind array for the difficulties INSERT statement. */
export function difficultyToBindParams(diff: ParsedDifficulty): unknown[] {
  return [
    diff.songMapId,
    diff.characteristic,
    diff.difficulty,
    diff.starsSs,
    diff.starsBl,
    diff.njs,
    diff.bombs,
    diff.notes,
    diff.obstacles,
    diff.mods,
  ]
}

/** Build the meta key-value pairs to insert for a given ParsedDatabase. */
export function buildMetaEntries(data: ParsedDatabase): [string, string][] {
  return [
    ['scrape_ended_time', String(data.scrapeEndedTime)],
    ['tag_list', JSON.stringify(data.tagList)],
  ]
}

// ---- Imperative Shell ----

/** Which persistence backend the database ended up on. */
export type DbBackend = 'opfs-sahpool' | 'opfs' | 'memory'

/**
 * Open the most persistent SQLite backend available, in order:
 *
 * 1. OPFS SyncAccessHandle Pool VFS — persistent, works in any dedicated
 *    worker WITHOUT cross-origin isolation (no SharedArrayBuffer), so it
 *    survives reloads even on plain static hosting.
 * 2. Classic OPFS VFS — persistent, but requires COOP/COEP headers
 *    (crossOriginIsolated) for its SharedArrayBuffer-based proxy.
 * 3. In-memory — last resort; data is refetched every page load.
 */
export async function openBestDb(sqlite3: any): Promise<{ db: SqliteDb; backend: DbBackend }> {
  try {
    const poolUtil = await sqlite3.installOpfsSAHPoolVfs({})
    return { db: new poolUtil.OpfsSAHPoolDb(DB_FILENAME) as SqliteDb, backend: 'opfs-sahpool' }
  } catch {
    // OPFS unavailable (no createSyncAccessHandle, or another tab holds
    // the pool's access handles) — fall through
  }

  try {
    if (sqlite3.oo1?.OpfsDb) {
      return { db: new sqlite3.oo1.OpfsDb(DB_FILENAME, 'cw') as SqliteDb, backend: 'opfs' }
    }
  } catch {
    // fall through
  }

  return { db: new sqlite3.oo1.DB(':memory:') as SqliteDb, backend: 'memory' }
}

export class SongDatabase {
  private db: SqliteDb | null = null

  /** Attach an opened database handle and ensure the schema exists. */
  open(db: SqliteDb): void {
    if (this.db) return
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  private getDb(): SqliteDb {
    if (!this.db) throw new Error('Database not initialized — call open() first')
    return this.db
  }

  importData(data: ParsedDatabase): ImportResult {
    const db = this.getDb()

    db.exec('BEGIN TRANSACTION')
    db.exec('DELETE FROM difficulties')
    db.exec('DELETE FROM songs')
    db.exec('DELETE FROM meta')

    // Insert meta entries
    const insertMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    const metaEntries = buildMetaEntries(data)
    for (let i = 0; i < metaEntries.length; i++) {
      const [key, value] = metaEntries[i]
      insertMeta.bind([key, value])
      if (i < metaEntries.length - 1) {
        insertMeta.stepReset()
      } else {
        insertMeta.stepFinalize()
      }
    }

    // Bulk insert songs
    const insertSong = db.prepare(`
      INSERT OR REPLACE INTO songs (
        map_id, key, hash, bpm, upvotes, downvotes, rating,
        upload_time, duration, song_name, song_author, level_author,
        uploader_name, ranked_states, ranked_change_time, tags,
        upload_flags, scrape_ended_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const song of data.songs) {
      insertSong.bind(songToBindParams(song, data.scrapeEndedTime))
      insertSong.stepReset()
    }
    insertSong.finalize()

    // Bulk insert difficulties
    const insertDiff = db.prepare(`
      INSERT INTO difficulties (
        song_map_id, characteristic, difficulty, stars_ss, stars_bl,
        njs, bombs, notes, obstacles, mods
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const diff of data.difficulties) {
      insertDiff.bind(difficultyToBindParams(diff))
      insertDiff.stepReset()
    }
    insertDiff.finalize()

    db.exec('COMMIT')

    const songCount = (
      db.exec('SELECT COUNT(*) FROM songs', { returnValue: 'resultRows' }) as unknown[][]
    )[0][0] as number
    const difficultyCount = (
      db.exec('SELECT COUNT(*) FROM difficulties', { returnValue: 'resultRows' }) as unknown[][]
    )[0][0] as number

    return { songCount, difficultyCount }
  }

  querySongs(query: SongQuery): QueryResult {
    const db = this.getDb()
    const filters = query.filters ?? {}
    const countBuilt = buildCountQuery(filters)
    const total = (
      db.exec(countBuilt.sql, {
        bind: countBuilt.params,
        returnValue: 'resultRows',
      }) as unknown[][]
    )[0][0] as number

    const queryBuilt = buildSongQuery(query)
    const rows = db.exec(queryBuilt.sql, {
      bind: queryBuilt.params,
      returnValue: 'resultRows',
      rowMode: 'object',
    }) as Record<string, unknown>[]

    return { rows, total }
  }

  /**
   * Fetch every song row, unpaginated — for the matching engine, which
   * needs the full map set (querySongs caps pageSize at 500 for the UI).
   */
  getAllSongs(): Record<string, unknown>[] {
    const db = this.getDb()
    return db.exec('SELECT * FROM songs', {
      returnValue: 'resultRows',
      rowMode: 'object',
    }) as Record<string, unknown>[]
  }

  getDifficulties(songMapId: number): Record<string, unknown>[] {
    const db = this.getDb()
    const built = buildDifficultiesQuery(songMapId)
    return db.exec(built.sql, {
      bind: built.params,
      returnValue: 'resultRows',
      rowMode: 'object',
    }) as Record<string, unknown>[]
  }

  getMeta(key: string): string | null {
    const db = this.getDb()
    const rows = db.exec('SELECT value FROM meta WHERE key = ?', {
      bind: [key],
      returnValue: 'resultRows',
    }) as unknown[][]
    return rows.length > 0 ? (rows[0][0] as string) : null
  }

  getStats(): { songCount: number; scrapeTime: number | null } {
    const db = this.getDb()
    const songCount = (
      db.exec('SELECT COUNT(*) FROM songs', {
        returnValue: 'resultRows',
      }) as unknown[][]
    )[0][0] as number
    const scrapeTimeStr = this.getMeta('scrape_ended_time')
    return {
      songCount,
      scrapeTime: scrapeTimeStr ? parseInt(scrapeTimeStr, 10) : null,
    }
  }

  getFullStats(): DbStats {
    const stats = this.getStats()
    const tagListStr = this.getMeta('tag_list')
    return {
      ...stats,
      tagList: tagListStr ? JSON.parse(tagListStr) : [],
    }
  }

  /** Get the underlying SqliteDb instance (for sharing with SubsonicDatabase). */
  getDbHandle(): SqliteDb {
    return this.getDb()
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}
