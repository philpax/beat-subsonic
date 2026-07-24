/**
 * Matching engine — matches Subsonic tracks against BeatSaver maps.
 *
 * Pure functions only (no I/O). All decision logic is testable in Node.
 *
 * Strategy:
 * - Normalise artist and title separately, not as a concatenated blob
 * - A track matches a map if:
 *   1. The track title is a substring of the map song name (or vice versa), AND
 *      the track artist is a substring of the map song author (or vice versa)
 *   2. OR the title similarity ≥ threshold AND the artist similarity ≥ threshold
 * - This prevents false positives where a long concatenated blob happens to
 *   share enough characters with an unrelated map to score above threshold
 *
 * Memory tradeoff: trigram index on title variants for candidate retrieval.
 */

import { normalizeVariants, stripAlbumParentheses, stripSuperfluousWords } from './normalize'
import { fuzzyMatch } from './fuzzy'

// ---- Types ----

/** A BeatSaver map with pre-computed normalized artist + title variants. */
export interface MapKey {
  index: number
  /** Normalised variants of the song author (artist). */
  artistVariants: string[]
  /** Normalised variants of the song name (title). */
  titleVariants: string[]
  /** Legacy field — combined variants for backward compat. Kept empty. */
  variants: string[]
}

/** A Subsonic track with pre-computed normalized artist + title variants. */
export interface TrackKey {
  index: number
  artistVariants: string[]
  titleVariants: string[]
  /** Legacy field — combined variants for backward compat. Kept empty. */
  variants: string[]
}

/** Pre-built index for fast map lookups. */
export interface MatchIndex {
  /** Maps each title trigram → set of map indices. */
  titleTrigramIndex: Map<string, Set<number>>
  /** Maps each exact title variant → array of map indices. */
  titleVariantIndex: Map<string, number[]>
}

/** Result of matching a single track to maps. */
export interface MatchResult {
  trackIndex: number
  mapIndices: number[]
}

// ---- Key building (pure) ----

/** Minimum length for a variant to be usable for matching. */
const MIN_VARIANT_LENGTH = 3

/** Normalise a single field (artist or title) into variants. */
function normalizeField(s: string): string[] {
  const cleaned = stripSuperfluousWords(stripAlbumParentheses(s))
  return normalizeVariants(cleaned).filter((v) => v.length >= MIN_VARIANT_LENGTH)
}

/**
 * Build normalized artist + title variants for a BeatSaver map.
 * Artist and title are normalised separately to enable component-wise matching.
 */
export function buildMapKey(song: {
  levelAuthor: string
  songAuthor: string
  songName: string
}): Omit<MapKey, 'index'> {
  return {
    artistVariants: normalizeField(song.songAuthor),
    titleVariants: normalizeField(song.songName),
    variants: [],
  }
}

/**
 * Build normalized artist + title variants for a Subsonic track.
 */
export function buildTrackKey(track: {
  artist: string
  title: string
}): Omit<TrackKey, 'index'> {
  return {
    artistVariants: normalizeField(track.artist),
    titleVariants: normalizeField(track.title),
    variants: [],
  }
}

// ---- Trigram extraction (pure) ----

const MIN_TRIGRAM_LENGTH = 3

/** Extract all trigrams (3-character substrings) from a string. */
export function extractTrigrams(s: string): string[] {
  if (s.length < MIN_TRIGRAM_LENGTH) return [s]
  const trigrams: string[] = []
  for (let i = 0; i <= s.length - 3; i++) {
    trigrams.push(s.slice(i, i + 3))
  }
  return trigrams
}

// ---- Index building (pure) ----

/**
 * Build a match index from map keys.
 * Indexes title variants for candidate retrieval via trigrams.
 */
export function buildMatchIndex(maps: MapKey[]): MatchIndex {
  const titleTrigramIndex = new Map<string, Set<number>>()
  const titleVariantIndex = new Map<string, number[]>()

  for (const map of maps) {
    for (const titleVariant of map.titleVariants) {
      // Exact title variant index
      const existing = titleVariantIndex.get(titleVariant)
      if (existing) {
        if (!existing.includes(map.index)) existing.push(map.index)
      } else {
        titleVariantIndex.set(titleVariant, [map.index])
      }

      // Trigram index
      const trigrams = extractTrigrams(titleVariant)
      for (const trigram of trigrams) {
        let set = titleTrigramIndex.get(trigram)
        if (!set) {
          set = new Set<number>()
          titleTrigramIndex.set(trigram, set)
        }
        set.add(map.index)
      }
    }
  }

  return { titleTrigramIndex, titleVariantIndex }
}

/** Maximum candidates to consider per track variant (performance guard). */
const MAX_CANDIDATES = 2000

/**
 * Find candidate map indices for a track title variant using the trigram index.
 * Only returns maps that share a meaningful number of trigrams with the track
 * variant. The threshold scales with variant length — longer variants require
 * more shared trigrams, which eliminates false candidates from common trigrams.
 */
function findCandidates(
  titleVariant: string,
  index: MatchIndex
): Set<number> {
  const trigrams = extractTrigrams(titleVariant)
  const uniqueTrigrams = new Set(trigrams)
  // Require at least 25% of the variant's trigrams to match, minimum 2
  const minShared = Math.max(2, Math.ceil(uniqueTrigrams.size * 0.25))

  const candidateCounts = new Map<number, number>()
  for (const trigram of uniqueTrigrams) {
    const maps = index.titleTrigramIndex.get(trigram)
    if (maps) {
      for (const mapIdx of maps) {
        candidateCounts.set(mapIdx, (candidateCounts.get(mapIdx) ?? 0) + 1)
      }
    }
  }

  const result = new Set<number>()
  for (const [mapIdx, count] of candidateCounts) {
    if (count >= minShared) {
      result.add(mapIdx)
      if (result.size >= MAX_CANDIDATES) break
    }
  }
  return result
}

// ---- Matching (pure) ----

/**
 * Check if any artist variant of the track matches any artist variant of the map.
 * Match = contains (either direction) OR fuzzyMatch ≥ threshold.
 */
function artistMatches(
  trackArtistVariants: string[],
  mapArtistVariants: string[],
  threshold: number
): boolean {
  for (const ta of trackArtistVariants) {
    for (const ma of mapArtistVariants) {
      if (ta === ma) return true
      if (ta.includes(ma) || ma.includes(ta)) return true
      if (fuzzyMatch(ta, ma) >= threshold) return true
    }
  }
  return false
}

/**
 * Check if any title variant of the track matches any title variant of the map.
 * Match = contains (either direction) OR fuzzyMatch ≥ threshold.
 */
function titleMatches(
  trackTitleVariants: string[],
  mapTitleVariants: string[],
  threshold: number
): boolean {
  for (const tt of trackTitleVariants) {
    for (const mt of mapTitleVariants) {
      if (tt === mt) return true
      if (tt.includes(mt) || mt.includes(tt)) return true
      if (fuzzyMatch(tt, mt) >= threshold) return true
    }
  }
  return false
}

/**
 * Match a single track against the match index.
 * A match requires BOTH title AND artist to match.
 */
export function matchTrackToMaps(
  track: TrackKey,
  index: MatchIndex,
  maps: MapKey[],
  threshold: number
): number[] {
  const matched = new Set<number>()

  for (const titleVariant of track.titleVariants) {
    // 1. Exact title match
    const exact = index.titleVariantIndex.get(titleVariant)
    if (exact) {
      for (const mapIdx of exact) {
        if (matched.has(mapIdx)) continue
        // Verify artist also matches
        if (artistMatches(track.artistVariants, maps[mapIdx].artistVariants, threshold)) {
          matched.add(mapIdx)
        }
      }
    }

    // 2. Find candidates via trigram index, then check title + artist
    const candidates = findCandidates(titleVariant, index)
    for (const mapIdx of candidates) {
      if (matched.has(mapIdx)) continue

      const map = maps[mapIdx]
      if (!map) continue

      // Both title AND artist must match
      if (
        titleMatches(track.titleVariants, map.titleVariants, threshold) &&
        artistMatches(track.artistVariants, map.artistVariants, threshold)
      ) {
        matched.add(mapIdx)
      }
    }
  }

  return Array.from(matched).sort((a, b) => a - b)
}

/**
 * Match all tracks against all maps.
 *
 * A track matches a map if BOTH the title AND the artist match (via
 * contains or fuzzy match ≥ threshold). This prevents false positives
 * where a concatenated blob happens to share enough characters with
 * an unrelated map.
 *
 * @param onProgress Optional callback called every `progressInterval` tracks.
 */
export function matchAllTracks(
  tracks: TrackKey[],
  maps: MapKey[],
  threshold: number,
  onProgress?: (current: number, total: number) => void,
  progressInterval: number = 500
): MatchResult[] {
  const index = buildMatchIndex(maps)

  const results: MatchResult[] = []

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]

    if (onProgress && i % progressInterval === 0) {
      onProgress(i, tracks.length)
    }

    const mapIndices = matchTrackToMaps(track, index, maps, threshold)

    if (mapIndices.length > 0) {
      results.push({
        trackIndex: track.index,
        mapIndices,
      })
    }
  }

  return results
}

/**
 * Compute the best match score between a track and a map.
 * Returns the average of the best title score and best artist score,
 * so both components must be good for a high overall score.
 */
export function computeMatchScore(
  track: TrackKey,
  map: MapKey
): number {
  let bestTitle = 0
  for (const tt of track.titleVariants) {
    for (const mt of map.titleVariants) {
      const score = fuzzyMatch(tt, mt)
      if (score > bestTitle) bestTitle = score
    }
  }

  let bestArtist = 0
  for (const ta of track.artistVariants) {
    for (const ma of map.artistVariants) {
      const score = fuzzyMatch(ta, ma)
      if (score > bestArtist) bestArtist = score
    }
  }

  // Both must be decent — return the minimum so a high score requires
  // both title and artist to match well
  return Math.min(bestTitle, bestArtist)
}
