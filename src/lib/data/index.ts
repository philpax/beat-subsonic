/**
 * Data loading orchestrator.
 *
 * FCI split:
 * - planDataLoad = pure function that decides what to do given current state
 * - ensureDataLoaded = imperative shell that executes the plan with I/O
 */

import { DATA_SOURCES } from './sources'
import type { DataSource } from './sources'
import { getStoredEtag, setStoredEtag } from './cache'
import { fetchSongData } from './fetcher'
import { parseSongDetails } from '../proto/parseSongDetails'
import type { ParsedDatabase } from '../proto/schema'

export type DataLoadStage = 'idle' | 'fetching' | 'parsing' | 'ready' | 'error'

export interface DataLoadProgress {
  stage: DataLoadStage
  bytesLoaded: number
  sourceId: string
  error?: string
}

export interface EnsureDataResult {
  changed: boolean
  database?: ParsedDatabase
  etag?: string
  source: DataSource
}

// ---- Pure functions (Functional Core) ----

/**
 * Given a fetch result and the stored ETag, decide what to do next.
 * Returns either 'skip' (304, data unchanged) or 'parse' (200, new data).
 */
export function planAfterFetch(
  fetchResult: { changed: boolean; bytes?: Uint8Array; etag?: string },
  storedEtag: string | undefined,
  source: DataSource
):
  | { action: 'skip'; result: EnsureDataResult }
  | { action: 'parse'; bytes: Uint8Array; etag?: string; source: DataSource } {
  if (!fetchResult.changed) {
    return {
      action: 'skip',
      result: { changed: false, etag: storedEtag, source },
    }
  }
  return {
    action: 'parse',
    bytes: fetchResult.bytes!,
    etag: fetchResult.etag,
    source,
  }
}

// ---- Imperative Shell ----

/**
 * Ensure the song data is loaded.
 *
 * Iterates sources (Direct first, jsDelivr fallback). For each source:
 * 1. Use that source's stored ETag for If-None-Match.
 * 2. If 304: data unchanged — skip parse/import (data is in SQLite cache).
 * 3. If 200: decompress, parse, and return the ParsedDatabase.
 */
export async function ensureDataLoaded(
  onProgress?: (progress: DataLoadProgress) => void
): Promise<EnsureDataResult> {
  let lastError: Error | null = null

  for (const source of DATA_SOURCES) {
    try {
      const storedEtag = getStoredEtag(source.id)

      onProgress?.({
        stage: 'fetching',
        bytesLoaded: 0,
        sourceId: source.id,
      })

      const fetchResult = await fetchSongData(source, storedEtag, (loaded) => {
        onProgress?.({
          stage: 'fetching',
          bytesLoaded: loaded,
          sourceId: source.id,
        })
      })

      const plan = planAfterFetch(fetchResult, storedEtag, source)

      if (plan.action === 'skip') {
        return plan.result
      }

      // Data changed — parse it
      onProgress?.({
        stage: 'parsing',
        bytesLoaded: plan.bytes.length,
        sourceId: source.id,
      })

      const database = parseSongDetails(plan.bytes)

      // Store the ETag for this source
      if (plan.etag) {
        setStoredEtag(source.id, plan.etag)
      }

      onProgress?.({
        stage: 'ready',
        bytesLoaded: plan.bytes.length,
        sourceId: source.id,
      })

      return {
        changed: true,
        database,
        etag: plan.etag,
        source,
      }
    } catch (err) {
      lastError = err as Error
      continue
    }
  }

  onProgress?.({
    stage: 'error',
    bytesLoaded: 0,
    sourceId: 'none',
    error: lastError?.message ?? 'All data sources failed',
  })

  throw lastError ?? new Error('All data sources failed')
}
