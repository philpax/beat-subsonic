/**
 * Query builder for Subsonic track searches with sorting and pagination.
 *
 * Pure functions returning { sql, params } — testable without a browser.
 * Follows the same pattern as the BeatSaver query builder in queries.ts.
 */

export type SubsonicSortKey = 'title' | 'artist' | 'album' | 'duration' | 'year'

export interface SubsonicFilters {
  search?: string
}

export interface SubsonicQuery {
  filters?: SubsonicFilters
  sort?: SubsonicSortKey
  sortDir?: 'asc' | 'desc'
  page?: number // 1-based
  pageSize?: number
}

export interface SubsonicBuiltQuery {
  sql: string
  params: (string | number)[]
}

/** Build a COUNT query for the given filters. */
export function buildSubsonicCountQuery(filters?: SubsonicFilters): SubsonicBuiltQuery {
  const { where, params } = buildSubsonicWhereClause(filters ?? {})
  return {
    sql: `SELECT COUNT(*) as total FROM subsonic_tracks${where}`,
    params,
  }
}

/** Build the main SELECT query with filters, sort, and pagination. */
export function buildSubsonicQuery(query: SubsonicQuery): SubsonicBuiltQuery {
  const filters = query.filters ?? {}
  const { where, params } = buildSubsonicWhereClause(filters)
  const sortKey = query.sort ?? 'artist'
  const sortDir = query.sortDir === 'asc' ? 'ASC' : 'DESC'
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(500, query.pageSize ?? 100)
  const offset = (page - 1) * pageSize

  const sortColumn = getSubsonicSortColumn(sortKey)
  const sql = `SELECT id, title, artist, album, duration, year, fetched_at, normalized_key FROM subsonic_tracks${where} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`
  return { sql, params: [...params, pageSize, offset] }
}

function buildSubsonicWhereClause(filters: SubsonicFilters): {
  where: string
  params: (string | number)[]
} {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (filters.search) {
    const search = filters.search.trim()
    if (search) {
      conditions.push(
        '(title LIKE ? COLLATE NOCASE OR artist LIKE ? COLLATE NOCASE OR album LIKE ? COLLATE NOCASE)'
      )
      const pattern = `%${search}%`
      params.push(pattern, pattern, pattern)
    }
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

function getSubsonicSortColumn(sortKey: SubsonicSortKey): string {
  switch (sortKey) {
    case 'title':
      return 'title COLLATE NOCASE'
    case 'artist':
      return 'artist COLLATE NOCASE'
    case 'album':
      return 'album COLLATE NOCASE'
    case 'duration':
      return 'duration'
    case 'year':
      return 'year'
    default:
      return 'artist COLLATE NOCASE'
  }
}
