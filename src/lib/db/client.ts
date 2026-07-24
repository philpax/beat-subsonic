/**
 * Main-thread client for the SQLite database worker.
 *
 * Provides async methods that postMessage to the worker and await responses
 * via a promise/callback registry keyed by message ID.
 */

import type { ParsedDatabase } from '../proto/schema'
import type { SongQuery } from './queries'
import type { Child } from '../subsonic/types'
import type { SubsonicStats, SubsonicTrackRow } from '../subsonic/db'
import type { SubsonicQuery } from '../subsonic/queries'

interface WorkerResponse {
  type: 'result' | 'error'
  id: string
  result?: unknown
  error?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export interface DbStats {
  songCount: number
  scrapeTime: number | null
  tagList: string[]
}

export interface QueryResult {
  rows: Record<string, unknown>[]
  total: number
}

export class DbClient {
  private worker: Worker | null = null
  private pending = new Map<string, PendingRequest>()
  private messageId = 0
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { type, id, result, error } = event.data
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)

        if (type === 'error') {
          pending.reject(new Error(error ?? 'Unknown worker error'))
        } else {
          pending.resolve(result)
        }
      }

      this.worker.onerror = (event) => {
        console.error('[db-client] Worker error:', event)
        const error = new Error('Database worker crashed: ' + (event.message ?? 'unknown error'))
        for (const [, pending] of this.pending) {
          pending.reject(error)
        }
        this.pending.clear()
      }

      // Initialize the database
      await this.send('init', {})
    })()

    return this.initPromise
  }

  async importData(data: ParsedDatabase): Promise<DbStats> {
    const result = await this.send('import', data)
    return result as unknown as DbStats
  }

  async querySongs(query: SongQuery): Promise<QueryResult> {
    return (await this.send('query', query)) as unknown as QueryResult
  }

  /** Fetch every song row, unpaginated (querySongs caps pageSize at 500). */
  async getAllSongs(): Promise<Record<string, unknown>[]> {
    return (await this.send('all-songs', {})) as unknown as Record<string, unknown>[]
  }

  async getDifficulties(songMapId: number): Promise<Record<string, unknown>[]> {
    return (await this.send('difficulties', { songMapId })) as unknown as Record<string, unknown>[]
  }

  async getStats(): Promise<DbStats> {
    return (await this.send('stats', {})) as unknown as DbStats
  }

  async getMeta(key: string): Promise<string | null> {
    return (await this.send('meta', { key })) as string | null
  }

  // ---- Subsonic operations ----

  async subsonicImport(tracks: Child[], fetchedAt: number): Promise<SubsonicStats> {
    return (await this.send('subsonic-import', { tracks, fetchedAt })) as unknown as SubsonicStats
  }

  async subsonicGetTracks(): Promise<SubsonicTrackRow[]> {
    return (await this.send('subsonic-tracks', {})) as unknown as SubsonicTrackRow[]
  }

  async subsonicQueryTracks(
    query: SubsonicQuery,
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    return (await this.send('subsonic-query', query)) as unknown as {
      rows: Record<string, unknown>[]
      total: number
    }
  }

  async subsonicGetStats(): Promise<SubsonicStats> {
    return (await this.send('subsonic-stats', {})) as unknown as SubsonicStats
  }

  async subsonicClear(): Promise<void> {
    await this.send('subsonic-clear', {})
  }

  private send(type: string, payload: unknown): Promise<unknown> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'))
    }

    const id = String(++this.messageId)

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ type, id, payload })
    })
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.pending.clear()
    this.initPromise = null
  }
}

// Singleton instance
let dbClient: DbClient | null = null

export function getDbClient(): DbClient {
  if (!dbClient) {
    dbClient = new DbClient()
  }
  return dbClient
}
