/**
 * Debug normalisation + matching on specific track/map pairs.
 *
 * Usage:
 *   npx tsx scripts/debug-matching.ts tmp/beatsaver-songs.json tmp/subsonic-tracks.json
 *
 * Finds specific tracks from the user's report and shows the full
 * normalisation + matching pipeline.
 */

import { readFileSync } from 'node:fs'
import {
  buildMapKey,
  buildTrackKey,
  computeMatchScore,
} from '../src/lib/matching/matcher'
import { fuzzyMatch } from '../src/lib/matching/fuzzy'
import {
  normalizeVariants,
  normalizeForMatching,
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
  normalized_key: string
}

function main() {
  const songs: BeatSaverSong[] = JSON.parse(readFileSync(process.argv[2] ?? 'tmp/beatsaver-songs.json', 'utf-8'))
  const tracks: SubsonicTrack[] = JSON.parse(readFileSync(process.argv[3] ?? 'tmp/subsonic-tracks.json', 'utf-8'))

  // Find the tracks mentioned in the user's report
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
    console.log(`  Raw: artist="${track.artist}" title="${track.title}"`)

    const strippedTitle = stripSuperfluousWords(stripAlbumParentheses(track.title))
    const strippedArtist = stripSuperfluousWords(stripAlbumParentheses(track.artist))
    console.log(`  Stripped: artist="${strippedArtist}" title="${strippedTitle}"`)

    const trackVariants = buildTrackKey({ artist: track.artist, title: track.title })
    console.log(`  Track variants: ${JSON.stringify(trackVariants)}`)

    // Find all maps that match this track at threshold 0.8
    const matchingMaps: { song: BeatSaverSong; score: number; mapVariants: string[] }[] = []
    for (const song of songs) {
      const mapVariants = buildMapKey({
        levelAuthor: song.level_author,
        songAuthor: song.song_author,
        songName: song.song_name,
      })
      if (mapVariants.length === 0) continue

      const score = computeMatchScore(trackVariants, mapVariants)
      if (score >= 0.8) {
        matchingMaps.push({ song, score, mapVariants })
      }
    }
    matchingMaps.sort((a, b) => b.score - a.score)

    console.log(`  Found ${matchingMaps.length} matching maps (threshold 0.8):`)
    for (const m of matchingMaps.slice(0, 5)) {
      console.log(`    [${(m.score * 100).toFixed(0)}%] "${m.song.song_name}" by ${m.song.song_author} (mapper: ${m.song.level_author})`)
      console.log(`      map variants: ${JSON.stringify(m.mapVariants)}`)

      // Show which variant pairs matched and why
      for (const tv of trackVariants) {
        for (const mv of m.mapVariants) {
          const fs = fuzzyMatch(tv, mv)
          if (fs >= 0.8) {
            const contains = tv.includes(mv) || mv.includes(tv)
            console.log(`      fuzzyMatch("${tv}", "${mv}") = ${fs.toFixed(3)} ${contains ? '(contains!)' : ''}`)
          }
        }
      }
    }
  }
}

main()
