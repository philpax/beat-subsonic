import { useState, useCallback, useRef } from 'react'
import { getDbClient } from '@/lib/db/client'
import {
  buildMapKey,
  buildTrackKey,
  matchAllTracks,
  computeMatchScore,
  type MapKey,
  type TrackKey,
  type MatchResult,
} from '@/lib/matching'
import type { SongRow } from '@/lib/types'
import type { SubsonicTrackRow } from '@/lib/subsonic/db'

export interface MatchedMap {
  song: SongRow
  score: number
}

export interface TrackWithMatches {
  track: SubsonicTrackRow
  matches: MatchedMap[]
}

export type MatchStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface MatchState {
  status: MatchStatus
  error: string | null
  results: TrackWithMatches[]
  totalTracks: number
  matchedTracks: number
  totalMaps: number
}

const DEFAULT_THRESHOLD = 0.8

export function useMatchData() {
  const [state, setState] = useState<MatchState>({
    status: 'idle',
    error: null,
    results: [],
    totalTracks: 0,
    matchedTracks: 0,
    totalMaps: 0,
  })

  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const loadingRef = useRef(false)

  const runMatch = useCallback(async (thresh: number = threshold) => {
    if (loadingRef.current) return
    loadingRef.current = true

    setState((s) => ({ ...s, status: 'loading', error: null }))

    try {
      const dbClient = getDbClient()
      await dbClient.init()

      // Fetch all BeatSaver songs (we need all of them for matching)
      // Use a large page size to get everything in one query
      const songResult = await dbClient.querySongs({
        page: 1,
        pageSize: 500000,
        sort: 'upload_time',
        sortDir: 'desc',
      })
      const songs = songResult.rows as unknown as SongRow[]

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
        }))
        return
      }

      // Build map keys
      const mapKeys: MapKey[] = songs.map((song, index) => ({
        index,
        variants: buildMapKey({
          levelAuthor: song.level_author,
          songAuthor: song.song_author,
          songName: song.song_name,
        }),
      }))

      // Build track keys
      const trackKeys: TrackKey[] = subsonicTracks.map((track, index) => ({
        index,
        variants: buildTrackKey({
          artist: track.artist,
          title: track.title,
        }),
      }))

      // Run matching
      const matchResults: MatchResult[] = matchAllTracks(trackKeys, mapKeys, thresh)

      // Build result objects with scores
      const results: TrackWithMatches[] = matchResults.map((mr) => {
        const track = subsonicTracks[mr.trackIndex]
        const matches: MatchedMap[] = mr.mapIndices.map((mapIdx) => {
          const song = songs[mapIdx]
          const score = computeMatchScore(
            trackKeys[mr.trackIndex].variants,
            mapKeys[mapIdx].variants
          )
          return { song, score }
        })

        // Sort matches by score descending
        matches.sort((a, b) => b.score - a.score)

        return { track, matches }
      })

      // Sort results by artist, then title
      results.sort((a, b) => {
        const artistCmp = a.track.artist.localeCompare(b.track.artist)
        if (artistCmp !== 0) return artistCmp
        return a.track.title.localeCompare(b.track.title)
      })

      setState((s) => ({
        ...s,
        status: 'ready',
        results,
        totalTracks: subsonicTracks.length,
        matchedTracks: results.length,
        totalMaps: songs.length,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      loadingRef.current = false
    }
  }, [threshold])

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
