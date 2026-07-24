import { describe, it, expect } from 'vitest'
import {
  collectExactArtistSignatures,
  buildMapKey,
  buildTrackKey,
  buildMatchIndex,
  matchAllTracks,
  computeMatchScore,
  extractTrigrams,
  type MapKey,
  type TrackKey,
} from './matcher'

function makeMapKey(index: number, artist: string, title: string): MapKey {
  return { index, ...buildMapKey({ levelAuthor: '', songAuthor: artist, songName: title }) }
}

function makeTrackKey(index: number, artist: string, title: string): TrackKey {
  return { index, ...buildTrackKey({ artist, title }) }
}

describe('extractTrigrams', () => {
  it('extracts all 3-char substrings', () => {
    expect(extractTrigrams('hello')).toEqual(['hel', 'ell', 'llo'])
  })

  it('returns the string itself for short strings', () => {
    expect(extractTrigrams('ab')).toEqual(['ab'])
    expect(extractTrigrams('abc')).toEqual(['abc'])
  })

  it('handles empty string', () => {
    expect(extractTrigrams('')).toEqual([''])
  })
})

describe('buildMapKey', () => {
  it('builds separate artist + title variants', () => {
    const key = buildMapKey({
      levelAuthor: 'OmaruPoko',
      songAuthor: 'OmaruPoko',
      songName: 'Crab Rave',
    })
    expect(key.artistVariants.length).toBeGreaterThan(0)
    expect(key.titleVariants.length).toBeGreaterThan(0)
    expect(key.artistVariants).toContain('omarupoko')
    expect(key.titleVariants).toContain('crabrave')
  })

  it('strips album parentheses from title', () => {
    const key = buildMapKey({
      levelAuthor: 'Mapper',
      songAuthor: 'Artist',
      songName: 'Song (Remaster)',
    })
    expect(key.titleVariants.every((v) => !v.includes('remaster'))).toBe(true)
  })

  it('strips superfluous words from title', () => {
    const key = buildMapKey({
      levelAuthor: 'Mapper',
      songAuthor: 'Artist',
      songName: 'Song Deluxe Edition',
    })
    expect(key.titleVariants.every((v) => !v.includes('deluxe'))).toBe(true)
  })

  it('handles empty strings', () => {
    const key = buildMapKey({
      levelAuthor: '',
      songAuthor: '',
      songName: '',
    })
    expect(key.artistVariants).toEqual([])
    expect(key.titleVariants).toEqual([])
  })
})

describe('buildTrackKey', () => {
  it('builds separate artist + title variants', () => {
    const key = buildTrackKey({
      artist: 'Camellia',
      title: 'Body F10ating10',
    })
    expect(key.artistVariants).toContain('camellia')
    expect(key.titleVariants).toContain('bodyf10ating10')
  })

  it('handles empty strings', () => {
    const key = buildTrackKey({
      artist: '',
      title: '',
    })
    expect(key.artistVariants).toEqual([])
    expect(key.titleVariants).toEqual([])
  })
})

describe('buildMatchIndex', () => {
  it('builds title and artist indexes', () => {
    const maps: MapKey[] = [
      makeMapKey(0, 'Camellia', 'Body F10ating10'),
      makeMapKey(1, 'OmaruPoko', 'Crab Rave'),
    ]
    const index = buildMatchIndex(maps)

    expect(index.titleVariantIndex.has('bodyf10ating10')).toBe(true)

    const camelliaId = index.artistVariantIds.get('camellia')
    expect(camelliaId).toBeDefined()
    expect(index.artistVariantMaps[camelliaId!]).toEqual([0])
    expect(index.mapArtistIds[0]).toContain(camelliaId)
  })
})

describe('matchAllTracks', () => {
  it('matches tracks to maps with exact title + artist match', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Camellia', 'Body F10ating10')]
    const maps: MapKey[] = [makeMapKey(0, 'Camellia', 'Body F10ating10')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].trackIndex).toBe(0)
    expect(results[0].mapIndices).toContain(0)
  })

  it('matches via contains relationship in both title and artist', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Camellia', 'Body')]
    const maps: MapKey[] = [makeMapKey(0, 'Camellia', 'Body F10ating10')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toContain(0)
  })

  it('matches BeatSaver map to Subsonic track (Camellia)', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Camellia', 'Body F10ating10')]
    const maps: MapKey[] = [makeMapKey(0, 'Camellia', 'Body F10ating10')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toContain(0)
  })

  it('matches Crab Rave with OmaruPoko', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'OmaruPoko', 'Crab Rave')]
    const maps: MapKey[] = [makeMapKey(0, 'OmaruPoko', 'Crab Rave')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toContain(0)
  })

  it('does not match when title matches but artist does not', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Completely Different Artist', 'Body F10ating10')]
    const maps: MapKey[] = [makeMapKey(0, 'Camellia', 'Body F10ating10')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(0)
  })

  it('does not match completely different tracks', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Unknown Artist', 'Unknown Song')]
    const maps: MapKey[] = [makeMapKey(0, 'Other Artist', 'Other Song')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(0)
  })

  it('does not match All India Radio with Allison (false positive)', () => {
    // This was a false positive in the old algorithm
    const tracks: TrackKey[] = [makeTrackKey(0, 'All India Radio', 'Let Me Remain')]
    const maps: MapKey[] = [makeMapKey(0, 'Allison and drameko', 'Pumpernickel')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(0)
  })

  it('filters to only tracks with matches', () => {
    const tracks: TrackKey[] = [
      makeTrackKey(0, 'Camellia', 'Body F10ating10'),
      makeTrackKey(1, 'Unknown', 'Unknown'),
    ]
    const maps: MapKey[] = [makeMapKey(0, 'Camellia', 'Body F10ating10')]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].trackIndex).toBe(0)
  })

  it('matches multiple maps to a single track', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Camellia', 'Body F10ating10')]
    const maps: MapKey[] = [
      makeMapKey(0, 'Camellia', 'Body F10ating10'),
      makeMapKey(1, 'Camellia', 'Body F10ating10'),
    ]

    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toEqual([0, 1])
  })

  it('handles empty inputs', () => {
    expect(matchAllTracks([], [], 0.8)).toEqual([])
    expect(matchAllTracks([], [makeMapKey(0, 'A', 'B')], 0.8)).toEqual([])
    expect(matchAllTracks([makeTrackKey(0, 'A', 'B')], [], 0.8)).toEqual([])
  })
})

describe('remix compatibility', () => {
  it('does not match a remix track against the original map', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Benny Benassi', 'Cinema (Congorock remix)')]
    const maps: MapKey[] = [makeMapKey(0, 'Benny Benassi', 'Cinema')]
    expect(matchAllTracks(tracks, maps, 0.8)).toHaveLength(0)
  })

  it('does not match a remix track against a different remix map', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Benny Benassi', 'Cinema (Congorock remix)')]
    const maps: MapKey[] = [makeMapKey(0, 'Benny Benassi', 'Cinema (Skrillex Remix)')]
    expect(matchAllTracks(tracks, maps, 0.8)).toHaveLength(0)
  })

  it('matches a remix track against the same remix map', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Benny Benassi', 'Cinema (Skrillex radio edit)')]
    const maps: MapKey[] = [makeMapKey(0, 'Benny Benassi', 'Cinema - Skrillex Remix')]
    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
    expect(results[0].mapIndices).toEqual([0])
  })

  it('does not match the original track against a remix map', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Benny Benassi', 'Cinema')]
    const maps: MapKey[] = [makeMapKey(0, 'Benny Benassi', 'Cinema (Skrillex Remix)')]
    expect(matchAllTracks(tracks, maps, 0.8)).toHaveLength(0)
  })

  it('matches generic version clauses (radio edit) against the original', () => {
    const tracks: TrackKey[] = [makeTrackKey(0, 'Benny Benassi', 'Cinema (radio edit)')]
    const maps: MapKey[] = [makeMapKey(0, 'Benny Benassi', 'Cinema')]
    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
  })

  it('matches a cover track when the map credits the cover artist', () => {
    const tracks: TrackKey[] = [
      makeTrackKey(0, 'Camellia feat. Kasane Teto', 'Play-With-Fire (Teto Cover)'),
    ]
    const maps: MapKey[] = [
      {
        index: 0,
        ...buildMapKey({
          levelAuthor: 'Mapper',
          songAuthor: 'Camellia feat. Kasane Teto',
          songName: 'Play-With-Fire',
        }),
      },
    ]
    const results = matchAllTracks(tracks, maps, 0.8)
    expect(results).toHaveLength(1)
  })
})

describe('sharded matching (exactOnlyArtists)', () => {
  it('collects signatures of artists with exact variant hits', () => {
    const tracks: TrackKey[] = [
      makeTrackKey(0, 'Camellia', 'Ghost'),
      makeTrackKey(1, 'Nobody Known', 'Song'),
    ]
    const maps: MapKey[] = [makeMapKey(0, 'Camellia', 'Ghost')]
    const sigs = collectExactArtistSignatures(tracks, maps)
    expect(sigs).toEqual(['camellia'])
  })

  it('skips the fuzzy fallback for artists with exact hits elsewhere', () => {
    // "Kavinsky" has an exact hit in some OTHER shard; this shard only has
    // a typo'd variant that the fuzzy fallback would accept (typo'd title
    // too, so the exact-title fast path cannot reach it either). With the
    // exact-only hint the fallback must not run, matching the behaviour of
    // the unpartitioned index (whose exact hit short-circuits it).
    const tracks: TrackKey[] = [makeTrackKey(0, 'Kavinsky', 'Nightcall')]
    const shard: MapKey[] = [makeMapKey(0, 'Kavinksy', 'Nightcal')]

    const unhinted = matchAllTracks(tracks, shard, 0.85)
    expect(unhinted).toHaveLength(1) // fuzzy fallback accepts the typo

    const hinted = matchAllTracks(tracks, shard, 0.85, undefined, 500, {
      exactOnlyArtists: new Set(['kavinsky']),
    })
    expect(hinted).toHaveLength(0)
  })
})

describe('computeMatchScore', () => {
  it('returns 1.0 for identical title + artist', () => {
    const track = makeTrackKey(0, 'Camellia', 'Body F10ating10')
    const map = makeMapKey(0, 'Camellia', 'Body F10ating10')
    expect(computeMatchScore(track, map)).toBe(1.0)
  })

  it('returns low score when artist does not match', () => {
    const track = makeTrackKey(0, 'Camellia', 'Body F10ating10')
    const map = makeMapKey(0, 'Allison', 'Body F10ating10')
    // Title matches perfectly but artist doesn't — min(title, artist) should be below threshold
    expect(computeMatchScore(track, map)).toBeLessThan(0.8)
  })

  it('returns low score when title does not match', () => {
    const track = makeTrackKey(0, 'Camellia', 'Body F10ating10')
    const map = makeMapKey(0, 'Camellia', 'Completely Different Song')
    expect(computeMatchScore(track, map)).toBeLessThan(0.8)
  })
})
