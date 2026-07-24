import { describe, it, expect } from 'vitest'
import { songToBindParams, difficultyToBindParams, buildMetaEntries } from '@/lib/db/song-database'
import type { ParsedSong, ParsedDifficulty, ParsedDatabase } from '@/lib/proto/schema'

function makeSong(overrides: Partial<ParsedSong> = {}): ParsedSong {
  return {
    mapId: 31,
    key: '1f',
    hash: 'abcdef1234567890abcdef1234567890abcdef12',
    bpm: 120.5,
    upvotes: 10,
    downvotes: 5,
    rating: 0.625,
    uploadTime: 1700000000,
    duration: 180,
    songName: 'Test Song',
    songAuthor: 'Test Artist',
    levelAuthor: 'Test Mapper',
    uploaderName: 'Test Mapper',
    rankedStates: 1,
    rankedChangeTime: 0,
    tags: 0,
    uploadFlags: 1,
    ...overrides,
  }
}

function makeDifficulty(overrides: Partial<ParsedDifficulty> = {}): ParsedDifficulty {
  return {
    songMapId: 31,
    characteristic: 1,
    difficulty: 4,
    starsSs: 7.0,
    starsBl: 6.5,
    njs: 16.0,
    bombs: 5,
    notes: 300,
    obstacles: 50,
    mods: 4,
    ...overrides,
  }
}

describe('songToBindParams', () => {
  it('maps all song fields to bind array in correct order', () => {
    const song = makeSong()
    const params = songToBindParams(song, 1700000100)

    expect(params).toHaveLength(18)
    expect(params[0]).toBe(31) // map_id
    expect(params[1]).toBe('1f') // key
    expect(params[2]).toBe('abcdef1234567890abcdef1234567890abcdef12') // hash
    expect(params[3]).toBe(120.5) // bpm
    expect(params[4]).toBe(10) // upvotes
    expect(params[5]).toBe(5) // downvotes
    expect(params[6]).toBe(0.625) // rating
    expect(params[7]).toBe(1700000000) // upload_time
    expect(params[8]).toBe(180) // duration
    expect(params[9]).toBe('Test Song') // song_name
    expect(params[10]).toBe('Test Artist') // song_author
    expect(params[11]).toBe('Test Mapper') // level_author
    expect(params[12]).toBe('Test Mapper') // uploader_name
    expect(params[13]).toBe(1) // ranked_states
    expect(params[14]).toBe(0) // ranked_change_time
    expect(params[15]).toBe(0) // tags
    expect(params[16]).toBe(1) // upload_flags
    expect(params[17]).toBe(1700000100) // scrape_ended_time
  })

  it('uses scrape time from argument, not song', () => {
    const song = makeSong()
    const params = songToBindParams(song, 99999)
    expect(params[17]).toBe(99999)
  })
})

describe('difficultyToBindParams', () => {
  it('maps all difficulty fields to bind array in correct order', () => {
    const diff = makeDifficulty()
    const params = difficultyToBindParams(diff)

    expect(params).toHaveLength(10)
    expect(params[0]).toBe(31) // song_map_id
    expect(params[1]).toBe(1) // characteristic
    expect(params[2]).toBe(4) // difficulty
    expect(params[3]).toBe(7.0) // stars_ss
    expect(params[4]).toBe(6.5) // stars_bl
    expect(params[5]).toBe(16.0) // njs
    expect(params[6]).toBe(5) // bombs
    expect(params[7]).toBe(300) // notes
    expect(params[8]).toBe(50) // obstacles
    expect(params[9]).toBe(4) // mods
  })
})

describe('buildMetaEntries', () => {
  it('builds meta entries with scrape time and tag list', () => {
    const data: ParsedDatabase = {
      songs: [],
      difficulties: [],
      tagList: ['accuracy', 'dance'],
      scrapeEndedTime: 1700000100,
    }
    const entries = buildMetaEntries(data)

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual(['scrape_ended_time', '1700000100'])
    expect(entries[1]).toEqual(['tag_list', '["accuracy","dance"]'])
  })

  it('handles empty tag list', () => {
    const data: ParsedDatabase = {
      songs: [],
      difficulties: [],
      tagList: [],
      scrapeEndedTime: 0,
    }
    const entries = buildMetaEntries(data)

    expect(entries[0]).toEqual(['scrape_ended_time', '0'])
    expect(entries[1]).toEqual(['tag_list', '[]'])
  })
})
