/**
 * Fetcher orchestrator — imperative shell for fetching all Subsonic data.
 */

import type { SubsonicClient } from './client'
import type { Child } from './types'

export interface SubsonicFetchResult {
  tracks: Child[]
  fetchedAt: number
}

/**
 * Fetch all tracks from a SubsonicClient and return structured result.
 * The fetchedAt timestamp is set when the fetch completes.
 */
export async function fetchAllSubsonicData(
  client: SubsonicClient,
  onProgress?: (fetched: number, total: number) => void
): Promise<SubsonicFetchResult> {
  const tracks = await client.fetchAllTracks(onProgress)
  return {
    tracks,
    fetchedAt: Date.now(),
  }
}
