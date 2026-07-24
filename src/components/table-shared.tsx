/**
 * Shared UI components used across BeatSaver and Subsonic table views.
 */

/** Generic sort header button for table columns. */
interface SortHeaderProps<K extends string> {
  label: string
  sortKey: K
  currentSort: K
  sortDir: 'asc' | 'desc'
  onClick: (key: K) => void
  className?: string
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  currentSort,
  sortDir,
  onClick,
  className,
}: SortHeaderProps<K>) {
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

import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

/** Shared pagination footer for table views. */
interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex items-center justify-between border-t py-1.5 px-3">
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>{total.toLocaleString()} tracks</span>
        <span>·</span>
        <span>
          {page}/{totalPages}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={String(pageSize)}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value))
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
          onClick={() => onPageChange(page - 1)}
          className="h-7 w-7"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-7 w-7"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
