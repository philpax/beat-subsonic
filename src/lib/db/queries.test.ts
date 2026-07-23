import { describe, it, expect } from 'vitest'
import {
  buildSongQuery,
  buildCountQuery,
  buildDifficultiesQuery,
} from '@/lib/db/queries'

describe('query builder', () => {
  describe('buildCountQuery', () => {
    it('builds a simple count with no filters', () => {
      const result = buildCountQuery()
      expect(result.sql).toBe('SELECT COUNT(*) as total FROM songs')
      expect(result.params).toEqual([])
    })

    it('builds a count with search filter', () => {
      const result = buildCountQuery({ search: 'test' })
      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain('LIKE')
      expect(result.params).toHaveLength(6)
      expect(result.params[0]).toBe('%test%')
    })

    it('builds a count with BPM range', () => {
      const result = buildCountQuery({ bpmMin: 100, bpmMax: 200 })
      expect(result.sql).toContain('bpm >= ?')
      expect(result.sql).toContain('bpm <= ?')
      expect(result.params).toEqual([100, 200])
    })
  })

  describe('buildSongQuery', () => {
    it('builds with default sort (upload_time desc) and pagination', () => {
      const result = buildSongQuery({})
      expect(result.sql).toContain('ORDER BY upload_time DESC')
      expect(result.sql).toContain('LIMIT ? OFFSET ?')
      expect(result.params).toEqual([50, 0])
    })

    it('builds with custom sort and direction', () => {
      const result = buildSongQuery({ sort: 'rating', sortDir: 'asc' })
      expect(result.sql).toContain('ORDER BY rating ASC')
    })

    it('builds with custom page and page size', () => {
      const result = buildSongQuery({ page: 3, pageSize: 100 })
      expect(result.sql).toContain('LIMIT ? OFFSET ?')
      expect(result.params).toEqual([100, 200])
    })

    it('caps page size at 500', () => {
      const result = buildSongQuery({ pageSize: 1000 })
      expect(result.sql).toContain('LIMIT ? OFFSET ?')
      expect(result.params[0]).toBe(500)
    })

    it('builds with ranked states filter (ALL bits)', () => {
      const result = buildSongQuery({
        filters: { rankedStates: 3 }, // SS ranked + BL ranked
      })
      expect(result.sql).toContain('ranked_states & ? = ?')
      expect(result.params).toContain(3)
    })

    it('builds with upload flags filter', () => {
      const result = buildSongQuery({
        filters: { uploadFlags: 1 }, // Curated
      })
      expect(result.sql).toContain('upload_flags & ? = ?')
      expect(result.params).toContain(1)
    })

    it('builds with characteristic + difficulty EXISTS subquery', () => {
      const result = buildSongQuery({
        filters: {
          characteristics: [2], // OneSaber
          difficulties: [4], // ExpertPlus
        },
      })
      expect(result.sql).toContain('EXISTS')
      expect(result.sql).toContain('d.characteristic IN (?)')
      expect(result.sql).toContain('d.difficulty IN (?)')
      expect(result.params).toContain(2)
      expect(result.params).toContain(4)
    })

    it('builds with star range EXISTS subquery (SS by default)', () => {
      const result = buildSongQuery({
        filters: {
          starsMin: 5,
          starsMax: 10,
        },
      })
      expect(result.sql).toContain('EXISTS')
      expect(result.sql).toContain('d.stars_ss >= ?')
      expect(result.sql).toContain('d.stars_ss <= ?')
      expect(result.params).toContain(5)
      expect(result.params).toContain(10)
    })

    it('builds with star range EXISTS subquery (BL)', () => {
      const result = buildSongQuery({
        filters: {
          starsMin: 5,
          starsMax: 10,
          starsSource: 'bl',
        },
      })
      expect(result.sql).toContain('d.stars_bl >= ?')
      expect(result.sql).toContain('d.stars_bl <= ?')
    })

    it('builds with tags filter (ANY bits)', () => {
      const result = buildSongQuery({
        filters: {
          tags: [0, 2], // tagList[0] OR tagList[2]
        },
      })
      expect(result.sql).toContain('(tags & ? > 0) OR (tags & ? > 0)')
      expect(result.params).toContain(1) // 2^0
      expect(result.params).toContain(4) // 2^2
    })

    it('builds with upload date range', () => {
      const result = buildSongQuery({
        filters: {
          uploadDateFrom: 1700000000,
          uploadDateTo: 1700086400,
        },
      })
      expect(result.sql).toContain('upload_time >= ?')
      expect(result.sql).toContain('upload_time <= ?')
      expect(result.params).toContain(1700000000)
      expect(result.params).toContain(1700086400)
    })

    it('builds with mods filter in difficulty subquery', () => {
      const result = buildSongQuery({
        filters: { mods: 4 }, // Chroma
      })
      expect(result.sql).toContain('d.mods & ? > 0')
      expect(result.params).toContain(4)
    })

    it('builds with min notes/obstacles/bombs', () => {
      const result = buildSongQuery({
        filters: { minNotes: 100, minObstacles: 10, minBombs: 5 },
      })
      expect(result.sql).toContain('d.notes >= ?')
      expect(result.sql).toContain('d.obstacles >= ?')
      expect(result.sql).toContain('d.bombs >= ?')
    })

    it('sorts by stars using subquery', () => {
      const result = buildSongQuery({
        sort: 'stars',
        sortDir: 'desc',
      })
      expect(result.sql).toContain(
        'ORDER BY (SELECT MAX(stars_ss) FROM difficulties d WHERE d.song_map_id = songs.map_id) DESC'
      )
    })

    it('sorts by stars (BL)', () => {
      const result = buildSongQuery({
        sort: 'stars',
        sortDir: 'desc',
        filters: { starsSource: 'bl' },
      })
      expect(result.sql).toContain('MAX(stars_bl)')
    })

    it('combines multiple filters', () => {
      const result = buildSongQuery({
        filters: {
          search: 'camellia',
          bpmMin: 200,
          rankedStatesAny: 2, // BL ranked
          characteristics: [1], // Standard
          difficulties: [3, 4], // Expert, ExpertPlus
        },
        sort: 'rating',
        sortDir: 'desc',
        page: 2,
        pageSize: 100,
      })
      expect(result.sql).toContain('LIKE')
      expect(result.sql).toContain('bpm >= ?')
      expect(result.sql).toContain('ranked_states & ? > 0')
      expect(result.sql).toContain('EXISTS')
      expect(result.sql).toContain('ORDER BY rating DESC')
      expect(result.sql).toContain('LIMIT ? OFFSET ?')
      // page 2, pageSize 100 → offset 100
      const limitIdx = result.params.length - 2
      const offsetIdx = result.params.length - 1
      expect(result.params[limitIdx]).toBe(100)
      expect(result.params[offsetIdx]).toBe(100)
    })
  })

  describe('buildDifficultiesQuery', () => {
    it('builds query for a specific song', () => {
      const result = buildDifficultiesQuery(42)
      expect(result.sql).toContain('WHERE song_map_id = ?')
      expect(result.sql).toContain('ORDER BY characteristic, difficulty')
      expect(result.params).toEqual([42])
    })
  })
})
