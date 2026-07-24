/**
 * Web Worker for running the matching engine off the main thread.
 *
 * Supports partitioning: the main thread can spawn N workers, each handling
 * a slice of tracks against the full map set.
 */

import {
  buildMapKey,
  buildTrackKey,
  matchAllTracks,
  type MapKey,
  type TrackKey,
  type MatchResult,
} from './matcher'

interface MatchWorkerRequest {
  type: 'match'
  tracks: { index: number; artist: string; title: string }[]
  maps: { index: number; levelAuthor: string; songAuthor: string; songName: string }[]
  threshold: number
  partition: number
  totalPartitions: number
}

interface MatchWorkerProgress {
  type: 'progress'
  phase: 'building-keys' | 'matching' | 'done'
  current: number
  total: number
  partition: number
}

interface MatchWorkerResult {
  type: 'result'
  results: MatchResult[]
  partition: number
}

self.onmessage = (event: MessageEvent<MatchWorkerRequest>) => {
  const { type, tracks, maps, threshold, partition } = event.data

  if (type !== 'match') return

  try {
    // Phase 1: Build track keys
    self.postMessage({
      type: 'progress',
      phase: 'building-keys',
      current: 0,
      total: tracks.length + maps.length,
      partition,
    } satisfies MatchWorkerProgress)

    const trackKeys: TrackKey[] = []
    for (let i = 0; i < tracks.length; i++) {
      trackKeys.push({
        index: tracks[i].index,
        ...buildTrackKey(tracks[i]),
      })
      if (i % 1000 === 0) {
        self.postMessage({
          type: 'progress',
          phase: 'building-keys',
          current: i,
          total: tracks.length + maps.length,
          partition,
        } satisfies MatchWorkerProgress)
      }
    }

    // Phase 2: Build map keys
    const mapKeys: MapKey[] = []
    for (let i = 0; i < maps.length; i++) {
      mapKeys.push({
        index: maps[i].index,
        ...buildMapKey(maps[i]),
      })
      if (i % 1000 === 0) {
        self.postMessage({
          type: 'progress',
          phase: 'building-keys',
          current: tracks.length + i,
          total: tracks.length + maps.length,
          partition,
        } satisfies MatchWorkerProgress)
      }
    }

    // Phase 3: Run matching
    self.postMessage({
      type: 'progress',
      phase: 'matching',
      current: 0,
      total: tracks.length,
      partition,
    } satisfies MatchWorkerProgress)

    const results = matchAllTracks(trackKeys, mapKeys, threshold, (current, total) => {
      self.postMessage({
        type: 'progress',
        phase: 'matching',
        current,
        total,
        partition,
      } satisfies MatchWorkerProgress)
    })

    self.postMessage({
      type: 'progress',
      phase: 'done',
      current: tracks.length,
      total: tracks.length,
      partition,
    } satisfies MatchWorkerProgress)

    self.postMessage({
      type: 'result',
      results,
      partition,
    } satisfies MatchWorkerResult)
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      partition,
    })
  }
}
