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

export function useDatabase() {
  const [state, setState] = useState<DatabaseState>({
    status: 'idle',
    error: null,
    progress: null,
    stats: null,
    dataChanged: false,
  })

  const loading = useRef(false)

  const load = useCallback(async () => {
    if (loading.current) return
    loading.current = true

    try {
      const client = getDbClient()

      // Initialize the database worker
      setState((s) => ({ ...s, status: 'fetching', error: null }))
      await client.init()

      // Check if data is already cached
      const stats = await client.getStats()

      if (stats.songCount > 0) {
        // Data already in SQLite — check if ETag changed
        const result = await ensureDataLoaded((progress) => {
          setState((s) => ({
            ...s,
            status: progress.stage === 'parsing' ? 'parsing' : 'fetching',
            progress,
          }))
        })

        if (result.changed && result.database) {
          // New data — re-import
          setState((s) => ({ ...s, status: 'importing' }))
          const importStats = await client.importData(result.database)
          setState({
            status: 'ready',
            error: null,
            progress: null,
            stats: { ...importStats, tagList: result.database.tagList },
            dataChanged: true,
          })
        } else {
          // Data unchanged — use cached
          setState({
            status: 'ready',
            error: null,
            progress: null,
            stats,
            dataChanged: false,
          })
        }
      } else {
        // No cached data — fetch and import
        const result = await ensureDataLoaded((progress) => {
          setState((s) => ({
            ...s,
            status: progress.stage === 'parsing' ? 'parsing' : 'fetching',
            progress,
          }))
        })

        if (result.database) {
          setState((s) => ({ ...s, status: 'importing' }))
          const importStats = await client.importData(result.database)
          setState({
            status: 'ready',
            error: null,
            progress: null,
            stats: { ...importStats, tagList: result.database.tagList },
            dataChanged: true,
          })
        } else {
          // ETag matched but no data in DB — shouldn't happen, but handle gracefully
          setState({
            status: 'ready',
            error: null,
            progress: null,
            stats,
            dataChanged: false,
          })
        }
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
    load()
  }, [load])

  return { state, refresh }
}
