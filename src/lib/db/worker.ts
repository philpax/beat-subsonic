/**
 * Web Worker for SQLite database operations.
 *
 * Thin message-passing wrapper around SongDatabase.
 * All DB logic lives in song-database.ts so it can be tested in Node.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SongDatabase } from './song-database'
import { SubsonicDatabase } from '../subsonic/db'
import type { ParsedDatabase } from '../proto/schema'
import type { SongQuery } from './queries'
import type { Child } from '../subsonic/types'

const songDb = new SongDatabase()
const subsonicDb = new SubsonicDatabase()

self.onmessage = async (event: MessageEvent) => {
  const { type, id, payload } = event.data

  try {
    let result: unknown

    switch (type) {
      case 'init': {
        const sqlite3 = await sqlite3InitModule()
        const useOpfs = SongDatabase.isOpfsAvailable(sqlite3)
        songDb.open(sqlite3, useOpfs)
        // Share the same DB instance for Subsonic tables
        // Access the internal db via a method — we need to expose it
        // For now, re-open with the same sqlite3 instance
        subsonicDb.open(songDb.getDbHandle())
        result = songDb.getFullStats()
        break
      }
      case 'import': {
        songDb.importData(payload as ParsedDatabase)
        result = songDb.getStats()
        break
      }
      case 'query':
        result = songDb.querySongs(payload as SongQuery)
        break
      case 'difficulties':
        result = songDb.getDifficulties(payload.songMapId as number)
        break
      case 'meta':
        result = songDb.getMeta(payload.key as string)
        break
      case 'stats':
        result = songDb.getFullStats()
        break
      // Subsonic operations
      case 'subsonic-import': {
        const { tracks, fetchedAt } = payload as { tracks: Child[]; fetchedAt: number }
        subsonicDb.importTracks(tracks, fetchedAt)
        result = subsonicDb.getStats()
        break
      }
      case 'subsonic-tracks':
        result = subsonicDb.getAllTracks()
        break
      case 'subsonic-stats':
        result = subsonicDb.getStats()
        break
      case 'subsonic-clear':
        subsonicDb.clear()
        result = null
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
