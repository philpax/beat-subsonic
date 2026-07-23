import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { useSongQuery } from '@/hooks/useSongQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { FilterPanel } from '@/components/FilterPanel'
import { SortControl } from '@/components/SortControl'
import { SongDetailDialog } from '@/components/SongDetailDialog'
import type { SongFilters, SortKey } from '@/lib/db/queries'
import {
  RankedStates,
  isRankedSet,
} from '@/lib/proto/enums'
import type { SongRow } from '@/lib/types'

interface SongTableProps {
  tagList: string[]
}

const PAGE_SIZE_DEFAULT = 100

export function SongTable({ tagList }: SongTableProps) {
  // Search state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Filter state
  const [filters, setFilters] = useState<SongFilters>({})
  const [showFilters, setShowFilters] = useState(false)

  // Sort state
  const [sort, setSort] = usePersistentState<SortKey>('sort', 'upload_time')
  const [sortDir, setSortDir] = usePersistentState<'asc' | 'desc'>('sortDir', 'desc')

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePersistentState<number>('pageSize', PAGE_SIZE_DEFAULT)

  // Selected song for detail dialog
  const [selectedSong, setSelectedSong] = useState<SongRow | null>(null)

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

  const { data, isLoading, error } = useSongQuery({
    search: debouncedSearch,
    filters,
    sort,
    sortDir,
    page,
    pageSize,
  })

  const songs = (data?.rows ?? []) as unknown as SongRow[]
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Virtual scrolling for the table body
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  const handleSortClick = useCallback((key: SortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      setSortDir('desc')
    }
  }, [sort])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b py-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search songs, authors, mappers…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters((s) => !s)}
          className="h-8 gap-1 text-xs"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
        <SortControl
          sort={sort}
          sortDir={sortDir}
          onSortChange={setSort}
          onSortDirChange={setSortDir}
        />
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          tagList={tagList}
          filters={filters}
          onFiltersChange={(f) => {
            setFilters(f)
            setPage(1)
          }}
        />
      )}

      {/* Error state */}
      {error && (
        <div className="py-2 text-sm text-destructive">{error}</div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={tableContainerRef}>
        <div className="relative">
          {/* Header */}
          <div className="sticky top-0 z-10 flex border-b bg-background">
            <div className="w-10 shrink-0" />
            <SortHeader label="Song" sortKey="song_name" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="flex-1" />
            <SortHeader label="Author" sortKey="song_author" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-36 shrink-0" />
            <SortHeader label="Mapper" sortKey="level_author" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-36 shrink-0" />
            <SortHeader label="BPM" sortKey="bpm" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-12 shrink-0" />
            <SortHeader label="Dur" sortKey="duration" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-12 shrink-0" />
            <SortHeader label="Rating" sortKey="rating" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-14 shrink-0" />
            <SortHeader label="Ranked" sortKey="ranked_states" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-14 shrink-0" />
            <SortHeader label="Uploaded" sortKey="upload_time" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} className="w-24 shrink-0" />
          </div>

          {/* Virtual rows */}
          {isLoading && songs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : songs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No songs found</div>
          ) : (
            <div
              style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const song = songs[virtualRow.index]
                if (!song) return null
                return (
                  <div
                    key={song.map_id}
                    onClick={() => setSelectedSong(song)}
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
                    {/* Cyan hover accent on left edge */}
                    <div className="w-0.5 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-10 shrink-0 px-2 py-1">
                      <img
                        src={`https://cdn.beatsaver.com/${song.hash}.jpg`}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 rounded object-cover"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.opacity = '0'
                        }}
                      />
                    </div>
                    <div className="flex-1 truncate px-2 text-sm font-medium">{song.song_name}</div>
                    <div className="w-36 shrink-0 truncate px-2 text-xs text-muted-foreground">{song.song_author}</div>
                    <div className="w-36 shrink-0 truncate px-2 text-xs text-muted-foreground">{song.level_author}</div>
                    <div className="w-12 shrink-0 px-2 font-mono text-sm">{song.bpm.toFixed(0)}</div>
                    <div className="w-12 shrink-0 px-2 font-mono text-sm text-muted-foreground">{formatDuration(song.duration)}</div>
                    <div className="w-14 shrink-0 px-2 font-mono text-sm">{(song.rating * 100).toFixed(0)}%</div>
                    <div className="w-14 shrink-0 px-2">
                      <div className="flex gap-1">
                        {isRankedSet(song.ranked_states, RankedStates.ScoresaberRanked) && (
                          <span className="text-[10px] font-bold text-primary">SS</span>
                        )}
                        {isRankedSet(song.ranked_states, RankedStates.BeatleaderRanked) && (
                          <span className="text-[10px] font-bold text-accent">BL</span>
                        )}
                      </div>
                    </div>
                    <div className="w-24 shrink-0 px-2 font-mono text-xs text-muted-foreground">
                      {new Date(song.upload_time * 1000).toLocaleDateString('en-US', {
                        year: '2-digit',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t py-1.5">
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span>{total.toLocaleString()} songs</span>
          <span>·</span>
          <span>{page}/{totalPages}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="h-7 w-16 text-xs"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </Select>
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-7 w-7"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-7 w-7"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Song detail dialog */}
      <SongDetailDialog
        song={selectedSong}
        tagList={tagList}
        onClose={() => setSelectedSong(null)}
      />
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  sortDir: 'asc' | 'desc'
  onClick: (key: SortKey) => void
  className?: string
}

function SortHeader({ label, sortKey, currentSort, sortDir, onClick, className }: SortHeaderProps) {
  const isActive = currentSort === sortKey
  return (
    <div className={`shrink-0 px-2 py-2 ${className ?? ''}`}>
      <button
        onClick={() => onClick(sortKey)}
        className={`flex items-center gap-0.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors hover:text-foreground ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
      >
        {label}
        {isActive &&
          (sortDir === 'asc' ? (
            <ChevronUp className="h-2.5 w-2.5" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" />
          ))}
      </button>
    </div>
  )
}
