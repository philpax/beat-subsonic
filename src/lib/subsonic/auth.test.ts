import { describe, it, expect } from 'vitest'
import {
  generateSalt,
  computeToken,
  buildAuthParams,
  buildSubsonicUrl,
  API_VERSION,
  CLIENT_ID,
} from './auth'

describe('generateSalt', () => {
  it('generates a 16-character salt', () => {
    const salt = generateSalt()
    expect(salt).toHaveLength(16)
  })

  it('generates alphanumeric salts', () => {
    for (let i = 0; i < 10; i++) {
      const salt = generateSalt()
      expect(salt).toMatch(/^[a-zA-Z0-9]+$/)
    }
  })

  it('generates different salts each call', () => {
    const salts = new Set<string>()
    for (let i = 0; i < 20; i++) {
      salts.add(generateSalt())
    }
    // With 16 chars from 62-char alphabet, collisions are astronomically unlikely
    expect(salts.size).toBe(20)
  })
})

describe('computeToken', () => {
  it('computes MD5(password + salt) as hex', () => {
    // Known MD5: md5("password" + "salt") = md5("passwordsalt")
    // md5("passwordsalt") = b305cadbb3bce54f3aa59c64fec00dea
    const token = computeToken('password', 'salt')
    expect(token).toBe('b305cadbb3bce54f3aa59c64fec00dea')
  })

  it('returns a 32-character hex string', () => {
    const token = computeToken('test', 'abc123')
    expect(token).toHaveLength(32)
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic for same inputs', () => {
    const t1 = computeToken('user', 'salt123')
    const t2 = computeToken('user', 'salt123')
    expect(t1).toBe(t2)
  })

  it('produces different tokens for different passwords', () => {
    const t1 = computeToken('password1', 'salt')
    const t2 = computeToken('password2', 'salt')
    expect(t1).not.toBe(t2)
  })

  it('produces different tokens for different salts', () => {
    const t1 = computeToken('password', 'salt1')
    const t2 = computeToken('password', 'salt2')
    expect(t1).not.toBe(t2)
  })
})

describe('buildAuthParams', () => {
  it('returns all required auth params', () => {
    const params = buildAuthParams('user', 'pass')
    expect(params.u).toBe('user')
    expect(params.t).toHaveLength(32)
    expect(params.s).toHaveLength(16)
    expect(params.v).toBe(API_VERSION)
    expect(params.c).toBe(CLIENT_ID)
    expect(params.f).toBe('json')
  })

  it('generates a new salt each call', () => {
    const p1 = buildAuthParams('user', 'pass')
    const p2 = buildAuthParams('user', 'pass')
    expect(p1.s).not.toBe(p2.s)
    expect(p1.t).not.toBe(p2.t)
  })

  it('computes token from the generated salt', () => {
    const params = buildAuthParams('user', 'pass')
    const expectedToken = computeToken('pass', params.s)
    expect(params.t).toBe(expectedToken)
  })

  it('uses API version 1.16.1', () => {
    const params = buildAuthParams('user', 'pass')
    expect(params.v).toBe('1.16.1')
  })

  it('uses BeatSubsonic as client ID', () => {
    const params = buildAuthParams('user', 'pass')
    expect(params.c).toBe('BeatSubsonic')
  })
})

describe('buildSubsonicUrl', () => {
  it('builds a URL with auth params', () => {
    const auth = buildAuthParams('user', 'pass')
    const url = buildSubsonicUrl('https://example.com', '/rest/ping', auth)
    const parsed = new URL(url)

    expect(parsed.origin).toBe('https://example.com')
    expect(parsed.pathname).toBe('/rest/ping')
    expect(parsed.searchParams.get('u')).toBe('user')
    expect(parsed.searchParams.get('t')).toBe(auth.t)
    expect(parsed.searchParams.get('s')).toBe(auth.s)
    expect(parsed.searchParams.get('v')).toBe('1.16.1')
    expect(parsed.searchParams.get('c')).toBe('BeatSubsonic')
    expect(parsed.searchParams.get('f')).toBe('json')
  })

  it('appends extra params', () => {
    const auth = buildAuthParams('user', 'pass')
    const url = buildSubsonicUrl('https://example.com', '/rest/search3', auth, {
      query: '',
      songCount: 10000,
    })
    const parsed = new URL(url)

    expect(parsed.searchParams.get('query')).toBe('')
    expect(parsed.searchParams.get('songCount')).toBe('10000')
  })

  it('skips undefined extra params', () => {
    const auth = buildAuthParams('user', 'pass')
    const url = buildSubsonicUrl('https://example.com', '/rest/ping', auth, {
      size: undefined,
    })
    const parsed = new URL(url)

    expect(parsed.searchParams.has('size')).toBe(false)
  })
})
