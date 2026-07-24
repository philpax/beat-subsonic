/**
 * Matching analysis tool — runs the matching engine against dumped JSON
 * and prints statistics + sample results for tuning.
 *
 * Usage:
 *   npx tsx scripts/analyze-matching.ts tmp/beatsaver-songs.json tmp/subsonic-tracks.json [threshold]
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

  console.log(`\nBuilding keys...`)
  const mapKeys: MapKey[] = songs.map((s, i) => ({
    index: i,
    ...buildMapKey({
      levelAuthor: s.level_author,
      songAuthor: s.song_author,
      songName: s.song_name,
    }),
  }))
  const trackKeys: TrackKey[] = tracks.map((t, i) => ({
    index: i,
    ...buildTrackKey({ artist: t.artist, title: t.title }),
  }))

  const emptyMapKeys = mapKeys.filter((m) => m.titleVariants.length === 0).length
  const emptyTrackKeys = trackKeys.filter((t) => t.titleVariants.length === 0).length
  console.log(`  ${emptyMapKeys} maps with empty title keys`)
  console.log(`  ${emptyTrackKeys} tracks with empty title keys`)

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

  const matchCounts = results.map((r) => r.mapIndices.length)
  const avgMatches = (matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length).toFixed(1)
  console.log(`  Avg matches per track: ${avgMatches}`)

  // Score distribution — only for matched tracks
  const scores: number[] = []
  for (const r of results) {
    const track = trackKeys[r.trackIndex]
    let bestScore = 0
    for (const mapIdx of r.mapIndices) {
      const s = computeMatchScore(track, mapKeys[mapIdx])
      if (s > bestScore) bestScore = s
    }
    scores.push(bestScore)
  }
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

  // Sample results
  console.log(`\nSample results (top 30 by score):`)
  const sortedResults = results
    .map((r) => {
      const track = tracks[r.trackIndex]
      const trackKey = trackKeys[r.trackIndex]
      const matches = r.mapIndices.map((mapIdx) => {
        const song = songs[mapIdx]
        const mapKey = mapKeys[mapIdx]
        const score = computeMatchScore(trackKey, mapKey)
        return { song, score }
      })
      matches.sort((a, b) => b.score - a.score)
      const bestScore = matches[0]?.score ?? 0
      return { track, matches, bestScore }
    })
    .sort((a, b) => b.bestScore - a.bestScore)

  for (const r of sortedResults.slice(0, 30)) {
    console.log(`\n  ${r.track.title} — ${r.track.artist}`)
    console.log(`    best score: ${(r.bestScore * 100).toFixed(0)}%`)
    for (const m of r.matches.slice(0, 3)) {
      console.log(`      → "${m.song.song_name}" by ${m.song.song_author} (mapper: ${m.song.level_author}) [${(m.score * 100).toFixed(0)}%]`)
    }
  }
}

main()
