/**
 * TypeScript interfaces for OpenSubsonic API responses.
 *
 * Based on the OpenSubsonic API spec and blackbird-subsonic/src/song.rs.
 * Only id/title/isDir are non-optional on Child (matching blackbird).
 */

/** The top-level Subsonic response wrapper. */
export interface SubsonicResponse<T = unknown> {
  'subsonic-response': {
    status: 'ok' | 'failed'
    version: string
    type?: string
    serverVersion?: string
    openSubsonic?: boolean
    error?: SubsonicError
    /** The search3 endpoint returns results under 'searchResult3'. */
    searchResult3?: T
  }
}

/** Error object in a failed Subsonic response. */
export interface SubsonicError {
  code: number
  message: string
}

/**
 * Child — a song, directory, or video entry in Subsonic responses.
 * Matches blackbird-subsonic/src/song.rs where only id/title/isDir are required.
 */
export interface Child {
  /** Required: unique ID of the song */
  id: string
  /** Required: title of the song */
  title: string
  /** Required: whether this entry is a directory */
  isDir: boolean
  /** Optional fields */
  album?: string
  artist?: string
  albumId?: string
  artistId?: string
  duration?: number
  track?: number
  year?: number
  genre?: string
  suffix?: string
  bitRate?: number
  path?: string
  discNumber?: number
  coverArt?: string
  size?: number
  contentType?: string
  transcodedContentType?: string
  transcodedSuffix?: string
  type?: string
  created?: string
  starred?: string | boolean
  parent?: string
  playCount?: number
}

/** Artist in ID3 format. */
export interface ArtistID3 {
  id: string
  name: string
  albumCount: number
  coverArt?: string
  artistImageUrl?: string
  starred?: string | boolean
  musicBrainzId?: string
  sortName?: string
  roles?: string[]
}

/** Album in ID3 format. */
export interface AlbumID3 {
  id: string
  name: string
  artist?: string
  artistId?: string
  coverArt?: string
  songCount: number
  duration: number
  playCount?: number
  created?: string
  starred?: string | boolean
  year?: number
  genre?: string
}

/** Request parameters for the search3 endpoint. */
export interface Search3Request {
  /** Search query (required, can be empty string to fetch all) */
  query: string
  artistCount?: number
  artistOffset?: number
  albumCount?: number
  albumOffset?: number
  songCount?: number
  songOffset?: number
  musicFolderId?: string
}

/** Response from the search3 endpoint. */
export interface Search3Response {
  artist: ArtistID3[]
  album: AlbumID3[]
  song: Child[]
}

/** Parse a raw JSON response into a Search3Response, defaulting empty arrays. */
export function parseSearch3Response(raw: unknown): Search3Response {
  const wrapper = raw as SubsonicResponse<Search3Response>
  const result = wrapper['subsonic-response']?.searchResult3
  return {
    artist: result?.artist ?? [],
    album: result?.album ?? [],
    song: result?.song ?? [],
  }
}

/** Check if a Subsonic response indicates success. */
export function isSubsonicResponseOk(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object') return false
  const wrapper = raw as SubsonicResponse
  return wrapper['subsonic-response']?.status === 'ok'
}

/** Extract error message from a failed Subsonic response. */
export function getSubsonicError(raw: unknown): string | null {
  if (raw == null || typeof raw !== 'object') return null
  const wrapper = raw as SubsonicResponse
  const err = wrapper['subsonic-response']?.error
  return err ? `${err.message} (code ${err.code})` : null
}
