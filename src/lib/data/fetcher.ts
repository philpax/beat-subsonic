/**
 * Fetcher for the songDetails2_v3.gz dump with ETag-based change detection
 * and native gzip decompression.
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

/**
 * Fetch the song data from a source, using ETag for change detection.
 *
 * - If the server returns 304 (not modified), returns { changed: false }.
 * - If the server returns 200, decompresses the gzip body and returns the bytes + ETag.
 *
 * Uses the native DecompressionStream API for gzip decompression.
 */
export async function fetchSongData(
  source: DataSource,
  storedEtag?: string,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<FetchResult> {
  const headers: Record<string, string> = {}
  if (storedEtag) {
    headers['If-None-Match'] = storedEtag
  }

  const response = await fetch(source.url, { headers })

  if (response.status === 304) {
    return { changed: false }
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${source.id}: HTTP ${response.status}`)
  }

  // Read ETag — may not be exposed via CORS; fall back to Last-Modified
  const etag = response.headers.get('ETag') ?? response.headers.get('Last-Modified') ?? ''
  if (!etag) {
    // No cache header available — proceed without ETag
  }

  // Decompress gzip body using native DecompressionStream
  const decompressed = await decompressGzip(response.body, onProgress)

  return {
    changed: true,
    bytes: decompressed,
    etag: etag || undefined,
  }
}

/**
 * Decompress a gzip ReadableStream into a Uint8Array.
 * Uses the native DecompressionStream API.
 */
async function decompressGzip(
  body: ReadableStream<Uint8Array> | null,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<Uint8Array> {
  if (!body) {
    throw new Error('Response body is null')
  }

  const decompressionStream = new DecompressionStream('gzip')
  const decompressed = body.pipeThrough(decompressionStream as any)

  // Collect chunks
  const reader = decompressed.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  let loaded = 0

  // Try to get total from content-length header for progress reporting
  // (this is the compressed size, not decompressed, but still useful)

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
