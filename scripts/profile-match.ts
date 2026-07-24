/**
 * Benchmark the matching pipeline against the real data dumps in tmp/.
 *
 *   npx tsx scripts/profile-match.ts
 *
 * Reports key building, cold matchAllTracks (includes index build), warm
 * matchAllTracks (index cache hit), and the match counts so behavioral
 * changes show up alongside timing changes.
 */
import { readFileSync } from 'node:fs'
import {
  buildMapKey,
  buildTrackKey,
  buildMatchIndex,
  matchAllTracks,
  type MapKey,
  type TrackKey,
} from '../src/lib/matching/matcher'

function main() {
  const songs = JSON.parse(readFileSync('tmp/beatsaver-songs.json', 'utf-8'))
  const tracks = JSON.parse(readFileSync('tmp/subsonic-tracks.json', 'utf-8'))

  let t0 = performance.now()
  const mapKeys: MapKey[] = songs.map((s: any, i: number) => ({
    index: i,
    ...buildMapKey({ levelAuthor: s.level_author, songAuthor: s.song_author, songName: s.song_name }),
  }))
  const trackKeys: TrackKey[] = tracks.map((t: any, i: number) => ({
    index: i,
    ...buildTrackKey({ artist: t.artist, title: t.title }),
  }))
  console.log(`key building:          ${(performance.now() - t0).toFixed(0)}ms`)

  t0 = performance.now()
  const index = buildMatchIndex(mapKeys)
  console.log(`index build:           ${(performance.now() - t0).toFixed(0)}ms`)
  console.log(`  unique artist variants: ${index.artistVariants.length}`)
  console.log(`  title variants:         ${index.titleVariantIndex.size}`)

  t0 = performance.now()
  const cold = matchAllTracks(trackKeys, mapKeys, 0.85)
  console.log(`matchAllTracks (cold): ${(performance.now() - t0).toFixed(0)}ms`)

  t0 = performance.now()
  matchAllTracks(trackKeys, mapKeys, 0.85)
  console.log(`matchAllTracks (warm): ${(performance.now() - t0).toFixed(0)}ms`)

  const pairs = cold.reduce((acc, r) => acc + r.mapIndices.length, 0)
  console.log(`matches: ${cold.length} tracks, ${pairs} track-map pairs`)
}

main()
