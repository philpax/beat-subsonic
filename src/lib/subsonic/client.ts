/**
 * SubsonicClient — imperative shell for Subsonic API I/O.
 *
 * All decision logic (auth, URL building, response parsing) is in pure
 * functions in auth.ts and types.ts. This class only handles fetch() calls.
 */

import { buildAuthParams, buildSubsonicUrl } from './auth'
import {
  type Child,
  type Search3Request,
  type Search3Response,
  parseSearch3Response,
  isSubsonicResponseOk,
  getSubsonicError,
} from './types'

/** Page size for fetching all tracks (matching blackbird's approach). */
const FETCH_PAGE_SIZE = 10000

export class SubsonicClient {
  private baseUrl: string
  private username: string
  private password: string

  constructor(baseUrl: string, username: string, password: string) {
    // Normalize: remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.username = username
    this.password = password
  }

  /** Verify the connection by pinging the server. */
  async ping(): Promise<void> {
    const auth = buildAuthParams(this.username, this.password)
    const url = buildSubsonicUrl(this.baseUrl, '/rest/ping', auth)
    const response = await fetch(url)
    const json = await response.json()
    if (!isSubsonicResponseOk(json)) {
      throw new Error(getSubsonicError(json) ?? 'Ping failed')
    }
  }

  /** Call the search3 endpoint. */
  async search3(request: Search3Request): Promise<Search3Response> {
    const auth = buildAuthParams(this.username, this.password)
    const url = buildSubsonicUrl(this.baseUrl, '/rest/search3', auth, {
      query: request.query,
      artistCount: request.artistCount ?? 0,
      artistOffset: request.artistOffset ?? 0,
      albumCount: request.albumCount ?? 0,
      albumOffset: request.albumOffset ?? 0,
      songCount: request.songCount ?? FETCH_PAGE_SIZE,
      songOffset: request.songOffset ?? 0,
      musicFolderId: request.musicFolderId,
    })
    const response = await fetch(url)
    const json = await response.json()
    if (!isSubsonicResponseOk(json)) {
      throw new Error(getSubsonicError(json) ?? 'search3 failed')
    }
    return parseSearch3Response(json)
  }

  /**
   * Fetch all tracks via search3 pagination.
   * Uses empty query with large songCount, incrementing songOffset.
   * This is the blackbird pattern (avoids unnecessary artist/album data).
   */
  async fetchAllTracks(onProgress?: (fetched: number, total: number) => void): Promise<Child[]> {
    const allTracks: Child[] = []
    let offset = 0

    while (true) {
      const response = await this.search3({
        query: '',
        artistCount: 0,
        albumCount: 0,
        songCount: FETCH_PAGE_SIZE,
        songOffset: offset,
      })

      const songs = response.song
      allTracks.push(...songs)

      if (onProgress) {
        onProgress(allTracks.length, allTracks.length)
      }

      // If we got fewer than the page size, we're done
      if (songs.length < FETCH_PAGE_SIZE) {
        break
      }

      offset += FETCH_PAGE_SIZE
    }

    return allTracks
  }

  /** Fetch cover art as a binary blob. */
  async getCoverArt(id: string, size?: number): Promise<Blob> {
    const auth = buildAuthParams(this.username, this.password)
    const url = buildSubsonicUrl(this.baseUrl, '/rest/getCoverArt', auth, {
      id,
      size,
    })
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`getCoverArt failed: ${response.status} ${response.statusText}`)
    }
    return response.blob()
  }
}
