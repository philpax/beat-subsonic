/**
 * Subsonic authentication helpers — pure functions.
 *
 * Uses salt+token auth: MD5(password + salt) as hex token.
 * Ported from blackbird-subsonic/src/auth.rs.
 *
 * All functions are pure (no I/O) and testable in Node without a browser.
 * `crypto.getRandomValues` is available in both browser and Node (via globalThis.crypto).
 */

// js-md5 uses `export =` (CommonJS). In ESM mode the callable is at `.default`.
// We import as namespace and access default.hex() for the MD5 hash.
import * as md5Module from 'js-md5'
const md5 = (md5Module as any).default ?? md5Module

/** API version matching blackbird-subsonic's API_VERSION constant. */
export const API_VERSION = '1.16.1'

/** Client identifier sent to the Subsonic server. */
export const CLIENT_ID = 'BeatSubsonic'

/** Character set for salt generation (matching blackbird's CHARSET). */
const SALT_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Salt length (matching blackbird's constant). */
const SALT_LENGTH = 16

/**
 * Generate a random alphanumeric salt.
 * Uses crypto.getRandomValues, available in both browser and Node.
 */
export function generateSalt(): string {
  const crypto = globalThis.crypto
  const bytes = new Uint8Array(SALT_LENGTH)
  crypto.getRandomValues(bytes)
  let result = ''
  for (let i = 0; i < SALT_LENGTH; i++) {
    result += SALT_CHARSET[bytes[i] % SALT_CHARSET.length]
  }
  return result
}

/**
 * Compute the auth token: MD5(password + salt) as hex.
 * Uses js-md5 since WebCrypto doesn't support MD5.
 */
export function computeToken(password: string, salt: string): string {
  return md5.hex(password + salt)
}

/** Auth query parameters returned by buildAuthParams. */
export interface AuthParams {
  /** Username */
  u: string
  /** Token (MD5 of password+salt) */
  t: string
  /** Salt */
  s: string
  /** API version */
  v: string
  /** Client name */
  c: string
  /** Response format */
  f: string
}

/**
 * Build the auth query parameters for a Subsonic request.
 * Pure function — generates a new salt each call.
 */
export function buildAuthParams(username: string, password: string): AuthParams {
  const salt = generateSalt()
  const token = computeToken(password, salt)
  return {
    u: username,
    t: token,
    s: salt,
    v: API_VERSION,
    c: CLIENT_ID,
    f: 'json',
  }
}

/**
 * Build a full Subsonic API URL with auth params appended.
 * Pure function for URL construction.
 */
export function buildSubsonicUrl(
  baseUrl: string,
  endpoint: string,
  auth: AuthParams,
  extraParams?: Record<string, string | number | undefined>,
): string {
  const url = new URL(endpoint, baseUrl)
  url.searchParams.set('u', auth.u)
  url.searchParams.set('t', auth.t)
  url.searchParams.set('s', auth.s)
  url.searchParams.set('v', auth.v)
  url.searchParams.set('c', auth.c)
  url.searchParams.set('f', auth.f)

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url.toString()
}
