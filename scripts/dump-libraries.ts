/**
 * Dump both libraries to JSON for offline matching analysis.
 *
 * Downloads the BeatSaver dump from GitHub and fetches Subsonic tracks
 * from your server, then writes both to tmp/ as JSON.
 *
 * Usage:
 *   npx tsx scripts/dump-libraries.ts <subsonic-url> <subsonic-user> <subsonic-password>
 *
 * Example:
 *   npx tsx scripts/dump-libraries.ts https://music.example.com user pass
 *
 * Outputs:
 *   tmp/beatsaver-songs.json
 *   tmp/subsonic-tracks.json
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { fetchSongData } from '../src/lib/data/fetcher'
import { DIRECT_SOURCE } from '../src/lib/data/sources'
import { parseSongDetails } from '../src/lib/proto/parseSongDetails'
import { SubsonicClient } from '../src/lib/subsonic/client'
import { fetchAllSubsonicData } from '../src/lib/subsonic/fetcher'

async function main() {
  const [, , subsonicUrl, subsonicUser, subsonicPassword] = process.argv

  if (!subsonicUrl || !subsonicUser || !subsonicPassword) {
    console.error(
      'Usage: npx tsx scripts/dump-libraries.ts <subsonic-url> <subsonic-user> <subsonic-password>',
    )
    process.exit(1)
  }

  mkdirSync('tmp', { recursive: true })

  // --- BeatSaver ---
  console.log('Downloading BeatSaver dump...')
  const fetchResult = await fetchSongData(DIRECT_SOURCE)
  if (!fetchResult.bytes) {
    console.error('Failed to fetch BeatSaver data')
    process.exit(1)
  }

  console.log('Parsing BeatSaver protobuf...')
  const db = parseSongDetails(fetchResult.bytes)
  const songs = db.songs.map((s) => ({
    map_id: s.mapId,
    key: s.key,
    song_name: s.songName,
    song_author: s.songAuthor,
    level_author: s.levelAuthor,
  }))
  console.log(`  ${songs.length} songs`)
  writeFileSync('tmp/beatsaver-songs.json', JSON.stringify(songs, null, 2))

  // --- Subsonic ---
  console.log('\nFetching Subsonic tracks...')
  const client = new SubsonicClient(subsonicUrl, subsonicUser, subsonicPassword)
  await client.ping()

  const result = await fetchAllSubsonicData(client, (fetched) => {
    process.stdout.write(`\r  ${fetched.toLocaleString()} tracks fetched`)
  })
  console.log('')

  const tracks = result.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist ?? '',
    album: t.album ?? null,
  }))
  console.log(`  ${tracks.length} tracks`)
  writeFileSync('tmp/subsonic-tracks.json', JSON.stringify(tracks, null, 2))

  console.log('\nDone.')
  console.log('  tmp/beatsaver-songs.json')
  console.log('  tmp/subsonic-tracks.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
