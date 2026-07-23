import { describe, it, expect } from 'vitest'
import { ProtoReader, decodeMessage, WireType } from '@/lib/proto/decoder'
import {
  parseSongDetails,
  computeRating,
  mapIdToKey,
  bytesToHash,
} from '@/lib/proto/parseSongDetails'

// Helper to build a byte array from numbers
function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals)
}

// Helper to encode a varint
function encodeVarint(value: number): number[] {
  const out: number[] = []
  value = value >>> 0
  while (value > 0x7f) {
    out.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  out.push(value)
  return out
}

// Helper to encode a tag
function encodeTag(fieldNumber: number, wireType: number): number[] {
  return encodeVarint((fieldNumber << 3) | wireType)
}

// Helper to encode a string field (wire type 2)
function encodeStringField(fieldNumber: number, str: string): number[] {
  const encoded = new TextEncoder().encode(str)
  return [
    ...encodeTag(fieldNumber, WireType.LengthDelimited),
    ...encodeVarint(encoded.length),
    ...Array.from(encoded),
  ]
}

// Helper to encode a uint32 field (wire type 0)
function encodeVarintField(fieldNumber: number, value: number): number[] {
  return [...encodeTag(fieldNumber, WireType.Varint), ...encodeVarint(value)]
}

// Helper to encode a float field (wire type 5 = fixed32)
function encodeFloatField(fieldNumber: number, value: number): number[] {
  const buf = new ArrayBuffer(4)
  new DataView(buf).setFloat32(0, value, true)
  const arr = new Uint8Array(buf)
  return [...encodeTag(fieldNumber, WireType.Fixed32), ...Array.from(arr)]
}

// Helper to encode a bytes field (wire type 2)
function encodeBytesField(fieldNumber: number, data: Uint8Array): number[] {
  return [
    ...encodeTag(fieldNumber, WireType.LengthDelimited),
    ...encodeVarint(data.length),
    ...Array.from(data),
  ]
}

describe('ProtoReader', () => {
  it('reads varints', () => {
    const reader = new ProtoReader(bytes(0x08, 0x96, 0x01)) // tag(1,0), varint 150
    reader.readTag() // skip tag
    expect(reader.readVarint()).toBe(150)
  })

  it('reads strings', () => {
    const data = bytes(...encodeStringField(1, 'hello'))
    const reader = new ProtoReader(data)
    const tag = reader.readTag()!
    expect(tag[0]).toBe(1)
    expect(tag[1]).toBe(WireType.LengthDelimited)
    expect(reader.readString()).toBe('hello')
  })

  it('reads floats', () => {
    const data = bytes(...encodeFloatField(1, 128.5))
    const reader = new ProtoReader(data)
    reader.readTag()
    expect(reader.readFloat()).toBeCloseTo(128.5, 1)
  })

  it('skips unknown fields', () => {
    const data = bytes(
      ...encodeVarintField(1, 42),
      ...encodeStringField(99, 'unknown'),
      ...encodeVarintField(2, 99)
    )
    const values: Record<number, number | string> = {}
    decodeMessage(data, (fieldNumber, wireType, reader) => {
      if (fieldNumber === 1) values[1] = reader.readVarint()
      else if (fieldNumber === 2) values[2] = reader.readVarint()
      else reader.skipField(wireType)
    })
    expect(values[1]).toBe(42)
    expect(values[2]).toBe(99)
  })
})

describe('computeRating', () => {
  it('returns 0 when no votes', () => {
    expect(computeRating(0, 0)).toBe(0)
  })

  it('computes rating for all upvotes', () => {
    const rating = computeRating(100, 0)
    expect(rating).toBeGreaterThan(0.5)
    expect(rating).toBeLessThanOrEqual(1)
  })

  it('computes rating for mixed votes', () => {
    const rating = computeRating(50, 50)
    // score = 0.5, so rating should be exactly 0.5
    expect(rating).toBe(0.5)
  })
})

describe('mapIdToKey', () => {
  it('converts decimal to hex key', () => {
    expect(mapIdToKey(31)).toBe('1f')
    expect(mapIdToKey(255)).toBe('ff')
    expect(mapIdToKey(1)).toBe('1')
  })
})

describe('bytesToHash', () => {
  it('converts bytes to hex string', () => {
    const hash = bytesToHash(bytes(0xab, 0xcd, 0xef))
    expect(hash).toBe('abcdef')
  })

  it('pads single-digit bytes', () => {
    const hash = bytesToHash(bytes(0x0a, 0x01))
    expect(hash).toBe('0a01')
  })
})

describe('parseSongDetails', () => {
  it('throws on wrong format version', () => {
    const data = bytes(...encodeVarintField(1, 2)) // formatVersion = 2
    expect(() => parseSongDetails(data)).toThrow('Unsupported format version')
  })

  it('parses a minimal valid container', () => {
    // Build a SongProtoContainer with formatVersion=3, one song, one tag
    const songBytes = bytes(
      ...encodeFloatField(1, 120.0), // bpm
      ...encodeVarintField(2, 10), // upvotes
      ...encodeVarintField(3, 5), // downvotes
      ...encodeVarintField(4, 1700000000), // uploadTimeUnix
      ...encodeVarintField(5, 31), // mapId
      ...encodeVarintField(6, 180), // songDurationSeconds
      ...encodeStringField(7, 'Test Song'), // songName
      ...encodeStringField(8, 'Test Artist'), // songAuthorName
      ...encodeStringField(9, 'Test Mapper'), // levelAuthorName
      // uploaderName (field 10) omitted — should fall back to levelAuthorName
      ...encodeVarintField(13, 1), // rankedStates = ScoresaberRanked
      ...encodeVarintField(15, 1), // uploadFlags = Curated
    )

    const hashBlob = new Uint8Array(20) // 20 zero bytes for one song's hash
    const containerBytes = bytes(
      ...encodeVarintField(1, 3), // formatVersion = 3
      ...encodeVarintField(2, 1700000100), // scrapeEndedTimeUnix
      ...encodeBytesField(3, hashBlob), // songHashes
      ...encodeBytesField(4, songBytes), // songs[0]
      ...encodeStringField(5, 'accuracy'), // tagList[0]
    )

    const result = parseSongDetails(containerBytes)

    expect(result.scrapeEndedTime).toBe(1700000100)
    expect(result.songs.length).toBe(1)
    expect(result.tagList).toEqual(['accuracy'])

    const song = result.songs[0]
    expect(song.mapId).toBe(31)
    expect(song.key).toBe('1f')
    expect(song.bpm).toBeCloseTo(120.0, 1)
    expect(song.upvotes).toBe(10)
    expect(song.downvotes).toBe(5)
    expect(song.uploadTime).toBe(1700000000)
    expect(song.duration).toBe(180)
    expect(song.songName).toBe('Test Song')
    expect(song.songAuthor).toBe('Test Artist')
    expect(song.levelAuthor).toBe('Test Mapper')
    expect(song.uploaderName).toBe('Test Mapper') // fallback
    expect(song.rankedStates).toBe(1)
    expect(song.uploadFlags).toBe(1)
    expect(song.hash).toBe('0000000000000000000000000000000000000000')
    expect(result.difficulties.length).toBe(0)
  })

  it('parses a song with difficulties including skipped field 3', () => {
    // Build a SongDifficultyProto with field 3 present (should be skipped)
    const diffBytes = bytes(
      ...encodeVarintField(1, 1), // characteristic = Standard
      ...encodeVarintField(2, 4), // difficulty = ExpertPlus
      ...encodeVarintField(3, 999), // unused field 3 — should be skipped
      ...encodeVarintField(4, 700), // starsT100 = 7.00 stars
      ...encodeVarintField(5, 650), // starsT100BL = 6.50 stars
      ...encodeVarintField(6, 1600), // njsT100 = 16.00
      ...encodeVarintField(7, 5), // bombs
      ...encodeVarintField(8, 300), // notes
      ...encodeVarintField(9, 50), // obstacles
      ...encodeVarintField(10, 4), // mods = Chroma
    )

    const songBytes = bytes(
      ...encodeFloatField(1, 100.0),
      ...encodeVarintField(5, 1), // mapId
      ...encodeStringField(7, 'Song With Diff'),
      ...encodeStringField(8, 'Artist'),
      ...encodeStringField(9, 'Mapper'),
      ...encodeBytesField(11, diffBytes), // difficulties[0]
    )

    const hashBlob = new Uint8Array(20)
    const containerBytes = bytes(
      ...encodeVarintField(1, 3),
      ...encodeBytesField(3, hashBlob),
      ...encodeBytesField(4, songBytes),
    )

    const result = parseSongDetails(containerBytes)

    expect(result.songs.length).toBe(1)
    expect(result.difficulties.length).toBe(1)

    const diff = result.difficulties[0]
    expect(diff.songMapId).toBe(1)
    expect(diff.characteristic).toBe(1)
    expect(diff.difficulty).toBe(4)
    expect(diff.starsSs).toBe(7.0)
    expect(diff.starsBl).toBe(6.5)
    expect(diff.njs).toBe(16.0)
    expect(diff.bombs).toBe(5)
    expect(diff.notes).toBe(300)
    expect(diff.obstacles).toBe(50)
    expect(diff.mods).toBe(4)
  })

  it('parses multiple songs with correct hash extraction', () => {
    const song1 = bytes(
      ...encodeVarintField(5, 1), // mapId = 1
      ...encodeStringField(7, 'Song 1'),
      ...encodeStringField(8, 'Author 1'),
      ...encodeStringField(9, 'Mapper 1'),
    )
    const song2 = bytes(
      ...encodeVarintField(5, 2), // mapId = 2
      ...encodeStringField(7, 'Song 2'),
      ...encodeStringField(8, 'Author 2'),
      ...encodeStringField(9, 'Mapper 2'),
    )

    // Two 20-byte hashes: first all 0xaa, second all 0xbb
    const hashBlob = new Uint8Array(40)
    hashBlob.fill(0xaa, 0, 20)
    hashBlob.fill(0xbb, 20, 40)

    const containerBytes = bytes(
      ...encodeVarintField(1, 3),
      ...encodeBytesField(3, hashBlob),
      ...encodeBytesField(4, song1),
      ...encodeBytesField(4, song2),
    )

    const result = parseSongDetails(containerBytes)

    expect(result.songs.length).toBe(2)
    expect(result.songs[0].hash).toBe('aa'.repeat(20))
    expect(result.songs[1].hash).toBe('bb'.repeat(20))
  })

  it('handles uploaderName explicitly set', () => {
    const songBytes = bytes(
      ...encodeVarintField(5, 1),
      ...encodeStringField(7, 'Song'),
      ...encodeStringField(8, 'Author'),
      ...encodeStringField(9, 'Mapper'),
      ...encodeStringField(10, 'Uploader123'),
    )

    const hashBlob = new Uint8Array(20)
    const containerBytes = bytes(
      ...encodeVarintField(1, 3),
      ...encodeBytesField(3, hashBlob),
      ...encodeBytesField(4, songBytes),
    )

    const result = parseSongDetails(containerBytes)
    expect(result.songs[0].uploaderName).toBe('Uploader123')
  })
})
