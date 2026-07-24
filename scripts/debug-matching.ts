/**
 * Debug normalisation + matching on specific track/map pairs.
 *
 * Usage:
 *   npx tsx scripts/debug-matching.ts tmp/beatsaver-songs.json tmp/subsonic-tracks.json
 */

import { readFileSync } from 'node:fs'
import {
  buildMapKey,
  buildTrackKey,
  computeMatchScore,
  type MapKey,
  type TrackKey,
} from '../src/lib/matching/matcher'
import { fuzzyMatch } from '../src/lib/matching/fuzzy'
import {
  stripAlbumParentheses,
  stripSuperfluousWords,
} from '../src/lib/matching/normalize'

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
  const songs: BeatSaverSong[] = JSON.parse(readFileSync(process.argv[2] ?? 'tmp/beatsaver-songs.json', 'utf-8'))
  const tracks: SubsonicTrack[] = JSON.parse(readFileSync(process.argv[3] ?? 'tmp/subsonic-tracks.json', 'utf-8'))

  const searchTerms = [
    'Let Me Remain',
    'Life Force',
    'In This Moment',
    'Lazy Sunday',
    'My Mother Wants Me Dead',
  ]

  for (const term of searchTerms) {
    const track = tracks.find((t) => t.title.toLowerCase().includes(term.toLowerCase()))
    if (!track) {
      console.log(`\n=== Track not found: "${term}" ===`)
      continue
    }

    console.log(`\n=== ${track.title} — ${track.artist} ===`)

    const trackKey = buildTrackKey({ artist: track.artist, title: track.title })
    console.log(`  Track artist variants: ${JSON.stringify(trackKey.artistVariants)}`)
    console.log(`  Track title variants: ${JSON.stringify(trackKey.titleVariants)}`)

    // Find all maps that match this track at threshold 0.8
    const matchingMaps: { song: BeatSaverSong; score: number; mapKey: MapKey }[] = []
    for (const song of songs) {
      const mapKey = buildMapKey({
        index: 0,
        levelAuthor: song.level_author,
        songAuthor: song.song_author,
        songName: song.song_name,
      } as any) as MapKey
      if (mapKey.artistVariants.length === 0 && mapKey.titleVariants.length === 0) continue

      const score = computeMatchScore(trackKey as TrackKey, mapKey)
      if (score >= 0.8) {
        matchingMaps.push({ song, score, mapKey })
      }
    }
    matchingMaps.sort((a, b) => b.score - a.score)

    console.log(`  Found ${matchingMaps.length} matching maps (threshold 0.8):`)
    for (const m of matchingMaps.slice(0, 5)) {
      console.log(`    [${(m.score * 100).toFixed(0)}%] "${m.song.song_name}" by ${m.song.song_author} (mapper: ${m.song.level_author})`)
      console.log(`      map artist variants: ${JSON.stringify(m.mapKey.artistVariants)}`)
      console.log(`      map title variants: ${JSON.stringify(m.mapKey.titleVariants)}`)

      // Show which variant pairs matched and why
      for (const ta of trackKey.artistVariants) {
        for (const ma of m.mapKey.artistVariants) {
          const fs = fuzzyMatch(ta, ma)
          if (fs >= 0.5) {
            console.log(`      artist fuzzyMatch("${ta}", "${ma}") = ${fs.toFixed(3)}`)
          }
        }
      }
      for (const tt of trackKey.titleVariants) {
        for (const mt of m.mapKey.titleVariants) {
          const fs = fuzzyMatch(tt, mt)
          if (fs >= 0.5) {
            console.log(`      title fuzzyMatch("${tt}", "${mt}") = ${fs.toFixed(3)}`)
          }
        }
      }
    }
  }
}

main()
