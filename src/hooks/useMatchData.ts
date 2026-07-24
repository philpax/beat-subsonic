import { useState, useCallback, useRef, useEffect } from 'react'
import { getDbClient } from '@/lib/db/client'
import { getMatchClient, type MatchProgress } from '@/lib/matching/client'
import type { SongRow } from '@/lib/types'
import type { SubsonicTrackRow } from '@/lib/subsonic/db'

export interface MatchedMap {
  song: SongRow
  score: number
}

export interface TrackWithMatches {
  /** Primary instance of the track (first one encountered). */
  track: SubsonicTrackRow
  /** All library instances of this (artist, title) — e.g. across albums. */
  instances: SubsonicTrackRow[]
  matches: MatchedMap[]
}

export type MatchStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface MatchState {
  status: MatchStatus
  error: string | null
  results: TrackWithMatches[]
  totalTracks: number
  /** Distinct (artist, title) groups across the whole library. */
  totalUniqueTracks: number
  /** Matched (artist, title) groups. */
  matchedTracks: number
  totalMaps: number
  progress: MatchProgress | null
}

const DEFAULT_THRESHOLD = 0.85

export function useMatchData() {
  const [state, setState] = useState<MatchState>({
    status: 'idle',
    error: null,
    results: [],
    totalTracks: 0,
    totalUniqueTracks: 0,
    matchedTracks: 0,
    totalMaps: 0,
    progress: null,
  })

  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const loadingRef = useRef(false)
  // Songs cached for result display; the version tracks which map set the
  // worker currently holds so unchanged data is never re-shipped
  const songsRef = useRef<SongRow[]>([])
  const songsVersionRef = useRef<string | null>(null)

  // Load counts on mount so the idle state can show accurate numbers
  useEffect(() => {
    ;(async () => {
      try {
        const dbClient = getDbClient()
        await dbClient.init()
        const stats = await dbClient.getStats()
        const subsonicStats = await dbClient.subsonicGetStats()
        setState((s) => ({
          ...s,
          totalMaps: stats.songCount,
          totalTracks: subsonicStats.trackCount,
        }))
      } catch {
        // DB might not be ready yet
      }
    })()
  }, [])

  const runMatch = useCallback(
    async (thresh: number = threshold) => {
      if (loadingRef.current) return
      loadingRef.current = true

      setState((s) => ({ ...s, status: 'loading', error: null, progress: null }))

      try {
        const dbClient = getDbClient()
        await dbClient.init()

        const matchClient = getMatchClient()
        const onProgress = (progress: MatchProgress) => {
          setState((s) => ({ ...s, progress }))
        }

        // Ship the map set to the worker only when the data has changed;
        // the worker keeps its keys + index between matches. getAllSongs is
        // used because querySongs is paginated (pageSize capped at 500).
        const stats = await dbClient.getStats()
        const version = `${stats.songCount}:${stats.scrapeTime}`
        if (songsVersionRef.current !== version || !matchClient.hasMaps(version)) {
          const songs = (await dbClient.getAllSongs()) as unknown as SongRow[]
          songsRef.current = songs
          await matchClient.setMaps(
            version,
            songs.map((s, i) => ({
              index: i,
              levelAuthor: s.level_author,
              songAuthor: s.song_author,
              songName: s.song_name,
            })),
            onProgress,
          )
          songsVersionRef.current = version
        }
        const songs = songsRef.current

        // Fetch all Subsonic tracks
        const subsonicTracks = await dbClient.subsonicGetTracks()

        if (songs.length === 0 || subsonicTracks.length === 0) {
          setState((s) => ({
            ...s,
            status: 'ready',
            results: [],
            totalTracks: subsonicTracks.length,
            matchedTracks: 0,
            totalMaps: songs.length,
            progress: null,
          }))
          return
        }

        // Run matching in the worker — scores come back attached
        const matchResults = await matchClient.match(
          subsonicTracks.map((t, i) => ({ index: i, artist: t.artist, title: t.title })),
          thresh,
          onProgress,
        )

        // Group matched tracks by case-insensitive (artist, title) — the
        // same track often appears on multiple albums (single, album,
        // compilation) and would otherwise produce duplicate rows
        const groupKey = (t: SubsonicTrackRow) =>
          JSON.stringify([t.artist.toLowerCase(), t.title.toLowerCase()])

        const groups = new Map<string, TrackWithMatches>()
        for (const mr of matchResults) {
          const track = subsonicTracks[mr.trackIndex]
          let group = groups.get(groupKey(track))
          if (!group) {
            group = { track, instances: [], matches: [] }
            groups.set(groupKey(track), group)
          }
          group.instances.push(track)

          for (const { mapIndex, score } of mr.matches) {
            const song = songs[mapIndex]
            const existing = group.matches.find((m) => m.song.map_id === song.map_id)
            if (existing) {
              if (score > existing.score) existing.score = score
            } else {
              group.matches.push({ song, score })
            }
          }
        }

        const results = Array.from(groups.values())
        for (const group of results) {
          group.matches.sort((a, b) => b.score - a.score)
        }

        // Sort results by artist, then title
        results.sort((a, b) => {
          const artistCmp = a.track.artist.localeCompare(b.track.artist)
          if (artistCmp !== 0) return artistCmp
          return a.track.title.localeCompare(b.track.title)
        })

        // Coverage denominator: unique (artist, title) groups in the library
        const uniqueKeys = new Set<string>()
        for (const track of subsonicTracks) uniqueKeys.add(groupKey(track))

        setState((s) => ({
          ...s,
          status: 'ready',
          results,
          totalTracks: subsonicTracks.length,
          totalUniqueTracks: uniqueKeys.size,
          matchedTracks: results.length,
          totalMaps: songs.length,
          progress: null,
        }))
      } catch (err) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          progress: null,
        }))
      } finally {
        loadingRef.current = false
      }
    },
    [threshold],
  )

  const updateThreshold = useCallback((newThreshold: number) => {
    setThreshold(newThreshold)
  }, [])

  return {
    state,
    threshold,
    runMatch,
    updateThreshold,
  }
}
