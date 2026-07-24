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

import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { buildPageList, PAGE_WINDOW_RADIUS } from '@/lib/pagination'

/** Shared pagination bar for table views (renders top and/or bottom). */
interface PaginationProps {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  /** Which edge of the table this bar sits on — controls the border side. */
  edge?: 'top' | 'bottom'
}

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  edge = 'bottom',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const [pageInput, setPageInput] = useState(String(page))

  // Keep the jump box in sync when the page changes by other means
  useEffect(() => {
    setPageInput(String(page))
  }, [page])

  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10)
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(totalPages, Math.max(1, parsed))
      onPageChange(clamped)
      setPageInput(String(clamped))
    } else {
      setPageInput(String(page))
    }
  }

  return (
    <div
      className={`flex items-center justify-between py-1.5 px-3 ${edge === 'top' ? 'border-b' : 'border-t'}`}
    >
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
          <option value="25">25</option>
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
        {buildPageList(page, totalPages, PAGE_WINDOW_RADIUS).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-0.5 font-mono text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onPageChange(p)}
              className="h-7 min-w-7 px-1.5 font-mono text-xs"
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-7 w-7"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          min={1}
          max={totalPages}
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitPageInput()
          }}
          onBlur={commitPageInput}
          title="Go to page"
          className="h-7 w-16 text-center font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  )
}
