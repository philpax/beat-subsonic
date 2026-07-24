/**
 * Dump BeatSaver and Subsonic libraries to JSON for offline matching analysis.
 *
 * Usage from project root:
 *   npx tsx scripts/dump-libraries.ts
 *
 * Outputs:
 *   tmp/beatsaver-songs.json  — all songs with key fields for matching
 *   tmp/subsonic-tracks.json  — all tracks with key fields for matching
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { writeFileSync, mkdirSync } from 'node:fs'

async function main() {
  const sqlite3 = await sqlite3InitModule()
  const db = new sqlite3.oo1.DB('beatsaver-maps.sqlite3', 'r') as any

  // Dump BeatSaver songs
  console.log('Dumping BeatSaver songs...')
  const songs = db.exec(
    'SELECT map_id, key, song_name, song_author, level_author FROM songs ORDER BY map_id',
    { returnValue: 'resultRows', rowMode: 'object' }
  )
  console.log(`  ${songs.length} songs`)

  // Dump Subsonic tracks
  console.log('Dumping Subsonic tracks...')
  let tracks: any[] = []
  try {
    tracks = db.exec(
      'SELECT id, title, artist, album FROM subsonic_tracks ORDER BY id',
      { returnValue: 'resultRows', rowMode: 'object' }
    )
    console.log(`  ${tracks.length} tracks`)
  } catch {
    console.log('  No subsonic_tracks table found')
  }

  db.close()

  mkdirSync('tmp', { recursive: true })
  writeFileSync('tmp/beatsaver-songs.json', JSON.stringify(songs, null, 2))
  writeFileSync('tmp/subsonic-tracks.json', JSON.stringify(tracks, null, 2))

  console.log('Done: tmp/beatsaver-songs.json, tmp/subsonic-tracks.json')
}

main().catch(console.error)
