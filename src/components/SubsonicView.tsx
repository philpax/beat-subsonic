import { useState, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSubsonic } from '@/hooks/useSubsonic'
import { getDbClient } from '@/lib/db/client'
import type { SubsonicTrackRow } from '@/lib/subsonic/db'
import { RefreshCw, Search, Music, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

export function SubsonicView() {
  const { state, updateCredentials, connect, fetchTracks, refresh } = useSubsonic()
  const [tracks, setTracks] = useState<SubsonicTrackRow[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Load tracks from DB
  const loadTracks = useCallback(async () => {
    try {
      const dbClient = getDbClient()
      await dbClient.init()
      const allTracks = await dbClient.subsonicGetTracks()
      setTracks(allTracks)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadTracks()
  }, [loadTracks, state.stats])

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }, [])

  const filteredTracks = debouncedSearch
    ? tracks.filter(
        (t) =>
          t.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          t.artist.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : tracks

  // Virtual scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 40,
    overscan: 10,
  })

  const fetchedDate = state.stats?.fetchedAt
    ? new Date(state.stats.fetchedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="flex h-full flex-col">
      {/* Credential form */}
      <div className="border-b p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Server URL
            </label>
            <Input
              placeholder="https://music.example.com"
              value={state.credentials.baseUrl}
              onChange={(e) =>
                updateCredentials({ ...state.credentials, baseUrl: e.target.value })
              }
              className="h-8 text-sm"
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Username
            </label>
            <Input
              placeholder="username"
              value={state.credentials.username}
              onChange={(e) =>
                updateCredentials({ ...state.credentials, username: e.target.value })
              }
              className="h-8 text-sm"
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <Input
              type="password"
              placeholder="password"
              value={state.credentials.password}
              onChange={(e) =>
                updateCredentials({ ...state.credentials, password: e.target.value })
              }
              className="h-8 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={connect}
            disabled={state.status === 'connecting'}
            className="h-8"
          >
            {state.status === 'connecting' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : state.status === 'connected' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            ) : null}
            Connect
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={fetchTracks}
            disabled={state.status !== 'connected' && state.status !== 'fetching'}
            className="h-8"
          >
            {state.status === 'fetching' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Music className="h-3.5 w-3.5" />
            )}
            Fetch All Tracks
          </Button>
          {state.stats && state.stats.trackCount > 0 && (
            <Button variant="ghost" size="sm" onClick={refresh} className="h-8">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          )}
        </div>

        {/* Status badges */}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {state.stats && (
            <span>
              {state.stats.trackCount.toLocaleString()} tracks cached
              {fetchedDate && <span className="ml-1">· fetched {fetchedDate}</span>}
            </span>
          )}
          {state.fetchProgress && (
            <span className="text-primary">
              Fetching: {state.fetchProgress.fetched.toLocaleString()} /{' '}
              {state.fetchProgress.total.toLocaleString()}
            </span>
          )}
          {state.error && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3 w-3" />
              {state.error}
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 border-b py-2 px-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tracks…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {filteredTracks.length.toLocaleString()} tracks
        </span>
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-auto" ref={tableContainerRef}>
        {filteredTracks.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {tracks.length === 0
              ? 'No tracks cached. Connect to a Subsonic server and fetch tracks.'
              : 'No tracks match your search.'}
          </div>
        ) : (
          <div className="relative">
            {/* Header */}
            <div className="sticky top-0 z-10 flex border-b bg-background">
              <div className="flex-1 px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Title
              </div>
              <div className="w-40 shrink-0 px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Artist
              </div>
              <div className="w-40 shrink-0 px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Album
              </div>
            </div>
            <div
              style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const track = filteredTracks[virtualRow.index]
                if (!track) return null
                return (
                  <div
                    key={track.id}
                    className="group flex cursor-pointer items-center border-b border-border/50 transition-colors hover:bg-muted/40"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="w-0.5 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex-1 truncate px-3 text-sm font-medium">
                      {track.title}
                    </div>
                    <div className="w-40 shrink-0 truncate px-3 text-xs text-muted-foreground">
                      {track.artist}
                    </div>
                    <div className="w-40 shrink-0 truncate px-3 text-xs text-muted-foreground">
                      {track.album ?? '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
