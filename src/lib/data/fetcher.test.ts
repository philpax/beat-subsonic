import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSongData } from '@/lib/data/fetcher'
import { getStoredEtag, setStoredEtag, clearStoredEtags } from '@/lib/data/cache'
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

// Helper to create a gzip-compressed Uint8Array using a simple approach
// We'll mock the DecompressionStream to just return the input
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

// Mock DecompressionStream with a pass-through TransformStream
class MockDecompressionStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor() {
    super()
  }
}

describe('fetcher', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.restoreAllMocks()
  })

  it('returns changed=false on 304', async () => {
    vi.stubGlobal(
      'DecompressionStream',
      MockDecompressionStream
    )

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 304 })
    )
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchSongData(mockSource, 'some-etag')
    expect(result.changed).toBe(false)
    expect(result.bytes).toBeUndefined()

    // Verify If-None-Match header was sent
    expect(mockFetch).toHaveBeenCalledWith(mockSource.url, {
      headers: { 'If-None-Match': 'some-etag' },
    })
  })

  it('returns decompressed bytes and ETag on 200', async () => {
    vi.stubGlobal(
      'DecompressionStream',
      MockDecompressionStream
    )

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
    vi.stubGlobal(
      'DecompressionStream',
      MockDecompressionStream
    )

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
    // Direct ETag should not be affected
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
