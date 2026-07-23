/**
 * Main-thread client for the SQLite database worker.
 *
 * Provides async methods that postMessage to the worker and await responses
 * via a promise/callback registry keyed by message ID.
 */

import type { ParsedDatabase } from '../proto/schema'
import type { SongQuery } from './queries'

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
      this.worker = new Worker(
        new URL('./worker.ts', import.meta.url),
        { type: 'module' }
      )

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
        const error = new Error(
          'Database worker crashed: ' + (event.message ?? 'unknown error')
        )
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

  async getDifficulties(songMapId: number): Promise<Record<string, unknown>[]> {
    return (await this.send('difficulties', { songMapId })) as unknown as Record<string, unknown>[]
  }

  async getStats(): Promise<DbStats> {
    return (await this.send('stats', {})) as unknown as DbStats
  }

  async getMeta(key: string): Promise<string | null> {
    return (await this.send('meta', { key })) as string | null
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
