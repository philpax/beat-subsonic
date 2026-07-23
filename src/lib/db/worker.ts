/**
 * Web Worker for SQLite database operations.
 *
 * Thin message-passing wrapper around SongDatabase.
 * All DB logic lives in song-database.ts so it can be tested in Node.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SongDatabase } from './song-database'
import type { ParsedDatabase } from '../proto/schema'
import type { SongQuery } from './queries'

const songDb = new SongDatabase()

self.onmessage = async (event: MessageEvent) => {
  const { type, id, payload } = event.data

  try {
    let result: unknown

    switch (type) {
      case 'init': {
        const sqlite3 = await sqlite3InitModule()
        const useOpfs = SongDatabase.isOpfsAvailable(sqlite3)
        songDb.open(sqlite3, useOpfs)
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
