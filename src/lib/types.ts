/** Song row shape as returned by SQLite queries. */

export interface SongRow {
  map_id: number
  key: string
  hash: string
  bpm: number
  upvotes: number
  downvotes: number
  rating: number
  upload_time: number
  duration: number
  song_name: string
  song_author: string
  level_author: string
  uploader_name: string
  ranked_states: number
  ranked_change_time: number
  tags: number
  upload_flags: number
  scrape_ended_time: number
}

export interface DifficultyRow {
  id: number
  song_map_id: number
  characteristic: number
  difficulty: number
  stars_ss: number
  stars_bl: number
  njs: number
  bombs: number
  notes: number
  obstacles: number
  mods: number
}

/** Build a OneClick URL for a song. */
export function buildOneClickUrl(key: string): string {
  return `beatsaver://${key}`
}

/** Build the BeatSaver map page URL. */
export function buildMapPageUrl(key: string): string {
  return `https://beatsaver.com/maps/${key}`
}

/** Build the direct download URL. */
export function buildDownloadUrl(key: string): string {
  return `https://beatsaver.com/api/download/key/${key}`
}

/** Build the cover art URL. */
export function buildCoverUrl(hash: string): string {
  return `https://cdn.beatsaver.com/${hash}.jpg`
}
