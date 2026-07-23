import { useState, useCallback, useEffect, useRef } from 'react'
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
  const [state, setState] = useState<SubsonicState>(() => ({
    status: 'idle',
    error: null,
    stats: null,
    fetchProgress: null,
    credentials: loadCredentials(),
  }))

  const clientRef = useRef<SubsonicClient | null>(null)

  // Load cached stats on mount
  const loadStats = useCallback(async () => {
    try {
      const dbClient = getDbClient()
      await dbClient.init()
      const stats = await dbClient.subsonicGetStats()
      setState((s) => ({ ...s, stats }))
    } catch {
      // DB might not be initialized yet — ignore
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const updateCredentials = useCallback((creds: SubsonicCredentials) => {
    saveCredentials(creds)
    setState((s) => ({ ...s, credentials: creds }))
  }, [])

  const connect = useCallback(async () => {
    const { baseUrl, username, password } = state.credentials
    if (!baseUrl || !username || !password) {
      setState((s) => ({ ...s, status: 'error', error: 'Please fill in all fields' }))
      return
    }

    setState((s) => ({ ...s, status: 'connecting', error: null }))

    try {
      const client = new SubsonicClient(baseUrl, username, password)
      await client.ping()
      clientRef.current = client
      setState((s) => ({ ...s, status: 'connected', error: null }))
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }, [state.credentials])

  const fetchTracks = useCallback(async () => {
    if (!clientRef.current) {
      setState((s) => ({ ...s, status: 'error', error: 'Not connected' }))
      return
    }

    setState((s) => ({ ...s, status: 'fetching', error: null, fetchProgress: null }))

    try {
      const result = await fetchAllSubsonicData(clientRef.current, (fetched, total) => {
        setState((s) => ({ ...s, fetchProgress: { fetched, total } }))
      })

      const dbClient = getDbClient()
      await dbClient.subsonicImport(result.tracks, result.fetchedAt)
      const stats = await dbClient.subsonicGetStats()

      setState((s) => ({
        ...s,
        status: 'connected',
        stats,
        fetchProgress: null,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        fetchProgress: null,
      }))
    }
  }, [])

  const refresh = useCallback(async () => {
    // Re-connect if needed, then fetch
    if (!clientRef.current && state.credentials.baseUrl) {
      await connect()
    }
    if (clientRef.current) {
      await fetchTracks()
    }
  }, [connect, fetchTracks, state.credentials.baseUrl])

  return {
    state,
    updateCredentials,
    connect,
    fetchTracks,
    refresh,
    loadStats,
  }
}
