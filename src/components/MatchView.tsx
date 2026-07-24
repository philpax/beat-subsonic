import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { OneClickButton } from '@/components/OneClickButton'
import { SongDetailDialog } from '@/components/SongDetailDialog'
import { useMatchData, type MatchedMap } from '@/hooks/useMatchData'
import { usePersistentState } from '@/hooks/usePersistentState'
import { Pagination, SortHeader, formatDuration, formatIsoDate } from '@/components/table-shared'
import { RankedStates, isRankedSet } from '@/lib/proto/enums'
import type { SongRow } from '@/lib/types'
import { ChevronDown, ChevronRight, Loader2, AlertCircle, Search, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PAGE_SIZE_DEFAULT = 50

/** Sortable columns of the expanded per-track match table. */
type MatchSortKey =
  | 'song_name'
  | 'song_author'
  | 'level_author'
  | 'bpm'
  | 'duration'
  | 'rating'
  | 'ranked'
  | 'upload_time'
  | 'score'

function compareMatches(a: MatchedMap, b: MatchedMap, key: MatchSortKey): number {
  switch (key) {
    case 'song_name':
      return a.song.song_name.localeCompare(b.song.song_name)
    case 'song_author':
      return a.song.song_author.localeCompare(b.song.song_author)
    case 'level_author':
      return a.song.level_author.localeCompare(b.song.level_author)
    case 'bpm':
      return a.song.bpm - b.song.bpm
    case 'duration':
      return a.song.duration - b.song.duration
    case 'rating':
      return a.song.rating - b.song.rating
    case 'ranked':
      return a.song.ranked_states - b.song.ranked_states
    case 'upload_time':
      return a.song.upload_time - b.song.upload_time
    case 'score':
      return a.score - b.score
  }
}

function sortMatches(matches: MatchedMap[], key: MatchSortKey, dir: 'asc' | 'desc'): MatchedMap[] {
  const sorted = [...matches].sort((a, b) => compareMatches(a, b, key))
  if (dir === 'desc') sorted.reverse()
  return sorted
}

interface MatchViewProps {
  tagList: string[]
}

export function MatchView({ tagList }: MatchViewProps) {
  const { state, threshold, runMatch, updateThreshold } = useMatchData()
  const [selectedSong, setSelectedSong] = useState<SongRow | null>(null)
  const [matchSort, setMatchSort] = useState<MatchSortKey>('score')
  const [matchSortDir, setMatchSortDir] = useState<'asc' | 'desc'>('desc')

  const handleMatchSortClick = useCallback((key: MatchSortKey) => {
    setMatchSort((current) => {
      if (current === key) {
        setMatchSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return current
      }
      setMatchSortDir('desc')
      return key
    })
  }, [])
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
      if (!r.track.title.toLowerCase().includes(q) && !r.track.artist.toLowerCase().includes(q))
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
    state.totalUniqueTracks > 0
      ? ((state.matchedTracks / state.totalUniqueTracks) * 100).toFixed(1)
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
            min="60"
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
          {state.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Re-match
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>{state.matchedTracks.toLocaleString()} matched tracks</span>
        <span>·</span>
        <span>
          {state.totalUniqueTracks > 0
            ? `${state.totalUniqueTracks.toLocaleString()} unique / ${state.totalTracks.toLocaleString()} total tracks`
            : `${state.totalTracks.toLocaleString()} total tracks`}
        </span>
        <span>·</span>
        <span>{coveragePct}% coverage</span>
        <span>·</span>
        <span>{state.totalMaps.toLocaleString()} BeatSaver maps</span>
        {state.progress && state.status === 'loading' && (
          <span className="text-primary">
            ·{' '}
            {state.progress.phase === 'building-keys'
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
                      width: `${
                        state.progress.total > 0
                          ? (state.progress.current / state.progress.total) * 100
                          : 0
                      }%`,
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
              <div className="w-64 shrink-0 px-2 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Artist
              </div>
              <div className="flex-1 px-2 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Title
              </div>
              <div className="w-16 shrink-0 px-2 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Score
              </div>
              <div className="w-16 shrink-0 px-2 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Maps
              </div>
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
                    <div className="w-64 shrink-0 truncate px-2 text-sm text-muted-foreground">
                      {result.track.artist}
                    </div>
                    <div className="flex-1 truncate px-2 text-sm font-medium">
                      {result.track.title}
                      {result.instances.length > 1 && (
                        <span
                          className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          title={`On ${result.instances.length} albums:\n${[
                            ...new Set(result.instances.map((t) => t.album ?? '—')),
                          ].join('\n')}`}
                        >
                          ×{result.instances.length}
                        </span>
                      )}
                    </div>
                    <div className="w-16 shrink-0 px-2 text-right">
                      <span
                        className={cn(
                          'font-mono text-xs',
                          bestScore >= 0.9
                            ? 'text-primary font-bold'
                            : bestScore >= 0.8
                              ? 'text-foreground'
                              : 'text-muted-foreground',
                        )}
                      >
                        {(bestScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-16 shrink-0 px-2 text-right font-mono text-xs text-muted-foreground">
                      {result.matches.length} map{result.matches.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Expanded matches — same table form as the BeatSaver view */}
                  {isExpanded && (
                    <div className="bg-muted/20 border-b border-border/50">
                      {/* Column header */}
                      <div className="flex items-center border-b border-border/30 pl-8">
                        <div className="w-10 shrink-0" />
                        <SortHeader
                          label="Song"
                          sortKey="song_name"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="flex-1"
                        />
                        <SortHeader
                          label="Author"
                          sortKey="song_author"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-32"
                        />
                        <SortHeader
                          label="Mapper"
                          sortKey="level_author"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-32"
                        />
                        <SortHeader
                          label="BPM"
                          sortKey="bpm"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-12"
                        />
                        <SortHeader
                          label="Dur"
                          sortKey="duration"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-12"
                        />
                        <SortHeader
                          label="Rating"
                          sortKey="rating"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-14"
                        />
                        <SortHeader
                          label="Ranked"
                          sortKey="ranked"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-14"
                        />
                        <SortHeader
                          label="Uploaded"
                          sortKey="upload_time"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-24"
                        />
                        <SortHeader
                          label="Score"
                          sortKey="score"
                          currentSort={matchSort}
                          sortDir={matchSortDir}
                          onClick={handleMatchSortClick}
                          className="w-14"
                        />
                        <div className="w-24 shrink-0 px-2 py-1" />
                      </div>
                      {sortMatches(result.matches, matchSort, matchSortDir).map((match) => (
                        <div
                          key={match.song.map_id}
                          onClick={() => setSelectedSong(match.song)}
                          className="group/match flex cursor-pointer items-center border-b border-border/30 pl-8 transition-colors last:border-0 hover:bg-muted/40"
                        >
                          <div className="w-10 shrink-0 px-2 py-1">
                            <img
                              src={`https://cdn.beatsaver.com/${match.song.hash}.jpg`}
                              alt=""
                              loading="lazy"
                              className="h-8 w-8 rounded object-cover"
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).style.opacity = '0'
                              }}
                            />
                          </div>
                          <div className="flex-1 truncate px-2 text-xs font-medium">
                            {match.song.song_name}
                          </div>
                          <div className="w-32 shrink-0 truncate px-2 text-xs text-muted-foreground">
                            {match.song.song_author}
                          </div>
                          <div className="w-32 shrink-0 truncate px-2 text-xs text-muted-foreground">
                            {match.song.level_author}
                          </div>
                          <div className="w-12 shrink-0 px-2 font-mono text-xs">
                            {match.song.bpm.toFixed(0)}
                          </div>
                          <div className="w-12 shrink-0 px-2 font-mono text-xs text-muted-foreground">
                            {formatDuration(match.song.duration)}
                          </div>
                          <div className="w-14 shrink-0 px-2 font-mono text-xs">
                            {(match.song.rating * 100).toFixed(0)}%
                          </div>
                          <div className="w-14 shrink-0 px-2">
                            <div className="flex gap-1">
                              {isRankedSet(
                                match.song.ranked_states,
                                RankedStates.ScoresaberRanked,
                              ) && <span className="text-[10px] font-bold text-primary">SS</span>}
                              {isRankedSet(
                                match.song.ranked_states,
                                RankedStates.BeatleaderRanked,
                              ) && <span className="text-[10px] font-bold text-accent">BL</span>}
                            </div>
                          </div>
                          <div className="w-24 shrink-0 px-2 font-mono text-xs text-muted-foreground">
                            {formatIsoDate(match.song.upload_time)}
                          </div>
                          <div className="w-14 shrink-0 px-2 text-right font-mono text-[10px] text-muted-foreground">
                            {(match.score * 100).toFixed(0)}%
                          </div>
                          <div className="w-24 shrink-0 px-2" onClick={(e) => e.stopPropagation()}>
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
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}

      {/* Song detail dialog */}
      <SongDetailDialog
        song={selectedSong}
        tagList={tagList}
        onClose={() => setSelectedSong(null)}
      />
    </div>
  )
}
