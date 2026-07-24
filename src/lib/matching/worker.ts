/**
 * Web Worker for one shard of the matching engine.
 *
 * The map set is partitioned across N workers, so key building and
 * indexing happen exactly once in total (split across workers, in
 * parallel) instead of once per worker. Each worker is persistent: shard
 * keys (and, via the matcher's index cache, the shard index) are built
 * once per data version and reused across matches.
 *
 * Protocol, driven by MatchClient:
 * 1. set-maps  — build keys for this worker's shard of the maps.
 * 2. probe     — build track keys, report which track artists have an
 *                exact variant hit in this shard.
 * 3. match     — match the probed tracks against the shard. The client
 *                passes the union of exact-hit artists from all shards so
 *                the fuzzy fallback is skipped exactly when an
 *                unpartitioned index would have skipped it.
 *
 * Scores are computed here too, so the main thread never builds keys.
 */

import {
  buildMapKey,
  buildTrackKey,
  collectExactArtistSignatures,
  computeMatchScore,
  matchAllTracks,
  type MapKey,
  type TrackKey,
} from './matcher'

interface SetMapsRequest {
  type: 'set-maps'
  version: string
  maps: { index: number; levelAuthor: string; songAuthor: string; songName: string }[]
}

interface ProbeRequest {
  type: 'probe'
  tracksToken: number
  tracks: { index: number; artist: string; title: string }[]
}

interface MatchRequest {
  type: 'match'
  tracksToken: number
  threshold: number
  /** Union of exact-hit artist signatures across ALL shards. */
  exactArtists: string[]
}

export interface ScoredMatch {
  mapIndex: number
  score: number
}

export interface ScoredMatchResult {
  trackIndex: number
  matches: ScoredMatch[]
}

interface WorkerProgress {
  type: 'progress'
  phase: 'building-keys' | 'matching' | 'done'
  current: number
  total: number
}

// Shard state, kept alive between messages. Map keys use LOCAL indices
// (the matcher requires maps[i].index === i); globalIndex translates back.
let mapKeys: MapKey[] = []
let globalIndex: number[] = []

// Track keys from the last probe, reused by the following match
let trackKeys: TrackKey[] = []
let tracksToken = -1

const postProgress = (phase: WorkerProgress['phase'], current: number, total: number) => {
  self.postMessage({ type: 'progress', phase, current, total } satisfies WorkerProgress)
}

self.onmessage = (event: MessageEvent<SetMapsRequest | ProbeRequest | MatchRequest>) => {
  const msg = event.data

  try {
    switch (msg.type) {
      case 'set-maps': {
        const keys: MapKey[] = new Array(msg.maps.length)
        const globals: number[] = new Array(msg.maps.length)
        for (let i = 0; i < msg.maps.length; i++) {
          keys[i] = { index: i, ...buildMapKey(msg.maps[i]) }
          globals[i] = msg.maps[i].index
          if (i % 5000 === 0) postProgress('building-keys', i, msg.maps.length)
        }
        mapKeys = keys
        globalIndex = globals
        self.postMessage({ type: 'maps-ready', version: msg.version, count: keys.length })
        break
      }

      case 'probe': {
        if (mapKeys.length === 0) throw new Error('no maps loaded — send set-maps first')

        const keys: TrackKey[] = new Array(msg.tracks.length)
        for (let i = 0; i < msg.tracks.length; i++) {
          keys[i] = { index: msg.tracks[i].index, ...buildTrackKey(msg.tracks[i]) }
        }
        trackKeys = keys
        tracksToken = msg.tracksToken

        const signatures = collectExactArtistSignatures(trackKeys, mapKeys)
        self.postMessage({ type: 'probe-result', tracksToken: msg.tracksToken, signatures })
        break
      }

      case 'match': {
        if (mapKeys.length === 0) throw new Error('no maps loaded — send set-maps first')
        if (msg.tracksToken !== tracksToken) {
          throw new Error('match without matching probe — send probe first')
        }

        const results = matchAllTracks(
          trackKeys,
          mapKeys,
          msg.threshold,
          (current, total) => postProgress('matching', current, total),
          500,
          { exactOnlyArtists: new Set(msg.exactArtists) },
        )

        // Compute scores here (main thread has no keys) and translate the
        // shard-local map indices back to global ones. Track keys are
        // positional (tracks[i].index === i from the client).
        const scored: ScoredMatchResult[] = results.map((r) => ({
          trackIndex: r.trackIndex,
          matches: r.mapIndices.map((localIdx) => ({
            mapIndex: globalIndex[localIdx],
            score: computeMatchScore(trackKeys[r.trackIndex], mapKeys[localIdx]),
          })),
        }))

        postProgress('done', trackKeys.length, trackKeys.length)
        self.postMessage({ type: 'result', tracksToken: msg.tracksToken, results: scored })
        break
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
