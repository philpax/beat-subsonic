import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { OneClickButton } from '@/components/OneClickButton'
import { useMatchData } from '@/hooks/useMatchData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { Pagination } from '@/components/table-shared'
import { ChevronDown, ChevronRight, Loader2, AlertCircle, Search, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PAGE_SIZE_DEFAULT = 50

export function MatchView() {
  const { state, threshold, runMatch, updateThreshold } = useMatchData()
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePersistentState<number>('match-pageSize', PAGE_SIZE_DEFAULT)

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

  const filteredResults = state.results.filter((r) => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      if (
        !r.track.title.toLowerCase().includes(q) &&
        !r.track.artist.toLowerCase().includes(q)
      )
        return false
    }
    if (minScore > 0) {
      const bestScore = r.matches[0]?.score ?? 0
      if (bestScore < minScore / 100) return false
    }
    return true
  })

  // Pagination — slice the filtered results
  const total = filteredResults.length
  const pageResults = filteredResults.slice((page - 1) * pageSize, page * pageSize)

  const toggleRow = useCallback((index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const coveragePct =
    state.totalTracks > 0
      ? ((state.matchedTracks / state.totalTracks) * 100).toFixed(1)
      : '0.0'

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search matched tracks…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Min Score
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-24"
          />
          <span className="font-mono text-xs text-muted-foreground w-8">{minScore}%</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Threshold
          </label>
          <input
            type="range"
            min="50"
            max="100"
            value={Math.round(threshold * 100)}
            onChange={(e) => updateThreshold(Number(e.target.value) / 100)}
            className="w-24"
          />
          <span className="font-mono text-xs text-muted-foreground w-8">
            {Math.round(threshold * 100)}%
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runMatch()}
          disabled={state.status === 'loading'}
          className="h-8"
        >
          {state.status === 'loading' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Re-match
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>{state.matchedTracks.toLocaleString()} matched tracks</span>
        <span>·</span>
        <span>{state.totalTracks.toLocaleString()} total tracks</span>
        <span>·</span>
        <span>{coveragePct}% coverage</span>
        <span>·</span>
        <span>{state.totalMaps.toLocaleString()} BeatSaver maps</span>
        {state.progress && state.status === 'loading' && (
          <span className="text-primary">
            · {state.progress.phase === 'building-keys'
              ? `Building keys: ${state.progress.current.toLocaleString()} / ${state.progress.total.toLocaleString()}`
              : state.progress.phase === 'matching'
              ? `Matching: ${state.progress.current.toLocaleString()} / ${state.progress.total.toLocaleString()}`
              : 'Done'}
          </span>
        )}
        {state.error && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            {state.error}
          </span>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {state.status === 'loading' ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
            {state.progress ? (
              <>
                <p className="mb-2">
                  {state.progress.phase === 'building-keys'
                    ? `Building keys: ${state.progress.current.toLocaleString()} / ${state.progress.total.toLocaleString()}`
                    : `Matching: ${state.progress.current.toLocaleString()} / ${state.progress.total.toLocaleString()}`}
                </p>
                <div className="mx-auto h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                  <div
                    className="saber-gradient h-full transition-all duration-300"
                    style={{
                      width: `${state.progress.total > 0
                        ? (state.progress.current / state.progress.total) * 100
                        : 0}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p>Starting…</p>
            )}
          </div>
        ) : state.status === 'idle' ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Zap className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="mb-3">
              {state.totalTracks === 0 || state.totalMaps === 0
                ? 'Load BeatSaver maps and fetch Subsonic tracks before matching.'
                : `Match ${state.totalTracks.toLocaleString()} Subsonic tracks against ${state.totalMaps.toLocaleString()} BeatSaver maps.`}
            </p>
            <Button
              onClick={() => runMatch()}
              disabled={state.totalTracks === 0 || state.totalMaps === 0}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Run Match
            </Button>
          </div>
        ) : pageResults.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {state.results.length === 0
              ? 'No matches found. Try lowering the threshold or fetch tracks first.'
              : 'No results match your filters.'}
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="sticky top-0 z-10 flex border-b bg-background">
              <div className="w-8 shrink-0 px-2 py-2" />
              <div className="flex-1 px-2 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Title</div>
              <div className="w-40 shrink-0 px-2 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Artist</div>
              <div className="w-16 shrink-0 px-2 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Score</div>
              <div className="w-16 shrink-0 px-2 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Maps</div>
            </div>

            {pageResults.map((result, pageIdx) => {
              const isExpanded = expandedRows.has(pageIdx)
              const bestScore = result.matches[0]?.score ?? 0

              return (
                <div key={pageIdx}>
                  {/* Track row */}
                  <div
                    onClick={() => toggleRow(pageIdx)}
                    className="group flex cursor-pointer items-center border-b border-border/50 transition-colors hover:bg-muted/40"
                  >
                    <div className="w-0.5 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-8 shrink-0 px-2 py-2">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 truncate px-2 text-sm font-medium">
                      {result.track.title}
                    </div>
                    <div className="w-40 shrink-0 truncate px-2 text-xs text-muted-foreground">
                      {result.track.artist}
                    </div>
                    <div className="w-16 shrink-0 px-2 text-right">
                      <span
                        className={cn(
                          'font-mono text-xs',
                          bestScore >= 0.9
                            ? 'text-primary font-bold'
                            : bestScore >= 0.8
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        {(bestScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-16 shrink-0 px-2 text-right font-mono text-xs text-muted-foreground">
                      {result.matches.length} map{result.matches.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Expanded matches */}
                  {isExpanded && (
                    <div className="bg-muted/20 border-b border-border/50">
                      {result.matches.map((match, mIdx) => (
                        <div
                          key={mIdx}
                          className="flex items-center border-b border-border/30 px-2 py-1.5 last:border-0"
                          style={{ paddingLeft: '3rem' }}
                        >
                          <div className="flex-1 truncate text-xs">
                            <span className="font-medium">{match.song.song_name}</span>
                            <span className="ml-2 text-muted-foreground">
                              {match.song.song_author}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              · {match.song.level_author}
                            </span>
                          </div>
                          <div className="w-16 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                            {(match.score * 100).toFixed(0)}%
                          </div>
                          <div className="w-24 shrink-0 px-2">
                            <OneClickButton songKey={match.song.key} size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {state.status === 'ready' && total > 0 && (
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      )}
    </div>
  )
}
