import { useState, useEffect, useRef } from 'react'
import { getDbClient } from '@/lib/db/client'
import type { SubsonicQuery, SubsonicFilters, SubsonicSortKey } from '@/lib/subsonic/queries'

interface UseSubsonicQueryResult {
  data: { rows: Record<string, unknown>[]; total: number } | null
  isLoading: boolean
  error: string | null
}

interface UseSubsonicQueryParams {
  search: string
  sort: SubsonicSortKey
  sortDir: 'asc' | 'desc'
  page: number
  pageSize: number
}

export function useSubsonicQuery({
  search,
  sort,
  sortDir,
  page,
  pageSize,
}: UseSubsonicQueryParams): UseSubsonicQueryResult {
  const [data, setData] = useState<UseSubsonicQueryResult['data']>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const fastKey = `${sort}:${sortDir}:${page}:${pageSize}`
  const debouncedKey = search

  useEffect(() => {
    const currentId = ++requestId.current
    setIsLoading(true)
    setError(null)

    const timer = setTimeout(async () => {
      try {
        const client = getDbClient()
        const filters: SubsonicFilters = { search: search || undefined }
        const query: SubsonicQuery = {
          filters,
          sort,
          sortDir,
          page,
          pageSize,
        }
        const result = await client.subsonicQueryTracks(query)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastKey, debouncedKey])

  return { data, isLoading, error }
}
