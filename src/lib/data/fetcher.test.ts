import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchSongData,
  buildFetchHeaders,
  interpretResponse,
  extractCacheHeader,
} from '@/lib/data/fetcher'
import { getStoredEtag, setStoredEtag, clearStoredEtags } from '@/lib/data/cache'
import { planAfterFetch } from '@/lib/data'
import type { DataSource } from '@/lib/data/sources'

// Mock localStorage
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}
vi.stubGlobal('localStorage', localStorageMock)

const mockSource: DataSource = {
  id: 'Direct',
  url: 'https://example.com/test.gz',
}

function createMockResponse(
  status: number,
  body: Uint8Array | null,
  etag?: string
): Response {
  const headers = new Headers()
  if (etag) headers.set('ETag', etag)
  const stream = body
    ? new ReadableStream({
        start(controller) {
          controller.enqueue(body)
          controller.close()
        },
      })
    : null
  return new Response(stream, { status, headers })
}

class MockDecompressionStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor() {
    super()
  }
}

// ---- Pure function tests ----

describe('buildFetchHeaders', () => {
  it('returns empty object when no ETag', () => {
    expect(buildFetchHeaders(undefined)).toEqual({})
  })

  it('returns If-None-Match header when ETag provided', () => {
    expect(buildFetchHeaders('abc123')).toEqual({ 'If-None-Match': 'abc123' })
  })
})

describe('interpretResponse', () => {
  it('returns changed=false on 304', () => {
    expect(interpretResponse(304, null)).toEqual({ changed: false })
  })

  it('returns changed=true with etag on 200', () => {
    expect(interpretResponse(200, 'etag-1')).toEqual({ changed: true, etag: 'etag-1' })
  })

  it('returns changed=true with undefined etag when header missing', () => {
    expect(interpretResponse(200, null)).toEqual({ changed: true, etag: undefined })
  })

  it('returns changed=false on error status', () => {
    expect(interpretResponse(500, null)).toEqual({ changed: false, etag: undefined })
  })
})

describe('extractCacheHeader', () => {
  it('extracts ETag when present', () => {
    const headers = new Headers({ ETag: '"abc"' })
    expect(extractCacheHeader(headers)).toBe('"abc"')
  })

  it('falls back to Last-Modified when ETag absent', () => {
    const headers = new Headers({ 'Last-Modified': 'Wed, 21 Oct 2025 07:28:00 GMT' })
    expect(extractCacheHeader(headers)).toBe('Wed, 21 Oct 2025 07:28:00 GMT')
  })

  it('returns null when neither header present', () => {
    const headers = new Headers()
    expect(extractCacheHeader(headers)).toBeNull()
  })
})

describe('planAfterFetch', () => {
  const source = mockSource

  it('returns skip action on 304 (unchanged)', () => {
    const result = planAfterFetch(
      { changed: false },
      'stored-etag',
      source
    )
    expect(result.action).toBe('skip')
    if (result.action === 'skip') {
      expect(result.result.changed).toBe(false)
      expect(result.result.etag).toBe('stored-etag')
    }
  })

  it('returns parse action on 200 (changed)', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const result = planAfterFetch(
      { changed: true, bytes, etag: 'new-etag' },
      'old-etag',
      source
    )
    expect(result.action).toBe('parse')
    if (result.action === 'parse') {
      expect(result.bytes).toBe(bytes)
      expect(result.etag).toBe('new-etag')
    }
  })
})

// ---- Imperative shell tests ----

describe('fetcher (imperative shell)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.restoreAllMocks()
  })

  it('returns changed=false on 304', async () => {
    vi.stubGlobal('DecompressionStream', MockDecompressionStream)

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 304 })
    )
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchSongData(mockSource, 'some-etag')
    expect(result.changed).toBe(false)
    expect(result.bytes).toBeUndefined()

    expect(mockFetch).toHaveBeenCalledWith(mockSource.url, {
      headers: { 'If-None-Match': 'some-etag' },
    })
  })

  it('returns decompressed bytes and ETag on 200', async () => {
    vi.stubGlobal('DecompressionStream', MockDecompressionStream)

    const testData = new Uint8Array([1, 2, 3, 4, 5])
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(200, testData, 'etag-abc123')
    )
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchSongData(mockSource)
    expect(result.changed).toBe(true)
    expect(result.etag).toBe('etag-abc123')
    expect(result.bytes).toEqual(testData)
  })

  it('does not send If-None-Match when no stored ETag', async () => {
    vi.stubGlobal('DecompressionStream', MockDecompressionStream)

    const testData = new Uint8Array([1])
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(200, testData, 'etag-1')
    )
    vi.stubGlobal('fetch', mockFetch)

    await fetchSongData(mockSource)
    expect(mockFetch).toHaveBeenCalledWith(mockSource.url, {
      headers: {},
    })
  })

  it('throws on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 500 })
    )
    vi.stubGlobal('fetch', mockFetch)

    await expect(fetchSongData(mockSource)).rejects.toThrow('HTTP 500')
  })
})

describe('cache (ETag storage)', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('stores and retrieves ETags per source', () => {
    expect(getStoredEtag('Direct')).toBeUndefined()

    setStoredEtag('Direct', 'etag-direct')
    expect(getStoredEtag('Direct')).toBe('etag-direct')

    setStoredEtag('JSDelivr', 'etag-jsdelivr')
    expect(getStoredEtag('JSDelivr')).toBe('etag-jsdelivr')
    expect(getStoredEtag('Direct')).toBe('etag-direct')
  })

  it('clears all stored ETags', () => {
    setStoredEtag('Direct', 'etag-direct')
    setStoredEtag('JSDelivr', 'etag-jsdelivr')

    clearStoredEtags()
    expect(getStoredEtag('Direct')).toBeUndefined()
    expect(getStoredEtag('JSDelivr')).toBeUndefined()
  })
})
