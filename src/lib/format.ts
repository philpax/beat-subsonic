/**
 * Shared date/duration formatting helpers.
 */

/** Format seconds as m:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Format a Unix timestamp (seconds) as ISO 8601 date string (date only). */
export function formatIsoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

/** Format a Unix timestamp (seconds) as full ISO 8601 datetime string. */
export function formatIsoDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString()
}

/** Format a millisecond timestamp as full ISO 8601 datetime string. */
export function formatIsoDateTimeMs(unixMs: number): string {
  return new Date(unixMs).toISOString()
}
