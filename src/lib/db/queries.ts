/**
 * Query builder for song searches with filters, sorting, and pagination.
 *
 * All functions return { sql, params } tuples — they are pure and can be
 * tested against any SQLite implementation without a browser.
 */

export interface SongFilters {
  search?: string
  characteristics?: number[]
  difficulties?: number[]
  rankedStates?: number // bitmask: must have ALL bits set
  rankedStatesAny?: number // bitmask: must have ANY bit set
  uploadFlags?: number // bitmask: must have ALL bits set
  tags?: number[] // tag bit positions — song must have ANY of these bits set
  bpmMin?: number
  bpmMax?: number
  starsMin?: number
  starsMax?: number
  starsSource?: 'ss' | 'bl'
  uploadDateFrom?: number // unix timestamp
  uploadDateTo?: number
  mods?: number // bitmask: must have ANY of these bits set
  minNotes?: number
  minObstacles?: number
  minBombs?: number
}

export type SortKey =
  | 'upload_time'
  | 'rating'
  | 'bpm'
  | 'song_name'
  | 'duration'
  | 'upvotes'
  | 'stars'

export interface SongQuery {
  filters?: SongFilters
  sort?: SortKey
  sortDir?: 'asc' | 'desc'
  page?: number // 1-based
  pageSize?: number
}

export interface BuiltQuery {
  sql: string
  params: (string | number)[]
}

/** Build a COUNT query for the given filters. */
export function buildCountQuery(filters?: SongFilters): BuiltQuery {
  const { where, params } = buildWhereClause(filters ?? {})
  const sql = `SELECT COUNT(*) as total FROM songs${where}`
  return { sql, params }
}

/** Build the main SELECT query with filters, sort, and pagination. */
export function buildSongQuery(query: SongQuery): BuiltQuery {
  const filters = query.filters ?? {}
  const { where, params } = buildWhereClause(filters)
  const sortKey = query.sort ?? 'upload_time'
  const sortDir = query.sortDir === 'asc' ? 'ASC' : 'DESC'
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(500, query.pageSize ?? 50)
  const offset = (page - 1) * pageSize

  const sortColumn = getSortColumn(sortKey, filters)
  const sql = `SELECT * FROM songs${where} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`
  return { sql, params: [...params, pageSize, offset] }
}

/** Build a query to fetch all difficulties for a specific song. */
export function buildDifficultiesQuery(songMapId: number): BuiltQuery {
  return {
    sql: 'SELECT * FROM difficulties WHERE song_map_id = ? ORDER BY characteristic, difficulty',
    params: [songMapId],
  }
}

function buildWhereClause(filters: SongFilters): {
  where: string
  params: (string | number)[]
} {
  const conditions: string[] = []
  const params: (string | number)[] = []

  // Text search across name, author, mapper, uploader, key, hash
  if (filters.search) {
    const search = filters.search.trim()
    if (search) {
      conditions.push(
        `(song_name LIKE ? COLLATE NOCASE OR song_author LIKE ? COLLATE NOCASE OR level_author LIKE ? COLLATE NOCASE OR uploader_name LIKE ? COLLATE NOCASE OR key LIKE ? OR hash LIKE ?)`
      )
      const pattern = `%${search}%`
      params.push(pattern, pattern, pattern, pattern, pattern, pattern)
    }
  }

  // Ranked states — must have ALL specified bits
  if (filters.rankedStates) {
    conditions.push('(ranked_states & ? = ?)')
    params.push(filters.rankedStates, filters.rankedStates)
  }

  // Ranked states — must have ANY specified bit
  if (filters.rankedStatesAny) {
    conditions.push('(ranked_states & ? > 0)')
    params.push(filters.rankedStatesAny)
  }

  // Upload flags — must have ALL specified bits
  if (filters.uploadFlags) {
    conditions.push('(upload_flags & ? = ?)')
    params.push(filters.uploadFlags, filters.uploadFlags)
  }

  // BPM range
  if (filters.bpmMin !== undefined) {
    conditions.push('bpm >= ?')
    params.push(filters.bpmMin)
  }
  if (filters.bpmMax !== undefined) {
    conditions.push('bpm <= ?')
    params.push(filters.bpmMax)
  }

  // Upload date range
  if (filters.uploadDateFrom !== undefined) {
    conditions.push('upload_time >= ?')
    params.push(filters.uploadDateFrom)
  }
  if (filters.uploadDateTo !== undefined) {
    conditions.push('upload_time <= ?')
    params.push(filters.uploadDateTo)
  }

  // Tags — must have ANY of the specified bit positions
  if (filters.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map((bit) => {
      const mask = Math.pow(2, bit)
      params.push(mask)
      return '(tags & ? > 0)'
    })
    conditions.push(`(${tagConditions.join(' OR ')})`)
  }

  // Difficulty-based filters: characteristic, difficulty, star range, mods, min counts
  // These use EXISTS subqueries against the difficulties table
  const diffConditions: string[] = []
  if (filters.characteristics && filters.characteristics.length > 0) {
    const placeholders = filters.characteristics.map(() => '?').join(',')
    diffConditions.push(`d.characteristic IN (${placeholders})`)
    params.push(...filters.characteristics)
  }
  if (filters.difficulties && filters.difficulties.length > 0) {
    const placeholders = filters.difficulties.map(() => '?').join(',')
    diffConditions.push(`d.difficulty IN (${placeholders})`)
    params.push(...filters.difficulties)
  }
  if (filters.starsMin !== undefined || filters.starsMax !== undefined) {
    const starCol = filters.starsSource === 'bl' ? 'd.stars_bl' : 'd.stars_ss'
    if (filters.starsMin !== undefined) {
      diffConditions.push(`${starCol} >= ?`)
      params.push(filters.starsMin)
    }
    if (filters.starsMax !== undefined) {
      diffConditions.push(`${starCol} <= ?`)
      params.push(filters.starsMax)
    }
  }
  if (filters.mods) {
    diffConditions.push('(d.mods & ? > 0)')
    params.push(filters.mods)
  }
  if (filters.minNotes !== undefined) {
    diffConditions.push('d.notes >= ?')
    params.push(filters.minNotes)
  }
  if (filters.minObstacles !== undefined) {
    diffConditions.push('d.obstacles >= ?')
    params.push(filters.minObstacles)
  }
  if (filters.minBombs !== undefined) {
    diffConditions.push('d.bombs >= ?')
    params.push(filters.minBombs)
  }

  if (diffConditions.length > 0) {
    conditions.push(
      `EXISTS (SELECT 1 FROM difficulties d WHERE d.song_map_id = songs.map_id AND ${diffConditions.join(' AND ')})`
    )
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

function getSortColumn(sortKey: SortKey, filters: SongFilters): string {
  switch (sortKey) {
    case 'upload_time':
      return 'upload_time'
    case 'rating':
      return 'rating'
    case 'bpm':
      return 'bpm'
    case 'song_name':
      return 'song_name COLLATE NOCASE'
    case 'duration':
      return 'duration'
    case 'upvotes':
      return 'upvotes'
    case 'stars': {
      const starCol = filters.starsSource === 'bl' ? 'stars_bl' : 'stars_ss'
      // Subquery to get max stars for sorting
      return `(SELECT MAX(${starCol}) FROM difficulties d WHERE d.song_map_id = songs.map_id)`
    }
    default:
      return 'upload_time'
  }
}
