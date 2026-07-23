import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
    estimateSize: () => 56,
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
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search songs, authors, mappers, keys..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters((s) => !s)}
          className="gap-1"
        >
          <SlidersHorizontal className="h-4 w-4" />
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
        <div className="p-4 text-sm text-destructive">Error: {error}</div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={tableContainerRef}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <SortHeader label="Key" sortKey="song_name" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} />
              <SortHeader label="Song" sortKey="song_name" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} />
              <TableHead>Author</TableHead>
              <TableHead>Mapper</TableHead>
              <SortHeader label="BPM" sortKey="bpm" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} />
              <SortHeader label="Dur" sortKey="duration" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} />
              <SortHeader label="Rating" sortKey="rating" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} />
              <TableHead>Ranked</TableHead>
              <SortHeader label="Upload" sortKey="upload_time" currentSort={sort} sortDir={sortDir} onClick={handleSortClick} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && songs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : songs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  No songs found
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const song = songs[virtualRow.index]
                  if (!song) return null
                  return (
                    <TableRow
                      key={song.map_id}
                      onClick={() => setSelectedSong(song)}
                      className="cursor-pointer"
                      style={{ height: `${virtualRow.size}px` }}
                    >
                      <TableCell>
                        <img
                          src={`https://cdn.beatsaver.com/${song.hash}.jpg`}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 rounded object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.opacity = '0'
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{song.key}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium">{song.song_name}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-muted-foreground">{song.song_author}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-muted-foreground">{song.level_author}</TableCell>
                      <TableCell>{song.bpm.toFixed(0)}</TableCell>
                      <TableCell>{formatDuration(song.duration)}</TableCell>
                      <TableCell>{(song.rating * 100).toFixed(0)}%</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isRankedSet(song.ranked_states, RankedStates.ScoresaberRanked) && (
                            <Badge variant="secondary" className="text-xs">SS</Badge>
                          )}
                          {isRankedSet(song.ranked_states, RankedStates.BeatleaderRanked) && (
                            <Badge variant="secondary" className="text-xs">BL</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(song.upload_time * 1000).toLocaleDateString('en-US', {
                          year: '2-digit',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{total.toLocaleString()} songs</span>
          <span>·</span>
          <span>
            Page {page} of {totalPages}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="h-8 w-20"
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
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
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
}

function SortHeader({ label, sortKey, currentSort, sortDir, onClick }: SortHeaderProps) {
  const isActive = currentSort === sortKey
  return (
    <TableHead>
      <button
        onClick={() => onClick(sortKey)}
        className={`flex items-center gap-1 hover:text-foreground ${isActive ? 'text-foreground' : ''}`}
      >
        {label}
        {isActive &&
          (sortDir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  )
}
