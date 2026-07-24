import { readFileSync } from 'node:fs'
import { buildMapKey, buildTrackKey, matchAllTracks, computeMatchScore, type MapKey, type TrackKey } from '../src/lib/matching/matcher'

function main() {
  const songs = JSON.parse(readFileSync('tmp/beatsaver-songs.json', 'utf-8'))
  const tracks = JSON.parse(readFileSync('tmp/subsonic-tracks.json', 'utf-8'))

  const mapKeys: MapKey[] = songs.map((s: any, i: number) => ({ index: i, ...buildMapKey({ levelAuthor: s.level_author, songAuthor: s.song_author, songName: s.song_name }) }))
  const trackKeys: TrackKey[] = tracks.map((t: any, i: number) => ({ index: i, ...buildTrackKey({ artist: t.artist, title: t.title }) }))

  console.log('Matching...')
  const t0 = Date.now()
  const results = matchAllTracks(trackKeys, mapKeys, 0.8, (c, t) => {
    if (c % 5000 === 0) process.stdout.write(`\r  ${c}/${t}`)
  })
  console.log(`\r  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // Match count distribution
  const dist = new Map<number, number>()
  for (const r of results) {
    const c = r.mapIndices.length
    dist.set(c, (dist.get(c) ?? 0) + 1)
  }
  console.log('\nMatch count distribution:')
  const sorted = [...dist.entries()].sort((a, b) => a[0] - b[0])
  for (const [count, num] of sorted) {
    console.log(`  ${count} matches: ${num} tracks`)
  }

  // Show tracks with the most matches
  const byMatchCount = [...results].sort((a, b) => b.mapIndices.length - a.mapIndices.length)
  console.log('\nTracks with most matches (top 15):')
  for (const r of byMatchCount.slice(0, 15)) {
    const track = tracks[r.trackIndex]
    console.log(`\n  ${track.title} — ${track.artist} (${r.mapIndices.length} matches)`)
    for (const mapIdx of r.mapIndices.slice(0, 5)) {
      const song = songs[mapIdx]
      const score = computeMatchScore(trackKeys[r.trackIndex], mapKeys[mapIdx])
      console.log(`    [${(score * 100).toFixed(0)}%] "${song.song_name}" by ${song.song_author} (mapper: ${song.level_author})`)
    }
    if (r.mapIndices.length > 5) console.log(`    ... and ${r.mapIndices.length - 5} more`)
  }

  // Show some 0.8-0.85 scored matches to check quality
  console.log('\n\nBorderline matches (score 0.80-0.85, first 20):')
  let shown = 0
  for (const r of results) {
    if (shown >= 20) break
    const track = tracks[r.trackIndex]
    for (const mapIdx of r.mapIndices) {
      const score = computeMatchScore(trackKeys[r.trackIndex], mapKeys[mapIdx])
      if (score >= 0.8 && score < 0.86) {
        const song = songs[mapIdx]
        console.log(`  [${(score * 100).toFixed(0)}%] "${track.title}" by ${track.artist} → "${song.song_name}" by ${song.song_author} (mapper: ${song.level_author})`)
        shown++
        if (shown >= 20) break
      }
    }
  }
}

main()
