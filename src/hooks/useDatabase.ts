import { useState, useEffect, useCallback, useRef } from 'react'
import { getDbClient, type DbStats } from '@/lib/db/client'
import { ensureDataLoaded, type DataLoadProgress } from '@/lib/data'

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

  const load = useCallback(async (forceRefresh: boolean = false) => {
    if (loading.current) return
    loading.current = true

    try {
      const client = getDbClient()

      setState((s) => ({ ...s, status: 'fetching', error: null }))
      await client.init()

      const stats = await client.getStats()

      // If we already have cached data and this isn't a forced refresh,
      // skip the network fetch entirely. GitHub raw doesn't expose ETag
      // headers cross-origin (no Access-Control-Expose-Headers), so the
      // ETag-based 304 check never works — every fetch downloads the full
      // ~10MB file. Instead, use the SQLite cache and only re-fetch on
      // explicit refresh.
      if (!forceRefresh && stats.songCount > 0) {
        setState({
          status: 'ready',
          error: null,
          progress: null,
          stats,
          dataChanged: false,
        })
        return
      }

      const result = await ensureDataLoaded((progress) => {
        setState((s) => ({
          ...s,
          status: progress.stage === 'parsing' ? 'parsing' : 'fetching',
          progress,
        }))
      })

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
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(() => {
    load(true)
  }, [load])

  return { state, refresh }
}
