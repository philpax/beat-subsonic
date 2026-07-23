/**
 * Protobuf wire-format schema interfaces for the songDetails2_v3 format.
 *
 * These match the C# definitions in kinsi55/BeatSaberScrappedData:
 * - SongProto.cs
 * - SongDifficultyProto.cs
 * - SongProtoContainer.cs
 *
 * Field numbers are documented in JSDoc on each field.
 */

/**
 * SongProtoContainer — the root message in the .gz dump.
 *
 * Fields:
 *  - formatVersion (1, uint32) — must be 3 for v3 format
 *  - scrapeEndedTimeUnix (2, uint32) — when the scrape completed
 *  - songHashes (3, bytes) — single blob of concatenated 20-byte SHA1 hashes
 *  - songs (4, repeated SongProto) — the song list
 *  - tagList (5, repeated string) — tag names indexed by bit position in SongProto.tags
 */
export interface SongProtoContainer {
  /** Field 1 — format version, must equal 3 */
  formatVersion: number
  /** Field 2 — unix timestamp when scrape ended */
  scrapeEndedTimeUnix: number
  /** Field 3 — raw bytes of concatenated 20-byte SHA1 hashes */
  songHashes: Uint8Array
  /** Field 4 — repeated SongProto */
  songs: SongProto[]
  /** Field 5 — repeated string of tag names */
  tagList: string[]
}

/**
 * SongProto — a single song entry.
 *
 * Fields:
 *  - bpm (1, float / fixed32)
 *  - upvotes (2, uint32)
 *  - downvotes (3, uint32)
 *  - uploadTimeUnix (4, uint32)
 *  - mapId (5, uint32)
 *  - songDurationSeconds (6, uint32)
 *  - songName (7, string)
 *  - songAuthorName (8, string)
 *  - levelAuthorName (9, string)
 *  - uploaderName (10, string — optional, falls back to levelAuthorName)
 *  - difficulties (11, repeated SongDifficultyProto)
 *  - rankedChangeUnix (12, uint32)
 *  - rankedStates (13, uint32 flags — see RankedStates)
 *  - tags (14, uint64 bitfield — bit i corresponds to tagList[i])
 *  - uploadFlags (15, uint32 flags — see UploadFlags)
 */
export interface SongProto {
  bpm: number
  upvotes: number
  downvotes: number
  uploadTimeUnix: number
  mapId: number
  songDurationSeconds: number
  songName: string
  songAuthorName: string
  levelAuthorName: string
  uploaderName: string | null
  difficulties: SongDifficultyProto[]
  rankedChangeUnix: number
  rankedStates: number
  /** uint64 bitfield — bit i = tagList[i] is set */
  tags: number
  uploadFlags: number
}

/**
 * SongDifficultyProto — a difficulty row within a SongProto.
 *
 * Fields:
 *  - characteristic (1, uint32 — see MapCharacteristic)
 *  - difficulty (2, uint32 — see MapDifficulty)
 *  - [field 3 is unused / reserved]
 *  - starsT100 (4, uint32 — divide by 100 for ScoreSaber stars)
 *  - starsT100BL (5, uint32 — divide by 100 for BeatLeader stars)
 *  - njsT100 (6, uint32 — divide by 100 for NJS)
 *  - bombs (7, uint32)
 *  - notes (8, uint32)
 *  - obstacles (9, uint32)
 *  - mods (10, uint32 flags — see MapMods)
 */
export interface SongDifficultyProto {
  characteristic: number
  difficulty: number
  starsT100: number
  starsT100BL: number
  njsT100: number
  bombs: number
  notes: number
  obstacles: number
  mods: number
}

// ---- Parsed (derived) types ----

/** A parsed difficulty row, flattened with a reference to its parent song. */
export interface ParsedDifficulty {
  songMapId: number
  characteristic: number
  difficulty: number
  starsSs: number
  starsBl: number
  njs: number
  bombs: number
  notes: number
  obstacles: number
  mods: number
}

/** A parsed song with derived fields computed. */
export interface ParsedSong {
  mapId: number
  key: string
  hash: string
  bpm: number
  upvotes: number
  downvotes: number
  rating: number
  uploadTime: number
  duration: number
  songName: string
  songAuthor: string
  levelAuthor: string
  uploaderName: string
  rankedStates: number
  rankedChangeTime: number
  tags: number
  uploadFlags: number
}

/** The full parsed database ready for SQLite import. */
export interface ParsedDatabase {
  songs: ParsedSong[]
  difficulties: ParsedDifficulty[]
  tagList: string[]
  scrapeEndedTime: number
}
