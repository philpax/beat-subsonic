import { describe, it, expect } from 'vitest'
import { buildOneClickUrl, buildMapPageUrl, buildDownloadUrl, buildCoverUrl } from '@/lib/types'

describe('OneClick URL builder', () => {
  it('builds beatsaver:// URL for hex key', () => {
    expect(buildOneClickUrl('1f')).toBe('beatsaver://1f')
  })

  it('builds beatsaver:// URL for multi-char key', () => {
    expect(buildOneClickUrl('ff')).toBe('beatsaver://ff')
  })

  it('builds beatsaver:// URL for longer key', () => {
    expect(buildOneClickUrl('1a2b3c')).toBe('beatsaver://1a2b3c')
  })
})

describe('External URL builders', () => {
  it('builds BeatSaver map page URL', () => {
    expect(buildMapPageUrl('1f')).toBe('https://beatsaver.com/maps/1f')
  })

  it('builds direct download URL', () => {
    expect(buildDownloadUrl('1f')).toBe('https://beatsaver.com/api/download/key/1f')
  })

  it('builds cover art URL from hash', () => {
    expect(buildCoverUrl('abcdef1234567890')).toBe(
      'https://cdn.beatsaver.com/abcdef1234567890.jpg'
    )
  })
})
