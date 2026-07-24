import { useState, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSubsonic } from '@/hooks/useSubsonic'
import { useSubsonicQuery } from '@/hooks/useSubsonicQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { SortHeader, Pagination, formatDuration, formatIsoDateTimeMs } from '@/components/table-shared'
import type { SubsonicSortKey } from '@/lib/subsonic/queries'
import {
  RefreshCw,
  Search,
  Music,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react'

const PAGE_SIZE_DEFAULT = 100

export function SubsonicView() {
  const { state, updateCredentials, connect, fetchTracks, refresh } = useSubsonic()

  // Search state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Sort state
  const [sort, setSort] = usePersistentState<SubsonicSortKey>('subsonic-sort', 'artist')
  const [sortDir, setSortDir] = usePersistentState<'asc' | 'desc'>('subsonic-sortDir', 'asc')

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePersistentState<number>('subsonic-pageSize', PAGE_SIZE_DEFAULT)

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  const { data, isLoading, error } = useSubsonicQuery({
    search: debouncedSearch,
    sort,
    sortDir,
    page,
    pageSize,
  })

  const tracks = data?.rows ?? []
  const total = data?.total ?? 0

  // Virtual scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 44,
    overscan: 10,
  })

  const handleSortClick = useCallback((key: SubsonicSortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      setSortDir('asc')
    }
  }, [sort])

  const fetchedDate = state.stats?.fetchedAt
    ? formatIsoDateTimeMs(state.stats.fetchedAt)
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b py-2 px-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tracks…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="py-2 px-3 text-sm text-destructive">{String(error)}</div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={tableContainerRef}>
        <div className="relative">
          {/* Header */}
          <div className="sticky top-0 z-10 flex border-b bg-background">
            <SortHeader label="Title" sortKey="title" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="flex-1" />
            <SortHeader label="Artist" sortKey="artist" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-44 shrink-0" />
            <SortHeader label="Album" sortKey="album" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-44 shrink-0" />
            <SortHeader label="Dur" sortKey="duration" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-12 shrink-0" />
            <SortHeader label="Year" sortKey="year" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-14 shrink-0" />
            <div className="w-28 shrink-0 px-2 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Added</div>
          </div>

          {/* Virtual rows */}
          {isLoading && tracks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : tracks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {total === 0
                ? 'No tracks cached. Connect to a Subsonic server and fetch tracks.'
                : 'No tracks match your search.'}
            </div>
          ) : (
            <div
              style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const track = tracks[virtualRow.index]
                if (!track) return null
                return (
                  <div
                    key={track.id as string}
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
                      {track.title as string}
                    </div>
                    <div className="w-44 shrink-0 truncate px-2 text-xs text-muted-foreground">
                      {track.artist as string}
                    </div>
                    <div className="w-44 shrink-0 truncate px-2 text-xs text-muted-foreground">
                      {(track.album as string) ?? '—'}
                    </div>
                    <div className="w-12 shrink-0 px-2 font-mono text-sm text-muted-foreground">
                      {track.duration ? formatDuration(track.duration as number) : '—'}
                    </div>
                    <div className="w-14 shrink-0 px-2 font-mono text-sm text-muted-foreground">
                      {(track.year as number) ?? '—'}
                    </div>
                    <div className="w-28 shrink-0 px-2 font-mono text-xs text-muted-foreground">
                      {track.fetched_at ? formatIsoDateTimeMs(track.fetched_at as number).slice(0, 10) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
      />
    </div>
  )
}
