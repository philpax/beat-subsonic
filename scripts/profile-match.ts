import { readFileSync } from 'node:fs'
import { buildMapKey, buildTrackKey, buildMatchIndex, matchAllTracks, type MapKey, type TrackKey } from '../src/lib/matching/matcher'
import { fuzzyMatch } from '../src/lib/matching/fuzzy'

function main() {
  const songs = JSON.parse(readFileSync('tmp/beatsaver-songs.json', 'utf-8'))
  const tracks = JSON.parse(readFileSync('tmp/subsonic-tracks.json', 'utf-8'))

  const mapKeys: MapKey[] = songs.map((s: any, i: number) => ({ index: i, ...buildMapKey({ levelAuthor: s.level_author, songAuthor: s.song_author, songName: s.song_name }) }))
  const trackKeys: TrackKey[] = tracks.map((t: any, i: number) => ({ index: i, ...buildTrackKey({ artist: t.artist, title: t.title }) }))

  // Build index
  const t0 = Date.now()
  const index = buildMatchIndex(mapKeys)
  console.log(`Index built in ${Date.now() - t0}ms`)
  console.log(`  artistIndex entries: ${index.artistIndex.size}`)
  console.log(`  titleTrigramIndex entries: ${index.titleTrigramIndex.size}`)
  console.log(`  titleVariantIndex entries: ${index.titleVariantIndex.size}`)

  // Profile: how many tracks hit the artist index vs trigram fallback?
  let artistHit = 0
  let trigramFallback = 0
  let artistCandidateTotal = 0
  let trigramCandidateTotal = 0
  let maxArtistCandidates = 0
  let maxTrigramCandidates = 0

  // Also profile: how many fuzzyMatch calls per track?
  let totalFuzzyCalls = 0
  let totalTitleChecks = 0
  let totalArtistChecks = 0

  for (let i = 0; i < trackKeys.length; i++) {
    const track = trackKeys[i]

    // Check artist index
    let candidates = new Set<number>()
    for (const av of track.artistVariants) {
      const maps = index.artistIndex.get(av)
      if (maps) for (const m of maps) candidates.add(m)
    }

    if (candidates.size > 0) {
      artistHit++
      artistCandidateTotal += candidates.size
      if (candidates.size > maxArtistCandidates) maxArtistCandidates = candidates.size
    } else {
      // Trigram fallback
      trigramFallback++
      for (const tv of track.titleVariants) {
        const trigrams = new Set([...tv.slice(0)].reduce((acc: string[], _, idx) => {
          if (idx + 3 <= tv.length) acc.push(tv.slice(idx, idx + 3))
          return acc
        }, []))
        const minShared = Math.max(2, Math.ceil(trigrams.size * 0.25))
        const counts = new Map<number, number>()
        for (const trigram of trigrams) {
          const maps = index.titleTrigramIndex.get(trigram)
          if (maps) for (const m of maps) counts.set(m, (counts.get(m) ?? 0) + 1)
        }
        for (const [mapIdx, count] of counts) {
          if (count >= minShared) {
            candidates.add(mapIdx)
            trigramCandidateTotal++
            if (candidates.size > maxTrigramCandidates) maxTrigramCandidates = candidates.size
          }
        }
      }
    }
  }

  console.log(`\nCandidate sources:`)
  console.log(`  Artist index hits: ${artistHit} / ${trackKeys.length} (${(artistHit / trackKeys.length * 100).toFixed(1)}%)`)
  console.log(`  Trigram fallback: ${trigramFallback} / ${trackKeys.length} (${(trigramFallback / trackKeys.length * 100).toFixed(1)}%)`)
  console.log(`  Avg artist candidates: ${artistHit > 0 ? (artistCandidateTotal / artistHit).toFixed(0) : 0}`)
  console.log(`  Max artist candidates: ${maxArtistCandidates}`)
  console.log(`  Avg trigram candidates: ${trigramFallback > 0 ? (trigramCandidateTotal / trigramFallback).toFixed(0) : 0}`)
  console.log(`  Max trigram candidates: ${maxTrigramCandidates}`)

  // Now profile the actual matching with timing breakdowns
  console.log(`\nProfiling 1000 tracks...`)
  const subset = trackKeys.slice(0, 1000)

  const t1 = Date.now()
  let candidateTime = 0
  let artistCheckTime = 0
  let titleCheckTime = 0

  for (const track of subset) {
    // Candidate lookup
    const tc0 = Date.now()
    const candidates = new Set<number>()
    for (const av of track.artistVariants) {
      const maps = index.artistIndex.get(av)
      if (maps) for (const m of maps) candidates.add(m)
    }
    if (candidates.size === 0) {
      for (const tv of track.titleVariants) {
        const trigrams = new Set([...tv.slice(0)].reduce((acc: string[], _, idx) => {
          if (idx + 3 <= tv.length) acc.push(tv.slice(idx, idx + 3))
          return acc
        }, []))
        const minShared = Math.max(2, Math.ceil(trigrams.size * 0.25))
        const counts = new Map<number, number>()
        for (const trigram of trigrams) {
          const maps = index.titleTrigramIndex.get(trigram)
          if (maps) for (const m of maps) counts.set(m, (counts.get(m) ?? 0) + 1)
        }
        for (const [mapIdx, count] of counts) {
          if (count >= minShared) candidates.add(mapIdx)
        }
      }
    }
    candidateTime += Date.now() - tc0

    for (const mapIdx of candidates) {
      const map = mapKeys[mapIdx]
      if (!map) continue

      // Artist check
      const ta0 = Date.now()
      let artistOk = false
      for (const ta of track.artistVariants) {
        for (const ma of map.artistVariants) {
          totalArtistChecks++
          if (ta === ma || ta.includes(ma) || ma.includes(ta) || fuzzyMatch(ta, ma) >= 0.85) {
            artistOk = true
            break
          }
        }
        if (artistOk) break
      }
      artistCheckTime += Date.now() - ta0

      if (!artistOk) continue

      // Title check
      const tt0 = Date.now()
      for (const tt of track.titleVariants) {
        for (const mt of map.titleVariants) {
          totalTitleChecks++
          totalFuzzyCalls++
          if (tt === mt || tt.includes(mt) || mt.includes(tt) || fuzzyMatch(tt, mt) >= 0.85) {
            break
          }
        }
      }
      titleCheckTime += Date.now() - tt0
    }
  }

  const totalTime = Date.now() - t1
  console.log(`  Total: ${totalTime}ms`)
  console.log(`  Candidate lookup: ${candidateTime}ms (${(candidateTime / totalTime * 100).toFixed(0)}%)`)
  console.log(`  Artist checks: ${artistCheckTime}ms (${(artistCheckTime / totalTime * 100).toFixed(0)}%)`)
  console.log(`  Title checks: ${titleCheckTime}ms (${(titleCheckTime / totalTime * 100).toFixed(0)}%)`)
  console.log(`  Total artist checks: ${totalArtistChecks}`)
  console.log(`  Total title checks: ${totalTitleChecks}`)
  console.log(`  Total fuzzy calls: ${totalFuzzyCalls}`)
}

main()
