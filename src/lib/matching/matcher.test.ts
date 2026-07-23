import { describe, it, expect } from 'vitest'
import {
  buildMapKey,
  buildTrackKey,
  buildMatchIndex,
  matchAllTracks,
  computeMatchScore,
  type MapKey,
  type TrackKey,
} from './matcher'

describe('buildMapKey', () => {
  it('builds normalized variants from map metadata', () => {
    const variants = buildMapKey({
      levelAuthor: 'OmaruPoko',
      songAuthor: 'OmaruPoko',
      songName: 'Crab Rave',
    })
    expect(variants.length).toBeGreaterThan(0)
    expect(variants).toContain('omarupokoomarupokocrabrave')
  })

  it('strips album parentheses before normalizing', () => {
    const variants = buildMapKey({
      levelAuthor: 'Mapper',
      songAuthor: 'Artist',
      songName: 'Song (Remaster)',
    })
    // Should not contain "remaster" in the variants
    expect(variants.every((v) => !v.includes('remaster'))).toBe(true)
  })

  it('strips superfluous words before normalizing', () => {
    const variants = buildMapKey({
      levelAuthor: 'Mapper',
      songAuthor: 'Artist',
      songName: 'Song Deluxe Edition',
    })
    expect(variants.every((v) => !v.includes('deluxe'))).toBe(true)
    expect(variants.every((v) => !v.includes('edition'))).toBe(true)
  })

  it('handles empty strings', () => {
    const variants = buildMapKey({
      levelAuthor: '',
      songAuthor: '',
      songName: '',
    })
    expect(variants).toEqual([])
  })
})

describe('buildTrackKey', () => {
  it('builds normalized variants from track metadata', () => {
    const variants = buildTrackKey({
      artist: 'Camellia',
      title: 'Body F10ating10',
    })
    expect(variants.length).toBeGreaterThan(0)
    expect(variants).toContain('camelliabodyf10ating10')
  })

  it('strips album parentheses before normalizing', () => {
    const variants = buildTrackKey({
      artist: 'Artist',
      title: 'Song (Deluxe Edition)',
    })
    expect(variants.every((v) => !v.includes('deluxe'))).toBe(true)
  })

  it('handles empty strings', () => {
    const variants = buildTrackKey({
      artist: '',
      title: '',
    })
    expect(variants).toEqual([])
  })
})

describe('buildMatchIndex', () => {
  it('builds a variant index from map keys', () => {
    const maps: MapKey[] = [
      { index: 0, variants: ['camellia', 'camellia'] },
      { index: 1, variants: ['omarupoko crabrave'] },
    ]
    const index = buildMatchIndex(maps)

    expect(index.variantIndex.has('camellia')).toBe(true)
    expect(index.variantIndex.get('camellia')).toEqual([0])
    expect(index.variantIndex.has('omarupoko crabrave')).toBe(true)
  })

  it('builds first-word buckets', () => {
    const maps: MapKey[] = [
      { index: 0, variants: ['camellia body'] },
      { index: 1, variants: ['camellia ghost'] },
    ]
    const index = buildMatchIndex(maps)

    expect(index.firstWordBuckets.has('camellia')).toBe(true)
    expect(index.firstWordBuckets.get('camellia')).toEqual([0, 1])
  })

  it('deduplicates map indices in the same bucket', () => {
    const maps: MapKey[] = [
      { index: 0, variants: ['camellia', 'camellia body'] },
    ]
    const index = buildMatchIndex(maps)

    // 'camellia' appears twice in variants but should only have index 0 once
    expect(index.variantIndex.get('camellia')).toEqual([0])
  })
})

describe('matchAllTracks', () => {
  it('matches tracks to maps with exact variant match', () => {
    const tracks: TrackKey[] = [
      { index: 0, variants: ['camellia body'] },
    ]
    const maps: MapKey[] = [
      { index: 0, variants: ['camellia body'] },
    ]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].trackIndex).toBe(0)
    expect(results[0].mapIndices).toContain(0)
  })

  it('matches via contains relationship', () => {
    const tracks: TrackKey[] = [
      { index: 0, variants: ['camellia'] },
    ]
    const maps: MapKey[] = [
      { index: 0, variants: ['camellia body f10ating10'] },
    ]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toContain(0)
  })

  it('matches BeatSaver map to Subsonic track (Camellia)', () => {
    const trackVariants = buildTrackKey({
      artist: 'Camellia',
      title: 'Body F10ating10',
    })
    const mapVariants = buildMapKey({
      levelAuthor: 'Camellia',
      songAuthor: 'Camellia',
      songName: 'Body F10ating10',
    })

    const tracks: TrackKey[] = [{ index: 0, variants: trackVariants }]
    const maps: MapKey[] = [{ index: 0, variants: mapVariants }]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toContain(0)
  })

  it('matches Crab Rave with OmaruPoko', () => {
    const trackVariants = buildTrackKey({
      artist: 'OmaruPoko',
      title: 'Crab Rave',
    })
    const mapVariants = buildMapKey({
      levelAuthor: 'OmaruPoko',
      songAuthor: 'OmaruPoko',
      songName: 'Crab Rave',
    })

    const tracks: TrackKey[] = [{ index: 0, variants: trackVariants }]
    const maps: MapKey[] = [{ index: 0, variants: mapVariants }]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toContain(0)
  })

  it('does not match completely different tracks', () => {
    const tracks: TrackKey[] = [
      { index: 0, variants: ['completely different song'] },
    ]
    const maps: MapKey[] = [
      { index: 0, variants: ['totally unrelated map'] },
    ]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(0)
  })

  it('filters to only tracks with matches', () => {
    const tracks: TrackKey[] = [
      { index: 0, variants: ['camellia body'] },
      { index: 1, variants: ['totally different'] },
    ]
    const maps: MapKey[] = [
      { index: 0, variants: ['camellia body'] },
    ]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].trackIndex).toBe(0)
  })

  it('matches multiple maps to a single track', () => {
    const tracks: TrackKey[] = [
      { index: 0, variants: ['camellia body'] },
    ]
    const maps: MapKey[] = [
      { index: 0, variants: ['camellia body'] },
      { index: 1, variants: ['camellia body'] },
    ]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toEqual([0, 1])
  })

  it('handles empty inputs', () => {
    expect(matchAllTracks([], [], 0.8)).toEqual([])
    expect(matchAllTracks([], [{ index: 0, variants: ['test'] }], 0.8)).toEqual([])
    expect(matchAllTracks([{ index: 0, variants: ['test'] }], [], 0.8)).toEqual([])
  })
})

describe('computeMatchScore', () => {
  it('returns 1.0 for identical variants', () => {
    expect(computeMatchScore(['hello'], ['hello'])).toBe(1.0)
  })

  it('returns high score for similar variants', () => {
    const score = computeMatchScore(['camellia body'], ['camellia body f10ating10'])
    expect(score).toBeGreaterThanOrEqual(0.8)
  })

  it('returns low score for different variants', () => {
    const score = computeMatchScore(['abc'], ['xyz'])
    expect(score).toBeLessThan(0.5)
  })

  it('returns best score across all variant pairs', () => {
    const score = computeMatchScore(['abc', 'hello world'], ['xyz', 'hello world'])
    expect(score).toBe(1.0) // matches on second pair
  })
})
