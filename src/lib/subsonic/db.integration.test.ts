import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { SubsonicDatabase } from './db'
import { SCHEMA_SQL_SUBSONIC } from '../db/schema.sql'
import type { Child } from './types'
import type { SqliteDb } from '../db/song-database'

let sqlite3: any
let db: SqliteDb

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule()
  db = new sqlite3.oo1.DB(':memory:') as SqliteDb
  db.exec(SCHEMA_SQL_SUBSONIC)
})

afterAll(() => {
  db.close()
})

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

describe('SubsonicDatabase integration', () => {
  it('imports tracks and retrieves them', () => {
    const subsonicDb = new SubsonicDatabase()
    subsonicDb.open(db)

    const tracks: Child[] = [
      makeTrack({ id: '1', title: 'Song One', artist: 'Artist A' }),
      makeTrack({ id: '2', title: 'Song Two', artist: 'Artist B' }),
      makeTrack({ id: '3', title: 'Song Three', artist: 'Artist A' }),
    ]

    const fetchedAt = 1700000000
    subsonicDb.importTracks(tracks, fetchedAt)

    const allTracks = subsonicDb.getAllTracks()
    expect(allTracks).toHaveLength(3)
    // Should be ordered by artist, then title
    expect(allTracks[0].artist).toBe('Artist A')
    expect(allTracks[0].title).toBe('Song One')
    expect(allTracks[1].artist).toBe('Artist A')
    expect(allTracks[1].title).toBe('Song Three')
    expect(allTracks[2].artist).toBe('Artist B')
    expect(allTracks[2].title).toBe('Song Two')
  })

  it('returns correct track count', () => {
    const subsonicDb = new SubsonicDatabase()
    subsonicDb.open(db)

    const tracks: Child[] = [
      makeTrack({ id: '10', title: 'A', artist: 'X' }),
      makeTrack({ id: '11', title: 'B', artist: 'Y' }),
    ]

    subsonicDb.importTracks(tracks, 1700000001)
    expect(subsonicDb.getTrackCount()).toBe(2)
  })

  it('stores and retrieves fetchedAt timestamp', () => {
    const subsonicDb = new SubsonicDatabase()
    subsonicDb.open(db)

    const fetchedAt = 1700000500
    subsonicDb.importTracks([makeTrack({ id: '20' })], fetchedAt)

    expect(subsonicDb.getFetchedAt()).toBe(fetchedAt)
  })

  it('returns null fetchedAt when no data has been imported', () => {
    const subsonicDb = new SubsonicDatabase()
    // Use a fresh in-memory DB
    const freshDb = new sqlite3.oo1.DB(':memory:') as SqliteDb
    freshDb.exec(SCHEMA_SQL_SUBSONIC)
    subsonicDb.open(freshDb)

    expect(subsonicDb.getFetchedAt()).toBeNull()
    freshDb.close()
  })

  it('replaces existing data on re-import', () => {
    const subsonicDb = new SubsonicDatabase()
    subsonicDb.open(db)

    subsonicDb.importTracks(
      [makeTrack({ id: '30', title: 'Old', artist: 'Old Artist' })],
      1700000000,
    )
    expect(subsonicDb.getTrackCount()).toBe(1)

    subsonicDb.importTracks(
      [makeTrack({ id: '31', title: 'New', artist: 'New Artist' })],
      1700000001,
    )
    expect(subsonicDb.getTrackCount()).toBe(1)
    const tracks = subsonicDb.getAllTracks()
    expect(tracks[0].id).toBe('31')
    expect(tracks[0].title).toBe('New')
  })

  it('computes normalized_key for each track', () => {
    const subsonicDb = new SubsonicDatabase()
    subsonicDb.open(db)

    subsonicDb.importTracks(
      [makeTrack({ id: '40', title: 'Body F10ating10', artist: 'Camellia' })],
      1700000000,
    )

    const tracks = subsonicDb.getAllTracks()
    expect(tracks[0].normalized_key).toBe('camelliabodyf10ating10')
  })

  it('clears all data', () => {
    const subsonicDb = new SubsonicDatabase()
    subsonicDb.open(db)

    subsonicDb.importTracks(
      [makeTrack({ id: '50', title: 'To Clear', artist: 'Artist' })],
      1700000000,
    )
    expect(subsonicDb.getTrackCount()).toBe(1)

    subsonicDb.clear()
    expect(subsonicDb.getTrackCount()).toBe(0)
    expect(subsonicDb.getFetchedAt()).toBeNull()
  })

  it('getStats returns combined stats', () => {
    const subsonicDb = new SubsonicDatabase()
    subsonicDb.open(db)

    const fetchedAt = 1700000700
    subsonicDb.importTracks(
      [
        makeTrack({ id: '60', title: 'A', artist: 'X' }),
        makeTrack({ id: '61', title: 'B', artist: 'Y' }),
      ],
      fetchedAt,
    )

    const stats = subsonicDb.getStats()
    expect(stats.trackCount).toBe(2)
    expect(stats.fetchedAt).toBe(fetchedAt)
  })
})
