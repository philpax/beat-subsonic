import { useState, useEffect, useCallback, useRef } from 'react'
import { getDbClient, type DbStats } from '@/lib/db/client'
import { ensureDataLoaded, type DataLoadProgress } from '@/lib/data'
import { getLastDownloadTime, setLastDownloadTime } from '@/lib/data/cache'

/** Re-download the dump when the cached copy is older than this. */
const MAX_DATA_AGE_MS = 24 * 60 * 60 * 1000

/** Is the cached dump old enough to warrant a background re-download? */
export function isDataStale(lastDownload: number | null, now: number): boolean {
  if (lastDownload === null) return true
  return now - lastDownload > MAX_DATA_AGE_MS
}

export type DatabaseStatus = 'idle' | 'fetching' | 'parsing' | 'importing' | 'ready' | 'error'

export interface DatabaseState {
  status: DatabaseStatus
  error: string | null
  progress: DataLoadProgress | null
  stats: DbStats | null
  dataChanged: boolean
}

// ---- Pure function (Functional Core) ----

/**
 * Decide what to do after checking the DB cache and fetching data.
 * Returns the action the shell should take.
 */
export function planDataLoad(
  cachedSongCount: number,
  fetchResult: { changed: boolean; database?: { tagList: string[] } }
): { action: 'import'; database: { tagList: string[] } } | { action: 'use-cache' } | { action: 'skip' } {
  if (!fetchResult.changed) {
    if (cachedSongCount > 0) {
      return { action: 'use-cache' }
    }
    // ETag matched but no data in DB — shouldn't happen, but handle gracefully
    return { action: 'skip' }
  }
  if (fetchResult.database) {
    return { action: 'import', database: fetchResult.database }
  }
  return { action: 'skip' }
}

// ---- Imperative Shell ----

export function useDatabase() {
  const [state, setState] = useState<DatabaseState>({
    status: 'idle',
    error: null,
    progress: null,
    stats: null,
    dataChanged: false,
  })

  const loading = useRef(false)

  /**
   * Re-download and re-import the dump without leaving the 'ready' state —
   * the app keeps running on cached data and the stats swap in when done.
   */
  const refreshInBackground = useCallback(async (client: ReturnType<typeof getDbClient>) => {
    try {
      const result = await ensureDataLoaded()
      setLastDownloadTime(Date.now())
      if (result.changed && result.database) {
        await client.importData(result.database)
        const stats = await client.getStats()
        setState((s) => ({ ...s, stats, dataChanged: true }))
      }
    } catch (err) {
      // Non-fatal: the cached data keeps working; retry next load
      console.warn('[useDatabase] Background data refresh failed:', err)
    }
  }, [])

  const load = useCallback(async (forceRefresh: boolean = false) => {
    if (loading.current) return
    loading.current = true

    try {
      const client = getDbClient()

      setState((s) => ({ ...s, status: 'fetching', error: null }))
      await client.init()

      const stats = await client.getStats()

      // If we already have cached data and this isn't a forced refresh,
      // serve from the SQLite cache immediately. GitHub raw doesn't expose
      // ETag headers cross-origin (no Access-Control-Expose-Headers), so a
      // conditional-request freshness check isn't possible — instead, when
      // the cached dump is older than 24h, re-download it in the background
      // and swap the data in when done.
      if (!forceRefresh && stats.songCount > 0) {
        setState({
          status: 'ready',
          error: null,
          progress: null,
          stats,
          dataChanged: false,
        })
        if (isDataStale(getLastDownloadTime(), Date.now())) {
          void refreshInBackground(client)
        }
        return
      }

      const result = await ensureDataLoaded((progress) => {
        setState((s) => ({
          ...s,
          status: progress.stage === 'parsing' ? 'parsing' : 'fetching',
          progress,
        }))
      })
      setLastDownloadTime(Date.now())

      const plan = planDataLoad(stats.songCount, result)

      switch (plan.action) {
        case 'import':
          setState((s) => ({ ...s, status: 'importing' }))
          const importStats = await client.importData(result.database!)
          setState({
            status: 'ready',
            error: null,
            progress: null,
            stats: { ...importStats, tagList: plan.database.tagList },
            dataChanged: true,
          })
          break
        case 'use-cache':
          setState({
            status: 'ready',
            error: null,
            progress: null,
            stats,
            dataChanged: false,
          })
          break
        case 'skip':
          setState({
            status: 'ready',
            error: null,
            progress: null,
            stats,
            dataChanged: false,
          })
          break
      }
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        progress: null,
        stats: null,
        dataChanged: false,
      })
    } finally {
      loading.current = false
    }
  }, [refreshInBackground])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(() => {
    load(true)
  }, [load])

  return { state, refresh }
}
