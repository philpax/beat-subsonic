import { useQuery } from '@tanstack/react-query'
import { getDbClient } from '@/lib/db/client'
import type { SubsonicFilters, SubsonicSortKey } from '@/lib/subsonic/queries'

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
}: UseSubsonicQueryParams) {
  return useQuery({
    queryKey: ['subsonic-tracks', { search, sort, sortDir, page, pageSize }],
    queryFn: async () => {
      const client = getDbClient()
      const filters: SubsonicFilters = { search: search || undefined }
      return client.subsonicQueryTracks({ filters, sort, sortDir, page, pageSize })
    },
    placeholderData: (prev) => prev, // keep previous data while re-fetching
  })
}
