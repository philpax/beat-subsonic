/**
 * Top-level parser for the songDetails2_v3 format.
 *
 * Takes decompressed bytes (the content of songDetails2_v3.gz),
 * decodes the SongProtoContainer protobuf message, and returns
 * a structured ParsedDatabase ready for SQLite import.
 */

import type {
  SongProtoContainer,
  SongProto,
  SongDifficultyProto,
  ParsedSong,
  ParsedDifficulty,
  ParsedDatabase,
} from './schema'
import { decodeMessage, ProtoReader } from './decoder'

/**
 * Compute the BeatSaver rating from upvotes and downvotes.
 *
 * Formula:
 *   score = upvotes / (upvotes + downvotes)
 *   rating = score - (score - 0.5) * 2^(-log3((total/2) + 1))
 *
 * where log3 is base-3 logarithm.
 * If total votes is 0, rating is 0.
 */
export function computeRating(upvotes: number, downvotes: number): number {
  const total = upvotes + downvotes
  if (total === 0) return 0
  const score = upvotes / total
  // log3(x) = ln(x) / ln(3)
  const log3 = Math.log(total / 2 + 1) / Math.log(3)
  const exponent = -log3
  const rating = score - (score - 0.5) * Math.pow(2, exponent)
  return Math.round(rating * 1000) / 1000 // round to 3 decimal places
}

/** Convert a mapId to a hex key string (lowercase, no leading 0x). */
export function mapIdToKey(mapId: number): string {
  return mapId.toString(16)
}

/** Convert 20 bytes to a lowercase hex hash string. */
export function bytesToHash(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/** Decode a single SongDifficultyProto from a length-delimited bytes field. */
function decodeDifficulty(bytes: Uint8Array): SongDifficultyProto {
  const diff: SongDifficultyProto = {
    characteristic: 0,
    difficulty: 0,
    starsT100: 0,
    starsT100BL: 0,
    njsT100: 0,
    bombs: 0,
    notes: 0,
    obstacles: 0,
    mods: 0,
  }
  decodeMessage(
    bytes,
    (fieldNumber, wireType, reader) => {
      switch (fieldNumber) {
        case 1: // characteristic (uint32)
          diff.characteristic = reader.readVarint()
          break
        case 2: // difficulty (uint32)
          diff.difficulty = reader.readVarint()
          break
        case 3: // unused / reserved
          reader.skipField(wireType)
          break
        case 4: // starsT100 (uint32)
          diff.starsT100 = reader.readVarint()
          break
        case 5: // starsT100BL (uint32)
          diff.starsT100BL = reader.readVarint()
          break
        case 6: // njsT100 (uint32)
          diff.njsT100 = reader.readVarint()
          break
        case 7: // bombs (uint32)
          diff.bombs = reader.readVarint()
          break
        case 8: // notes (uint32)
          diff.notes = reader.readVarint()
          break
        case 9: // obstacles (uint32)
          diff.obstacles = reader.readVarint()
          break
        case 10: // mods (uint32 flags)
          diff.mods = reader.readVarint()
          break
        default:
          reader.skipField(wireType)
          break
      }
    },
    0,
    bytes.length,
  )
  return diff
}

/** Decode a single SongProto from a length-delimited bytes field. */
function decodeSong(bytes: Uint8Array): SongProto {
  const song: SongProto = {
    bpm: 0,
    upvotes: 0,
    downvotes: 0,
    uploadTimeUnix: 0,
    mapId: 0,
    songDurationSeconds: 0,
    songName: '',
    songAuthorName: '',
    levelAuthorName: '',
    uploaderName: null,
    difficulties: [],
    rankedChangeUnix: 0,
    rankedStates: 0,
    tags: 0,
    uploadFlags: 0,
  }

  decodeMessage(
    bytes,
    (fieldNumber, wireType, reader) => {
      switch (fieldNumber) {
        case 1: // bpm (float, wire type 5 = fixed32)
          song.bpm = reader.readFloat()
          break
        case 2: // upvotes (uint32)
          song.upvotes = reader.readVarint()
          break
        case 3: // downvotes (uint32)
          song.downvotes = reader.readVarint()
          break
        case 4: // uploadTimeUnix (uint32)
          song.uploadTimeUnix = reader.readVarint()
          break
        case 5: // mapId (uint32)
          song.mapId = reader.readVarint()
          break
        case 6: // songDurationSeconds (uint32)
          song.songDurationSeconds = reader.readVarint()
          break
        case 7: // songName (string)
          song.songName = reader.readString()
          break
        case 8: // songAuthorName (string)
          song.songAuthorName = reader.readString()
          break
        case 9: // levelAuthorName (string)
          song.levelAuthorName = reader.readString()
          break
        case 10: // uploaderName (string, optional)
          song.uploaderName = reader.readString()
          break
        case 11: // difficulties (repeated SongDifficultyProto)
          song.difficulties.push(decodeDifficulty(reader.readBytes()))
          break
        case 12: // rankedChangeUnix (uint32)
          song.rankedChangeUnix = reader.readVarint()
          break
        case 13: // rankedStates (uint32 flags)
          song.rankedStates = reader.readVarint()
          break
        case 14: // tags (uint64 bitfield)
          song.tags = reader.readVarint64()
          break
        case 15: // uploadFlags (uint32 flags)
          song.uploadFlags = reader.readVarint()
          break
        default:
          reader.skipField(wireType)
          break
      }
    },
    0,
    bytes.length,
  )

  return song
}

/** Decode the top-level SongProtoContainer. */
function decodeContainer(bytes: Uint8Array): SongProtoContainer {
  const container: SongProtoContainer = {
    formatVersion: 0,
    scrapeEndedTimeUnix: 0,
    songHashes: new Uint8Array(),
    songs: [],
    tagList: [],
  }

  decodeMessage(
    bytes,
    (fieldNumber, wireType, reader) => {
      switch (fieldNumber) {
        case 1: // formatVersion (uint32)
          container.formatVersion = reader.readVarint()
          break
        case 2: // scrapeEndedTimeUnix (uint32)
          container.scrapeEndedTimeUnix = reader.readVarint()
          break
        case 3: // songHashes (bytes)
          container.songHashes = reader.readBytes()
          break
        case 4: // songs (repeated SongProto)
          container.songs.push(decodeSong(reader.readBytes()))
          break
        case 5: // tagList (repeated string)
          container.tagList.push(reader.readString())
          break
        default:
          reader.skipField(wireType)
          break
      }
    },
    0,
    bytes.length,
  )

  return container
}

/**
 * Parse the full songDetails2_v3 dump.
 *
 * @param bytes - Decompressed protobuf bytes
 * @returns ParsedDatabase with songs, difficulties, tagList, and scrape time
 * @throws if formatVersion !== 3
 */
export function parseSongDetails(bytes: Uint8Array): ParsedDatabase {
  const container = decodeContainer(bytes)

  if (container.formatVersion !== 3) {
    throw new Error(`Unsupported format version: ${container.formatVersion} (expected 3)`)
  }

  const songs: ParsedSong[] = []
  const difficulties: ParsedDifficulty[] = []
  const hashBytes = container.songHashes
  const expectedHashLength = container.songs.length * 20
  if (hashBytes.length < expectedHashLength) {
    throw new Error(
      `songHashes blob too short: ${hashBytes.length} bytes, expected ${expectedHashLength} (${container.songs.length} songs × 20 bytes)`,
    )
  }

  for (let i = 0; i < container.songs.length; i++) {
    const proto = container.songs[i]
    const uploaderName = proto.uploaderName ?? proto.levelAuthorName

    // Extract the 20-byte hash for this song
    const hashOffset = i * 20
    const hashSlice = hashBytes.subarray(hashOffset, hashOffset + 20)
    const hash = bytesToHash(hashSlice)

    const song: ParsedSong = {
      mapId: proto.mapId,
      key: mapIdToKey(proto.mapId),
      hash,
      bpm: proto.bpm,
      upvotes: proto.upvotes,
      downvotes: proto.downvotes,
      rating: computeRating(proto.upvotes, proto.downvotes),
      uploadTime: proto.uploadTimeUnix,
      duration: proto.songDurationSeconds,
      songName: proto.songName,
      songAuthor: proto.songAuthorName,
      levelAuthor: proto.levelAuthorName,
      uploaderName,
      rankedStates: proto.rankedStates,
      rankedChangeTime: proto.rankedChangeUnix,
      tags: proto.tags,
      uploadFlags: proto.uploadFlags,
    }
    songs.push(song)

    // Flatten difficulties with FK to parent song
    for (const diff of proto.difficulties) {
      difficulties.push({
        songMapId: proto.mapId,
        characteristic: diff.characteristic,
        difficulty: diff.difficulty,
        starsSs: diff.starsT100 / 100,
        starsBl: diff.starsT100BL / 100,
        njs: diff.njsT100 / 100,
        bombs: diff.bombs,
        notes: diff.notes,
        obstacles: diff.obstacles,
        mods: diff.mods,
      })
    }
  }

  return {
    songs,
    difficulties,
    tagList: container.tagList,
    scrapeEndedTime: container.scrapeEndedTimeUnix,
  }
}

/** Re-export for testing convenience */
export { ProtoReader }
