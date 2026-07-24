import { describe, it, expect } from 'vitest'
import { parseSearch3Response, isSubsonicResponseOk, getSubsonicError } from './types'

describe('parseSearch3Response', () => {
  it('parses a full search3 response', () => {
    const raw = {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.1',
        searchResult3: {
          artist: [{ id: '1', name: 'Artist', albumCount: 5 }],
          album: [{ id: '10', name: 'Album', songCount: 10, duration: 600 }],
          song: [
            { id: '100', title: 'Song One', isDir: false, artist: 'Artist', album: 'Album' },
            { id: '101', title: 'Song Two', isDir: false, artist: 'Artist', album: 'Album' },
          ],
        },
      },
    }

    const result = parseSearch3Response(raw)
    expect(result.artist).toHaveLength(1)
    expect(result.artist[0].name).toBe('Artist')
    expect(result.album).toHaveLength(1)
    expect(result.song).toHaveLength(2)
    expect(result.song[0].id).toBe('100')
    expect(result.song[0].title).toBe('Song One')
    expect(result.song[0].isDir).toBe(false)
  })

  it('defaults missing arrays to empty', () => {
    const raw = {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.1',
        searchResult3: {},
      },
    }

    const result = parseSearch3Response(raw)
    expect(result.artist).toEqual([])
    expect(result.album).toEqual([])
    expect(result.song).toEqual([])
  })

  it('handles missing searchResult3', () => {
    const raw = {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.1',
      },
    }

    const result = parseSearch3Response(raw)
    expect(result.artist).toEqual([])
    expect(result.song).toEqual([])
  })
})

describe('isSubsonicResponseOk', () => {
  it('returns true for ok status', () => {
    const raw = { 'subsonic-response': { status: 'ok', version: '1.16.1' } }
    expect(isSubsonicResponseOk(raw)).toBe(true)
  })

  it('returns false for failed status', () => {
    const raw = {
      'subsonic-response': {
        status: 'failed',
        version: '1.16.1',
        error: { code: 40, message: 'Wrong username or password' },
      },
    }
    expect(isSubsonicResponseOk(raw)).toBe(false)
  })

  it('returns false for missing response', () => {
    expect(isSubsonicResponseOk({})).toBe(false)
    expect(isSubsonicResponseOk(null)).toBe(false)
  })
})

describe('getSubsonicError', () => {
  it('extracts error message and code', () => {
    const raw = {
      'subsonic-response': {
        status: 'failed',
        version: '1.16.1',
        error: { code: 40, message: 'Wrong username or password' },
      },
    }
    const error = getSubsonicError(raw)
    expect(error).toBe('Wrong username or password (code 40)')
  })

  it('returns null for ok response', () => {
    const raw = { 'subsonic-response': { status: 'ok', version: '1.16.1' } }
    expect(getSubsonicError(raw)).toBe(null)
  })

  it('returns null for missing error', () => {
    const raw = { 'subsonic-response': { status: 'failed', version: '1.16.1' } }
    expect(getSubsonicError(raw)).toBe(null)
  })
})
