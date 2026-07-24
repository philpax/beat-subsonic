/**
 * Matching analysis tool — runs the matching engine against dumped JSON
 * and prints statistics + sample results for tuning.
 *
 * Usage:
 *   npx tsx scripts/analyze-matching.ts tmp/beatsaver-songs.json tmp/subsonic-tracks.json
 *
 * Or with a custom threshold:
 *   npx tsx scripts/analyze-matching.ts tmp/beatsaver-songs.json tmp/subsonic-tracks.json 0.85
 */

import { readFileSync } from 'node:fs'
import {
  buildMapKey,
  buildTrackKey,
  matchAllTracks,
  computeMatchScore,
  type MapKey,
  type TrackKey,
} from '../src/lib/matching/matcher'
import { fuzzyMatch } from '../src/lib/matching/fuzzy'
import { normalizeVariants, normalizeForMatching } from '../src/lib/matching/normalize'

interface BeatSaverSong {
  map_id: number
  key: string
  song_name: string
  song_author: string
  level_author: string
}

interface SubsonicTrack {
  id: string
  title: string
  artist: string
  album: string | null
  normalized_key: string
}

function main() {
  const songsPath = process.argv[2] ?? 'tmp/beatsaver-songs.json'
  const tracksPath = process.argv[3] ?? 'tmp/subsonic-tracks.json'
  const threshold = parseFloat(process.argv[4] ?? '0.8')

  console.log(`Loading data...`)
  const songs: BeatSaverSong[] = JSON.parse(readFileSync(songsPath, 'utf-8'))
  const tracks: SubsonicTrack[] = JSON.parse(readFileSync(tracksPath, 'utf-8'))
  console.log(`  ${songs.length} BeatSaver songs`)
  console.log(`  ${tracks.length} Subsonic tracks`)
  console.log(`  threshold: ${threshold}`)

  // Build keys
  console.log(`\nBuilding keys...`)
  const mapKeys: MapKey[] = songs.map((s, i) => ({
    index: i,
    variants: buildMapKey({
      levelAuthor: s.level_author,
      songAuthor: s.song_author,
      songName: s.song_name,
    }),
  }))
  const trackKeys: TrackKey[] = tracks.map((t, i) => ({
    index: i,
    variants: buildTrackKey({ artist: t.artist, title: t.title }),
  }))

  // Stats on key generation
  const emptyMapKeys = mapKeys.filter((m) => m.variants.length === 0).length
  const emptyTrackKeys = trackKeys.filter((t) => t.variants.length === 0).length
  console.log(`  ${emptyMapKeys} maps with empty keys (${(emptyMapKeys / mapKeys.length * 100).toFixed(1)}%)`)
  console.log(`  ${emptyTrackKeys} tracks with empty keys (${(emptyTrackKeys / trackKeys.length * 100).toFixed(1)}%)`)

  // Run matching
  console.log(`\nMatching...`)
  const startTime = Date.now()
  const results = matchAllTracks(trackKeys, mapKeys, threshold, (current, total) => {
    if (current % 5000 === 0) {
      process.stdout.write(`\r  ${current.toLocaleString()} / ${total.toLocaleString()}`)
    }
  })
  const elapsed = Date.now() - startTime
  console.log(`\r  Done in ${(elapsed / 1000).toFixed(1)}s`)
  console.log(`  ${results.length} tracks matched (${(results.length / tracks.length * 100).toFixed(1)}% of tracks)`)

  // Match count distribution
  const matchCounts = results.map((r) => r.mapIndices.length)
  const maxMatches = Math.max(...matchCounts)
  const avgMatches = (matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length).toFixed(1)
  console.log(`  Avg matches per track: ${avgMatches}`)
  console.log(`  Max matches for a track: ${maxMatches}`)

  // Score distribution
  const scores = results.map((r) => {
    const track = trackKeys[r.trackIndex]
    const bestScore = Math.max(...r.mapIndices.map((mapIdx) => {
      const map = mapKeys[mapIdx]
      return computeMatchScore(track.variants, map.variants)
    }))
    return bestScore
  })
  const scoreBuckets = { '1.0': 0, '0.9-0.99': 0, '0.8-0.89': 0, '0.7-0.79': 0, '<0.7': 0 }
  for (const s of scores) {
    if (s >= 1.0) scoreBuckets['1.0']++
    else if (s >= 0.9) scoreBuckets['0.9-0.99']++
    else if (s >= 0.8) scoreBuckets['0.8-0.89']++
    else if (s >= 0.7) scoreBuckets['0.7-0.79']++
    else scoreBuckets['<0.7']++
  }
  console.log(`\nScore distribution:`)
  for (const [bucket, count] of Object.entries(scoreBuckets)) {
    console.log(`  ${bucket}: ${count} (${(count / results.length * 100).toFixed(1)}%)`)
  }

  // Print sample results — first 30, sorted by score descending
  console.log(`\nSample results (top 30 by score):`)
  const sortedResults = results
    .map((r) => {
      const track = tracks[r.trackIndex]
      const trackKey = trackKeys[r.trackIndex]
      const matches = r.mapIndices.map((mapIdx) => {
        const song = songs[mapIdx]
        const mapKey = mapKeys[mapIdx]
        const score = computeMatchScore(trackKey.variants, mapKey.variants)
        return { song, score, mapVariants: mapKey.variants }
      })
      matches.sort((a, b) => b.score - a.score)
      const bestScore = matches[0]?.score ?? 0
      return { track, matches, bestScore, trackVariants: trackKey.variants }
    })
    .sort((a, b) => b.bestScore - a.bestScore)

  for (const r of sortedResults.slice(0, 30)) {
    console.log(`\n  ${r.track.title} — ${r.track.artist}`)
    console.log(`    track variants: ${JSON.stringify(r.trackVariants)}`)
    console.log(`    best score: ${(r.bestScore * 100).toFixed(0)}%`)
    for (const m of r.matches.slice(0, 3)) {
      console.log(`      → "${m.song.song_name}" by ${m.song.song_author} (mapper: ${m.song.level_author}) [${(m.score * 100).toFixed(0)}%]`)
      console.log(`        map variants: ${JSON.stringify(m.mapVariants)}`)
    }
  }

  // Print some likely-false-positive examples (score 0.8-0.85)
  console.log(`\n\nLikely false positives (score 0.80-0.85):`)
  const borderline = sortedResults.filter((r) => r.bestScore >= 0.8 && r.bestScore < 0.86).slice(0, 20)
  for (const r of borderline) {
    console.log(`\n  ${r.track.title} — ${r.track.artist}`)
    console.log(`    track variants: ${JSON.stringify(r.trackVariants)}`)
    const m = r.matches[0]
    console.log(`      → "${m.song.song_name}" by ${m.song.song_author} (mapper: ${m.song.level_author}) [${(m.score * 100).toFixed(0)}%]`)
    console.log(`        map variants: ${JSON.stringify(m.mapVariants)}`)
  }
}

main()
