import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDbClient } from '@/lib/db/client'
import { SubsonicClient } from '@/lib/subsonic/client'
import { fetchAllSubsonicData } from '@/lib/subsonic/fetcher'
import type { SubsonicStats } from '@/lib/subsonic/db'

const CREDS_KEY = 'beatsaver-db:subsonic-creds'

export interface SubsonicCredentials {
  baseUrl: string
  username: string
  password: string
}

export type SubsonicStatus = 'idle' | 'connecting' | 'connected' | 'fetching' | 'error'

export interface SubsonicState {
  status: SubsonicStatus
  error: string | null
  stats: SubsonicStats | null
  fetchProgress: { fetched: number; total: number } | null
  credentials: SubsonicCredentials
}

function loadCredentials(): SubsonicCredentials {
  try {
    const stored = localStorage.getItem(CREDS_KEY)
    if (stored) return JSON.parse(stored) as SubsonicCredentials
  } catch {
    // ignore
  }
  return { baseUrl: '', username: '', password: '' }
}

function saveCredentials(creds: SubsonicCredentials): void {
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds))
  } catch {
    // ignore
  }
}

export function useSubsonic() {
  const queryClient = useQueryClient()
  const [credentials, setCredentials] = useState<SubsonicCredentials>(loadCredentials)
  const [status, setStatus] = useState<SubsonicStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fetchProgress, setFetchProgress] = useState<{ fetched: number; total: number } | null>(null)
  const clientRef = useRef<SubsonicClient | null>(null)

  // Stats are cached via TanStack Query — survives tab switches
  const { data: stats } = useQuery({
    queryKey: ['subsonic-stats'],
    queryFn: async () => {
      const dbClient = getDbClient()
      await dbClient.init()
      return dbClient.subsonicGetStats()
    },
    staleTime: 1000 * 60 * 5,
  })

  const updateCredentials = useCallback((creds: SubsonicCredentials) => {
    saveCredentials(creds)
    setCredentials(creds)
  }, [])

  const connect = useCallback(async () => {
    if (!credentials.baseUrl || !credentials.username || !credentials.password) {
      setError('Please fill in all fields')
      setStatus('error')
      return
    }

    setStatus('connecting')
    setError(null)

    try {
      const client = new SubsonicClient(credentials.baseUrl, credentials.username, credentials.password)
      await client.ping()
      clientRef.current = client
      setStatus('connected')
      setError(null)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [credentials])

  const fetchTracks = useCallback(async () => {
    if (!clientRef.current) {
      setError('Not connected')
      setStatus('error')
      return
    }

    setStatus('fetching')
    setError(null)
    setFetchProgress(null)

    try {
      const result = await fetchAllSubsonicData(clientRef.current, (fetched, total) => {
        setFetchProgress({ fetched, total })
      })

      const dbClient = getDbClient()
      await dbClient.subsonicImport(result.tracks, result.fetchedAt)

      // Invalidate both stats and tracks queries so the table refreshes
      await queryClient.invalidateQueries({ queryKey: ['subsonic-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['subsonic-tracks'] })

      setStatus('connected')
      setError(null)
      setFetchProgress(null)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
      setFetchProgress(null)
    }
  }, [queryClient])

  const refresh = useCallback(async () => {
    if (!clientRef.current && credentials.baseUrl) {
      await connect()
    }
    if (clientRef.current) {
      await fetchTracks()
    }
  }, [connect, fetchTracks, credentials.baseUrl])

  return {
    state: {
      status,
      error,
      stats: stats ?? null,
      fetchProgress,
      credentials,
    },
    updateCredentials,
    connect,
    fetchTracks,
    refresh,
  }
}
