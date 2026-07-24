import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SubsonicClient } from './client'
import type { Child } from './types'

/** Generate N fake songs for testing pagination. */
function makeSongs(n: number, startId: number = 0): Child[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(startId + i),
    title: `Song ${startId + i}`,
    isDir: false,
    artist: 'Test Artist',
    album: 'Test Album',
  }))
}

/** Build a mock search3 response JSON. */
function makeSearch3Response(songs: Child[]) {
  return {
    'subsonic-response': {
      status: 'ok',
      version: '1.16.1',
      searchResult3: {
        artist: [],
        album: [],
        song: songs,
      },
    },
  }
}

describe('SubsonicClient', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('ping', () => {
    it('succeeds on ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ 'subsonic-response': { status: 'ok', version: '1.16.1' } }),
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      await expect(client.ping()).resolves.toBeUndefined()
    })

    it('throws on failed response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            'subsonic-response': {
              status: 'failed',
              version: '1.16.1',
              error: { code: 40, message: 'Wrong username or password' },
            },
          }),
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      await expect(client.ping()).rejects.toThrow('Wrong username or password')
    })
  })

  describe('search3', () => {
    it('calls fetch with correct URL and parses response', async () => {
      const mockSongs = makeSongs(5)
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(makeSearch3Response(mockSongs)),
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      const result = await client.search3({ query: 'test', songCount: 5 })

      expect(result.song).toHaveLength(5)
      expect(result.song[0].id).toBe('0')

      // Verify fetch was called with a URL containing the endpoint
      const fetchCall = (globalThis.fetch as any).mock.calls[0][0] as string
      expect(fetchCall).toContain('/rest/search3')
      expect(fetchCall).toContain('u=user')
      expect(fetchCall).toContain('f=json')
      expect(fetchCall).toContain('query=test')
    })
  })

  describe('fetchAllTracks', () => {
    it('fetches all tracks across multiple pages', async () => {
      // Simulate 2 full pages of 10000 + 1 partial page of 5000
      const page1 = makeSongs(10000, 0)
      const page2 = makeSongs(10000, 10000)
      const page3 = makeSongs(5000, 20000)

      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++
        const songs = callCount === 1 ? page1 : callCount === 2 ? page2 : page3
        return Promise.resolve({
          json: () => Promise.resolve(makeSearch3Response(songs)),
        })
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      const tracks = await client.fetchAllTracks()

      expect(tracks).toHaveLength(25000)
      expect(tracks[0].id).toBe('0')
      expect(tracks[24999].id).toBe('24999')
      expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    })

    it('fetches a single page when results fit in one page', async () => {
      const songs = makeSongs(100)
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(makeSearch3Response(songs)),
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      const tracks = await client.fetchAllTracks()

      expect(tracks).toHaveLength(100)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })

    it('calls onProgress with fetched counts', async () => {
      const page1 = makeSongs(10000, 0)
      const page2 = makeSongs(5000, 10000)

      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++
        const songs = callCount === 1 ? page1 : page2
        return Promise.resolve({
          json: () => Promise.resolve(makeSearch3Response(songs)),
        })
      }) as any

      const progressCalls: [number, number][] = []
      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      await client.fetchAllTracks((fetched, total) => {
        progressCalls.push([fetched, total])
      })

      expect(progressCalls).toHaveLength(2)
      expect(progressCalls[0]).toEqual([10000, 10000])
      expect(progressCalls[1]).toEqual([15000, 15000])
    })

    it('handles empty result set', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(makeSearch3Response([])),
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      const tracks = await client.fetchAllTracks()

      expect(tracks).toHaveLength(0)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getCoverArt', () => {
    it('fetches cover art as blob', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' })
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      const blob = await client.getCoverArt('art-123')

      expect(blob).toBe(mockBlob)
      const fetchCall = (globalThis.fetch as any).mock.calls[0][0] as string
      expect(fetchCall).toContain('/rest/getCoverArt')
      expect(fetchCall).toContain('id=art-123')
    })

    it('throws on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }) as any

      const client = new SubsonicClient('https://example.com', 'user', 'pass')
      await expect(client.getCoverArt('missing')).rejects.toThrow('getCoverArt failed: 404')
    })
  })
})
