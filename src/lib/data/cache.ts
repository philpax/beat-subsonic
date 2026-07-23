/**
 * ETag caching for per-source data change detection.
 *
 * ETags are stored per-source in localStorage, matching DataGetter.cs which
 * stores per-source ETags. When fetching from a source, we use that source's
 * stored ETag; this avoids sending a Direct ETag to jsDelivr (which would
 * never match) on the fallback path.
 */

import type { DataSourceId } from './sources'

const ETAG_KEY_PREFIX = 'beatsaver-db:etag'

function etagKey(source: DataSourceId): string {
  return `${ETAG_KEY_PREFIX}:${source}`
}

/** Get the stored ETag for a data source, if any. */
export function getStoredEtag(source: DataSourceId): string | undefined {
  try {
    const val = localStorage.getItem(etagKey(source))
    return val ?? undefined
  } catch {
    return undefined
  }
}

/** Store the ETag for a data source. */
export function setStoredEtag(source: DataSourceId, etag: string): void {
  try {
    localStorage.setItem(etagKey(source), etag)
  } catch {
    // localStorage may be unavailable (private browsing, etc.) — non-fatal
  }
}

/** Clear all stored ETags. */
export function clearStoredEtags(): void {
  try {
    localStorage.removeItem(etagKey('Direct'))
    localStorage.removeItem(etagKey('JSDelivr'))
  } catch {
    // non-fatal
  }
}
