import { Select } from '@/components/ui/select'
import type { SortKey } from '@/lib/db/queries'
import { ArrowDown, ArrowUp } from 'lucide-react'

interface SortControlProps {
  sort: SortKey
  sortDir: 'asc' | 'desc'
  onSortChange: (sort: SortKey) => void
  onSortDirChange: (dir: 'asc' | 'desc') => void
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'upload_time', label: 'Upload Date' },
  { value: 'rating', label: 'Rating' },
  { value: 'bpm', label: 'BPM' },
  { value: 'song_name', label: 'Song Name' },
  { value: 'song_author', label: 'Song Author' },
  { value: 'level_author', label: 'Mapper' },
  { value: 'duration', label: 'Duration' },
  { value: 'upvotes', label: 'Upvotes' },
  { value: 'stars', label: 'Star Rating' },
  { value: 'ranked_states', label: 'Ranked' },
]

export function SortControl({ sort, sortDir, onSortChange, onSortDirChange }: SortControlProps) {
  return (
    <div className="flex items-center gap-1">
      <Select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        className="h-8 w-28 text-xs"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <button
        onClick={() => onSortDirChange(sortDir === 'asc' ? 'desc' : 'asc')}
        className="flex h-8 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
        title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
      >
        {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </button>
    </div>
  )
}
