/**
 * Browser console script to dump both libraries to JSON files.
 *
 * Paste this into the browser dev console on the BeatSubsonic page.
 * It will download two JSON files: beatsaver-songs.json and subsonic-tracks.json
 */

;(async () => {
  const { getDbClient } = await import('/src/lib/db/client.ts')

  const client = getDbClient()
  await client.init()

  // Dump BeatSaver songs (minimal fields for matching)
  const songs = await client.querySongs({
    page: 1,
    pageSize: 500000,
    sort: 'upload_time',
    sortDir: 'desc',
  })

  // Dump Subsonic tracks
  const tracks = await client.subsonicGetTracks()

  // Download as JSON files
  const download = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const songData = songs.rows.map((s) => ({
    map_id: s.map_id,
    key: s.key,
    song_name: s.song_name,
    song_author: s.song_author,
    level_author: s.level_author,
  }))

  download(songData, 'beatsaver-songs.json')
  console.log(`Dumped ${songData.length} BeatSaver songs`)

  download(tracks, 'subsonic-tracks.json')
  console.log(`Dumped ${tracks.length} Subsonic tracks`)
})()
