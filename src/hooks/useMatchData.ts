import { useState, useCallback, useRef } from 'react'
import { getDbClient } from '@/lib/db/client'
import { getMatchClient, type MatchProgress } from '@/lib/matching/client'
import {
  buildMapKey,
  buildTrackKey,
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
  progress: MatchProgress | null
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
    progress: null,
  })

  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const loadingRef = useRef(false)
  // Cache songs and tracks for score computation after worker returns
  const songsRef = useRef<SongRow[]>([])
  const tracksRef = useRef<SubsonicTrackRow[]>([])
  const mapKeysRef = useRef<MapKey[]>([])
  const trackKeysRef = useRef<TrackKey[]>([])

  const runMatch = useCallback(async (thresh: number = threshold) => {
    if (loadingRef.current) return
    loadingRef.current = true

    setState((s) => ({ ...s, status: 'loading', error: null, progress: null }))

    try {
      const dbClient = getDbClient()
      await dbClient.init()

      // Fetch all BeatSaver songs
      const songResult = await dbClient.querySongs({
        page: 1,
        pageSize: 500000,
        sort: 'upload_time',
        sortDir: 'desc',
      })
      const songs = songResult.rows as unknown as SongRow[]
      songsRef.current = songs

      // Fetch all Subsonic tracks
      const subsonicTracks = await dbClient.subsonicGetTracks()
      tracksRef.current = subsonicTracks

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

      // Build keys for score computation (needed after worker returns)
      const mapKeys: MapKey[] = songs.map((song, index) => ({
        index,
        variants: buildMapKey({
          levelAuthor: song.level_author,
          songAuthor: song.song_author,
          songName: song.song_name,
        }),
      }))
      const trackKeys: TrackKey[] = subsonicTracks.map((track, index) => ({
        index,
        variants: buildTrackKey({
          artist: track.artist,
          title: track.title,
        }),
      }))
      mapKeysRef.current = mapKeys
      trackKeysRef.current = trackKeys

      // Run matching in the worker
      const matchClient = getMatchClient()
      const matchResults: MatchResult[] = await matchClient.match(
        {
          tracks: subsonicTracks.map((t, i) => ({ index: i, artist: t.artist, title: t.title })),
          maps: songs.map((s, i) => ({
            index: i,
            levelAuthor: s.level_author,
            songAuthor: s.song_author,
            songName: s.song_name,
          })),
          threshold: thresh,
        },
        (progress) => {
          setState((s) => ({ ...s, progress }))
        }
      )

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
