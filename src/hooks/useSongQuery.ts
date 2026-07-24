import { useQuery } from '@tanstack/react-query'
import { getDbClient } from '@/lib/db/client'
import type { SongQuery, SongFilters, SortKey } from '@/lib/db/queries'

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
}: UseSongQueryParams) {
  return useQuery({
    queryKey: ['songs', { search, filters, sort, sortDir, page, pageSize }],
    queryFn: async () => {
      const client = getDbClient()
      const query: SongQuery = {
        filters: { ...filters, search: search || undefined },
        sort,
        sortDir,
        page,
        pageSize,
      }
      return client.querySongs(query)
    },
    placeholderData: (prev) => prev, // keep previous data while re-fetching
  })
}
