/**
 * Web Worker for SQLite database operations.
 *
 * Uses @sqlite.org/sqlite-wasm with OPFS-backed persistence when available,
 * falling back to in-memory.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SCHEMA_SQL } from './schema.sql'
import type { ParsedDatabase } from '../proto/schema'
import {
  buildSongQuery,
  buildCountQuery,
  buildDifficultiesQuery,
  type SongQuery,
} from './queries'

let db: any = null
let sqlite3: any = null

const DB_FILENAME = 'beatsaver-maps.sqlite3'

async function initDb(): Promise<void> {
  if (db) return

  sqlite3 = await sqlite3InitModule()

  // Try OPFS first, fall back to in-memory
  let useOpfs = false
  try {
    if (sqlite3.oo1.OpfsDatabase) {
      // Test if OPFS is actually available
      const testDb = new sqlite3.oo1.OpfsDatabase(':test-opfs-availability:')
      testDb.close()
      useOpfs = true
    }
  } catch {
    useOpfs = false
  }

  if (useOpfs) {
    db = new sqlite3.oo1.OpfsDatabase(DB_FILENAME, 'cw')
    console.log('[db-worker] Using OPFS-backed SQLite')
  } else {
    db = new sqlite3.oo1.Database(':memory:')
    console.log('[db-worker] Using in-memory SQLite (OPFS not available)')
  }

  // Run schema DDL
  db.exec(SCHEMA_SQL)
}

async function importData(data: ParsedDatabase): Promise<{ songCount: number; difficultyCount: number }> {
  if (!db) throw new Error('Database not initialized')

  // Clear existing data and re-import
  db.exec('DELETE FROM difficulties')
  db.exec('DELETE FROM songs')
  db.exec('DELETE FROM meta')

  // Store scrape metadata
  const insertMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
  insertMeta.bind(['scrape_ended_time', String(data.scrapeEndedTime)])
  insertMeta.stepFinalize()

  // Store tag list as JSON
  insertMeta.bind(['tag_list', JSON.stringify(data.tagList)])
  insertMeta.stepFinalize()
  insertMeta.finalize()

  // Bulk insert songs in a transaction
  db.exec('BEGIN TRANSACTION')

  const insertSong = db.prepare(`
    INSERT OR REPLACE INTO songs (
      map_id, key, hash, bpm, upvotes, downvotes, rating,
      upload_time, duration, song_name, song_author, level_author,
      uploader_name, ranked_states, ranked_change_time, tags,
      upload_flags, scrape_ended_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const song of data.songs) {
    insertSong.bind([
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
      data.scrapeEndedTime,
    ])
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
    insertDiff.bind([
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
    ])
    insertDiff.stepReset()
  }
  insertDiff.finalize()

  db.exec('COMMIT')

  const songCount = db.exec('SELECT COUNT(*) FROM songs', { returnValue: 'resultRows' })[0][0]
  const difficultyCount = db.exec('SELECT COUNT(*) FROM difficulties', { returnValue: 'resultRows' })[0][0]

  return { songCount, difficultyCount }
}

interface QueryResult {
  rows: Record<string, unknown>[]
  total: number
}

async function querySongs(query: SongQuery): Promise<QueryResult> {
  if (!db) throw new Error('Database not initialized')

  const filters = query.filters ?? {}
  const countBuilt = buildCountQuery(filters)
  const total = db.exec(countBuilt.sql, {
    bind: countBuilt.params,
    returnValue: 'resultRows',
  })[0][0]

  const queryBuilt = buildSongQuery(query)
  const rows = db.exec(queryBuilt.sql, {
    bind: queryBuilt.params,
    returnValue: 'resultRows',
    rowMode: 'object',
  })

  return { rows, total }
}

async function getDifficulties(songMapId: number): Promise<Record<string, unknown>[]> {
  if (!db) throw new Error('Database not initialized')
  const built = buildDifficultiesQuery(songMapId)
  return db.exec(built.sql, {
    bind: built.params,
    returnValue: 'resultRows',
    rowMode: 'object',
  })
}

async function getMeta(key: string): Promise<string | null> {
  if (!db) throw new Error('Database not initialized')
  const rows = db.exec('SELECT value FROM meta WHERE key = ?', {
    bind: [key],
    returnValue: 'resultRows',
  })
  return rows.length > 0 ? rows[0][0] : null
}

async function getStats(): Promise<{ songCount: number; scrapeTime: number | null }> {
  if (!db) throw new Error('Database not initialized')
  const songCount = db.exec('SELECT COUNT(*) FROM songs', {
    returnValue: 'resultRows',
  })[0][0]
  const scrapeTimeStr = await getMeta('scrape_ended_time')
  return {
    songCount,
    scrapeTime: scrapeTimeStr ? parseInt(scrapeTimeStr, 10) : null,
  }
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const { type, id, payload } = event.data

  try {
    let result: unknown

    switch (type) {
      case 'init':
        await initDb()
        const stats = await getStats()
        const tagListStr = await getMeta('tag_list')
        result = {
          ...stats,
          tagList: tagListStr ? JSON.parse(tagListStr) : [],
        }
        break
      case 'import':
        await importData(payload as ParsedDatabase)
        const importStats = await getStats()
        result = importStats
        break
      case 'query':
        result = await querySongs(payload as SongQuery)
        break
      case 'difficulties':
        result = await getDifficulties(payload.songMapId as number)
        break
      case 'meta':
        result = await getMeta(payload.key as string)
        break
      case 'stats':
        result = await getStats()
        break
      default:
        throw new Error(`Unknown message type: ${type}`)
    }

    self.postMessage({ type: 'result', id, result })
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
