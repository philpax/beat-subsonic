import { describe, it, expect } from 'vitest'
import { trackToBindParams, computeNormalizedKey } from './db'
import type { Child } from './types'

function makeTrack(overrides: Partial<Child> = {}): Child {
  return {
    id: 'track-1',
    title: 'Test Song',
    isDir: false,
    artist: 'Test Artist',
    album: 'Test Album',
    ...overrides,
  }
}

describe('computeNormalizedKey', () => {
  it('computes normalized key from artist + title', () => {
    const key = computeNormalizedKey({ artist: 'Camellia', title: 'Body F10ating10' })
    expect(key).toBe('camelliabodyf10ating10')
  })

  it('folds diacritics', () => {
    const key = computeNormalizedKey({ artist: 'Röyksopp', title: 'Eple' })
    expect(key).toBe('royksoppeple')
  })

  it('strips punctuation', () => {
    const key = computeNormalizedKey({ artist: 'AC/DC', title: 'Back in Black' })
    expect(key).toBe('acdcbackinblack')
  })

  it('lowercases', () => {
    const key = computeNormalizedKey({ artist: 'CAMELLIA', title: 'GHOST' })
    expect(key).toBe('camelliaghost')
  })

  it('handles empty strings', () => {
    const key = computeNormalizedKey({ artist: '', title: '' })
    expect(key).toBe('')
  })
})

describe('trackToBindParams', () => {
  it('maps all fields to bind array in correct order', () => {
    const track = makeTrack({
      id: '123',
      title: 'My Song',
      artist: 'My Artist',
      album: 'My Album',
      albumId: 'album-1',
      artistId: 'artist-1',
      duration: 240,
      track: 5,
      discNumber: 1,
      year: 2023,
      genre: 'Electronic',
      suffix: 'flac',
      bitRate: 1411,
      path: 'music/artist/album/song.flac',
      coverArt: 'art-123',
    })
    const fetchedAt = 1700000000
    const params = trackToBindParams(track, fetchedAt)

    expect(params).toHaveLength(17)
    expect(params[0]).toBe('123')           // id
    expect(params[1]).toBe('My Song')        // title
    expect(params[2]).toBe('My Artist')      // artist
    expect(params[3]).toBe('My Album')       // album
    expect(params[4]).toBe('album-1')        // album_id
    expect(params[5]).toBe('artist-1')      // artist_id
    expect(params[6]).toBe(240)              // duration
    expect(params[7]).toBe(5)                // track_number
    expect(params[8]).toBe(1)               // disc_number
    expect(params[9]).toBe(2023)             // year
    expect(params[10]).toBe('Electronic')    // genre
    expect(params[11]).toBe('flac')          // suffix
    expect(params[12]).toBe(1411)            // bit_rate
    expect(params[13]).toBe('music/artist/album/song.flac') // path
    expect(params[14]).toBe('art-123')      // cover_art
    expect(params[15]).toBe('myartistmysong') // normalized_key
    expect(params[16]).toBe(1700000000)      // fetched_at
  })

  it('uses null for missing optional fields', () => {
    const track: Child = {
      id: '1',
      title: 'Song',
      isDir: false,
      artist: 'Artist',
    }
    const params = trackToBindParams(track, 1000)

    expect(params[3]).toBeNull()   // album
    expect(params[4]).toBeNull()   // album_id
    expect(params[5]).toBeNull()   // artist_id
    expect(params[6]).toBeNull()   // duration
    expect(params[7]).toBeNull()   // track_number
    expect(params[8]).toBeNull()   // disc_number
    expect(params[9]).toBeNull()   // year
    expect(params[10]).toBeNull()  // genre
    expect(params[11]).toBeNull()  // suffix
    expect(params[12]).toBeNull()  // bit_rate
    expect(params[13]).toBeNull()  // path
    expect(params[14]).toBeNull()  // cover_art
  })

  it('uses empty string for missing artist', () => {
    const track: Child = {
      id: '1',
      title: 'Song',
      isDir: false,
    }
    const params = trackToBindParams(track, 1000)
    expect(params[2]).toBe('')  // artist defaults to empty string
  })

  it('computes normalized_key from artist + title', () => {
    const track = makeTrack({ artist: 'Camellia', title: 'Body F10ating10' })
    const params = trackToBindParams(track, 1000)
    expect(params[15]).toBe('camelliabodyf10ating10')
  })
})
