/**
 * Fetcher for the songDetails2_v3.gz dump with ETag-based change detection
 * and native gzip decompression.
 *
 * FCI split:
 * - buildFetchHeaders / interpretResponse = pure functions (testable)
 * - fetchSongData / decompressGzip = imperative shell (I/O)
 */

import type { DataSource } from './sources'

export interface FetchResult {
  /** True if the data changed (200), false if unchanged (304) */
  changed: boolean
  /** Decompressed bytes (only present when changed === true) */
  bytes?: Uint8Array
  /** ETag from the response (only present when changed === true) */
  etag?: string
}

// ---- Pure functions (Functional Core) ----

/** Build the fetch headers for a given stored ETag. */
export function buildFetchHeaders(storedEtag?: string): Record<string, string> {
  if (!storedEtag) return {}
  return { 'If-None-Match': storedEtag }
}

/** Interpret an HTTP response status + headers into a decision. */
export function interpretResponse(
  status: number,
  etagHeader: string | null,
): { changed: boolean; etag?: string } {
  if (status === 304) {
    return { changed: false }
  }
  if (status < 200 || status >= 300) {
    return { changed: false, etag: undefined }
  }
  // 2xx — data changed
  return { changed: true, etag: etagHeader || undefined }
}

/** Extract the cache-relevant header from a Response. */
export function extractCacheHeader(headers: Headers): string | null {
  return headers.get('ETag') ?? headers.get('Last-Modified')
}

// ---- Imperative Shell ----

/**
 * Fetch the song data from a source, using ETag for change detection.
 *
 * - If the server returns 304 (not modified), returns { changed: false }.
 * - If the server returns 200, decompresses the gzip body and returns the bytes + ETag.
 */
export async function fetchSongData(
  source: DataSource,
  storedEtag?: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<FetchResult> {
  const headers = buildFetchHeaders(storedEtag)
  const response = await fetch(source.url, { headers })

  const etagHeader = extractCacheHeader(response.headers)
  const interpretation = interpretResponse(response.status, etagHeader)

  if (!interpretation.changed) {
    if (response.status === 304) {
      return { changed: false }
    }
    throw new Error(`Failed to fetch from ${source.id}: HTTP ${response.status}`)
  }

  // Decompress gzip body using native DecompressionStream
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream not supported in this browser')
  }
  const decompressed = await decompressGzip(response.body, onProgress)

  return {
    changed: true,
    bytes: decompressed,
    etag: interpretation.etag,
  }
}

/**
 * Decompress a gzip ReadableStream into a Uint8Array.
 * Uses the native DecompressionStream API.
 */
export async function decompressGzip(
  body: ReadableStream<Uint8Array> | null,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Uint8Array> {
  if (!body) {
    throw new Error('Response body is null')
  }

  const decompressionStream = new DecompressionStream('gzip')
  const decompressed = body.pipeThrough(decompressionStream as any)

  const reader = decompressed.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      const chunk = value as Uint8Array
      chunks.push(chunk)
      totalLength += chunk.length
      loaded += chunk.length
      if (onProgress) {
        onProgress(loaded, null)
      }
    }
  }

  // Concatenate chunks into a single Uint8Array
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result
}
