import { readFileSync } from 'node:fs'
import { buildMapKey, buildTrackKey, buildMatchIndex, matchAllTracks, extractTrigrams, type MapKey, type TrackKey } from '../src/lib/matching/matcher'

function main() {
  const songs = JSON.parse(readFileSync('tmp/beatsaver-songs.json', 'utf-8'))
  const tracks = JSON.parse(readFileSync('tmp/subsonic-tracks.json', 'utf-8'))

  const mapKeys: MapKey[] = songs.map((s: any, i: number) => ({ index: i, ...buildMapKey({ levelAuthor: s.level_author, songAuthor: s.song_author, songName: s.song_name }) }))
  const trackKeys: TrackKey[] = tracks.map((t: any, i: number) => ({ index: i, ...buildTrackKey({ artist: t.artist, title: t.title }) }))

  // Check candidate set sizes with the updated findCandidates (2+ trigrams)
  console.log(`Building index...`)
  const index = buildMatchIndex(mapKeys)

  console.log(`\nCandidate set sizes (2+ shared trigrams) for first 100 tracks:`)
  let maxCandidates = 0
  let totalCandidates = 0
  for (let i = 0; i < Math.min(100, trackKeys.length); i++) {
    const track = trackKeys[i]
    for (const tv of track.titleVariants) {
      const candidates = new Map<number, number>()
      const uniqueTrigrams = new Set(extractTrigrams(tv))
      for (const trigram of uniqueTrigrams) {
        const maps = index.titleTrigramIndex.get(trigram)
        if (maps) for (const m of maps) candidates.set(m, (candidates.get(m) ?? 0) + 1)
      }
      let count = 0
      for (const [, c] of candidates) { if (c >= 2) count++ }
      if (count > maxCandidates) maxCandidates = count
      totalCandidates += count
    }
  }
  console.log(`  Max candidates: ${maxCandidates}`)
  console.log(`  Avg candidates per track: ${(totalCandidates / 100).toFixed(0)}`)

  // Time matching 200 tracks using actual matchAllTracks
  console.log(`\nMatching 200 tracks with matchAllTracks...`)
  const t1 = Date.now()
  const subset = trackKeys.slice(0, 200)
  const results = matchAllTracks(subset, mapKeys, 0.8, (c, t) => {
    if (c % 50 === 0) process.stdout.write(`\r  ${c}/${t} (${Date.now() - t1}ms)`)
  })
  console.log(`\r  200 tracks in ${Date.now() - t1}ms, ${results.length} matches`)
  console.log(`  Estimated total: ${((Date.now() - t1) * trackKeys.length / 200 / 1000).toFixed(0)}s`)
}

main()
