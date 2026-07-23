import { useState, useEffect, useRef } from 'react'
import { getDbClient, type QueryResult } from '@/lib/db/client'
import type { SongQuery, SongFilters, SortKey } from '@/lib/db/queries'

interface UseSongQueryResult {
  data: QueryResult | null
  isLoading: boolean
  error: string | null
}

interface UseSongQueryParams {
  search: string
  filters: SongFilters
  sort: SortKey
  sortDir: 'asc' | 'desc'
  page: number
  pageSize: number
}

export function useSongQuery({
  search,
  filters,
  sort,
  sortDir,
  page,
  pageSize,
}: UseSongQueryParams): UseSongQueryResult {
  const [data, setData] = useState<QueryResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const currentId = ++requestId.current
    setIsLoading(true)
    setError(null)

    // Debounce search and filter changes
    const timer = setTimeout(async () => {
      try {
        const client = getDbClient()
        const query: SongQuery = {
          filters: { ...filters, search: search || undefined },
          sort,
          sortDir,
          page,
          pageSize,
        }
        const result = await client.querySongs(query)

        // Only update if this is still the latest request
        if (currentId === requestId.current) {
          setData(result)
          setIsLoading(false)
        }
      } catch (err) {
        if (currentId === requestId.current) {
          setError(err instanceof Error ? err.message : String(err))
          setIsLoading(false)
        }
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search, filters, sort, sortDir, page, pageSize])

  return { data, isLoading, error }
}
