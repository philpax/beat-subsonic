/**
 * Data loading orchestrator.
 *
 * Iterates data sources (Direct first, jsDelivr fallback), using ETag-based
 * change detection. If a source returns 304 (unchanged), the data is already
 * cached in SQLite and we skip re-parse/re-import entirely.
 */

import { DATA_SOURCES } from './sources'
import type { DataSource } from './sources'
import { fetchSongData, type FetchResult } from './fetcher'
import { getStoredEtag, setStoredEtag } from './cache'
import { parseSongDetails } from '../proto/parseSongDetails'
import type { ParsedDatabase } from '../proto/schema'

export type DataLoadStage = 'idle' | 'fetching' | 'parsing' | 'ready' | 'error'

export interface DataLoadProgress {
  stage: DataLoadStage
  /** Compressed bytes downloaded so far (for progress display) */
  bytesLoaded: number
  /** Source currently being fetched */
  sourceId: string
  /** Error message if stage === 'error' */
  error?: string
}

export interface EnsureDataResult {
  /** True if new data was fetched and parsed */
  changed: boolean
  /** The parsed database (only present when changed === true) */
  database?: ParsedDatabase
  /** The ETag of the current data */
  etag?: string
  /** The source that was used */
  source: DataSource
}

/**
 * Ensure the song data is loaded.
 *
 * Iterates sources (Direct first, jsDelivr fallback). For each source:
 * 1. Use that source's stored ETag for If-None-Match.
 * 2. If 304: data unchanged — skip parse/import (data is in SQLite cache).
 * 3. If 200: decompress, parse, and return the ParsedDatabase.
 *
 * On success, stores the ETag for the source that worked.
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

      const result = await fetchSongData(source, storedEtag, (loaded) => {
        onProgress?.({
          stage: 'fetching',
          bytesLoaded: loaded,
          sourceId: source.id,
        })
      })

      if (!result.changed) {
        // 304 — data unchanged, SQLite cache is valid
        return {
          changed: false,
          etag: storedEtag,
          source,
        }
      }

      // Data changed — parse it
      onProgress?.({
        stage: 'parsing',
        bytesLoaded: result.bytes?.length ?? 0,
        sourceId: source.id,
      })

      const database = parseSongDetails(result.bytes!)

      // Store the ETag for this source
      if (result.etag) {
        setStoredEtag(source.id, result.etag)
      }

      onProgress?.({
        stage: 'ready',
        bytesLoaded: result.bytes?.length ?? 0,
        sourceId: source.id,
      })

      return {
        changed: true,
        database,
        etag: result.etag,
        source,
      }
    } catch (err) {
      lastError = err as Error
      // Try the next source
      continue
    }
  }

  // All sources failed
  onProgress?.({
    stage: 'error',
    bytesLoaded: 0,
    sourceId: 'none',
    error: lastError?.message ?? 'All data sources failed',
  })

  throw lastError ?? new Error('All data sources failed')
}
