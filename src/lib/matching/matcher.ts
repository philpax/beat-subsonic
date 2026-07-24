/**
 * Matching engine — matches Subsonic tracks against BeatSaver maps.
 *
 * Pure functions only (no I/O). All decision logic is testable in Node.
 *
 * Strategy:
 * - Build a trigram index from BeatSaver map variants for O(1) candidate lookup
 * - For each track, extract trigrams and find candidate maps that share trigrams
 * - Check exact/contains match first, then fuzzy match on candidates only
 * - A match is found if ANY normalized variant of the track's key contains
 *   (or is contained by) ANY normalized variant of the map's key, OR if the
 *   fuzzy match score ≥ threshold.
 *
 * Memory tradeoff: the trigram index uses more memory (Map<trigram, Set<mapIdx>>)
 * but eliminates the O(N²) full scan. For 340k maps with ~2 variants each,
 * the index has ~2-4M entries — manageable in a worker.
 */

import { normalizeVariants, stripAlbumParentheses, stripSuperfluousWords } from './normalize'
import { fuzzyMatch } from './fuzzy'

// ---- Types ----

/** A BeatSaver map with its pre-computed normalized variants. */
export interface MapKey {
  index: number
  variants: string[]
}

/** A Subsonic track with its pre-computed normalized variants. */
export interface TrackKey {
  index: number
  variants: string[]
}

/** Pre-built index for fast map lookups. */
export interface MatchIndex {
  /** Maps each normalized variant string → array of map indices (exact match). */
  variantIndex: Map<string, number[]>
  /** Maps each trigram (3-char substring) → set of map indices that contain it. */
  trigramIndex: Map<string, Set<number>>
}

/** Result of matching a single track to maps. */
export interface MatchResult {
  trackIndex: number
  mapIndices: number[]
}

// ---- Key building (pure) ----

/**
 * Build normalized variants for a BeatSaver map.
 *
 * Applies stripAlbumParentheses + stripSuperfluousWords first, then
 * normalizes the combined "levelAuthor songAuthor songName" string.
 *
 * Returns up to 2 variants (stripped + spaced).
 */
export function buildMapKey(song: {
  levelAuthor: string
  songAuthor: string
  songName: string
}): string[] {
  const name = stripSuperfluousWords(stripAlbumParentheses(song.songName))
  const author = stripSuperfluousWords(stripAlbumParentheses(song.songAuthor))
  const levelAuthor = stripSuperfluousWords(stripAlbumParentheses(song.levelAuthor))
  const combined = `${levelAuthor} ${author} ${name}`.trim()
  return normalizeVariants(combined)
}

/**
 * Build normalized variants for a Subsonic track.
 *
 * Applies stripAlbumParentheses + stripSuperfluousWords first, then
 * normalizes the combined "artist title" string.
 *
 * Returns up to 2 variants (stripped + spaced).
 */
export function buildTrackKey(track: {
  artist: string
  title: string
}): string[] {
  const title = stripSuperfluousWords(stripAlbumParentheses(track.title))
  const artist = stripSuperfluousWords(stripAlbumParentheses(track.artist))
  const combined = `${artist} ${title}`.trim()
  return normalizeVariants(combined)
}

// ---- Trigram extraction (pure) ----

/** Minimum variant length to extract trigrams from. */
const MIN_TRIGRAM_LENGTH = 3

/**
 * Extract all trigrams (3-character substrings) from a string.
 * For strings shorter than 3 chars, returns the string itself.
 */
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
 * Build a match index from an array of map keys.
 *
 * Creates:
 * - A variant index: Map<normalizedVariant, number[]> for O(1) exact lookup
 * - A trigram index: Map<trigram, Set<number>> for candidate retrieval
 *
 * The trigram index maps each 3-char substring to the set of map indices
 * whose variants contain that trigram. This lets us find candidate maps
 * for a track in O(trigrams_per_track) instead of scanning all maps.
 */
export function buildMatchIndex(maps: MapKey[]): MatchIndex {
  const variantIndex = new Map<string, number[]>()
  const trigramIndex = new Map<string, Set<number>>()

  for (const map of maps) {
    for (const variant of map.variants) {
      // Add to variant index (exact match)
      const existing = variantIndex.get(variant)
      if (existing) {
        if (!existing.includes(map.index)) existing.push(map.index)
      } else {
        variantIndex.set(variant, [map.index])
      }

      // Add to trigram index (candidate retrieval)
      const trigrams = extractTrigrams(variant)
      for (const trigram of trigrams) {
        let set = trigramIndex.get(trigram)
        if (!set) {
          set = new Set<number>()
          trigramIndex.set(trigram, set)
        }
        set.add(map.index)
      }
    }
  }

  return { variantIndex, trigramIndex }
}

/**
 * Find candidate map indices for a track variant using the trigram index.
 * Returns maps that share at least one trigram with the track variant.
 * This is O(trigrams_per_track) for lookup, not O(total_maps).
 */
function findCandidates(
  trackVariant: string,
  index: MatchIndex
): Set<number> {
  const candidates = new Set<number>()
  const trigrams = extractTrigrams(trackVariant)
  for (const trigram of trigrams) {
    const maps = index.trigramIndex.get(trigram)
    if (maps) {
      for (const mapIdx of maps) {
        candidates.add(mapIdx)
      }
    }
  }
  return candidates
}

// ---- Matching (pure) ----

/**
 * Match a single track's variants against the match index.
 *
 * Checks:
 * 1. Exact variant match (O(1) lookup in variantIndex)
 * 2. Contains check + fuzzy match on trigram candidates only
 *
 * Returns indices of all matching maps.
 */
export function matchTrackToMaps(
  trackVariants: string[],
  index: MatchIndex,
  maps: MapKey[],
  threshold: number
): number[] {
  const matched = new Set<number>()

  for (const trackVariant of trackVariants) {
    // 1. Exact match
    const exact = index.variantIndex.get(trackVariant)
    if (exact) {
      for (const idx of exact) matched.add(idx)
    }

    // 2. Find candidates via trigram index, then check contains + fuzzy
    const candidates = findCandidates(trackVariant, index)
    for (const mapIdx of candidates) {
      if (matched.has(mapIdx)) continue

      const mapVars = maps[mapIdx]?.variants
      if (!mapVars) continue

      for (const mapVariant of mapVars) {
        // Contains check (either direction)
        if (
          trackVariant.includes(mapVariant) ||
          mapVariant.includes(trackVariant)
        ) {
          matched.add(mapIdx)
          break
        }

        // Fuzzy match
        if (fuzzyMatch(trackVariant, mapVariant) >= threshold) {
          matched.add(mapIdx)
          break
        }
      }
    }
  }

  return Array.from(matched).sort((a, b) => a - b)
}

/**
 * Match all tracks against all maps.
 *
 * Builds the trigram index, then batch-matches all tracks.
 * Returns only tracks with ≥1 match.
 *
 * This is the main entry point for the matching engine.
 *
 * @param onProgress Optional callback called every `progressInterval` tracks
 *                   with (current, total). Use this to report progress from a
 *                   worker without blocking the main thread.
 */
export function matchAllTracks(
  tracks: TrackKey[],
  maps: MapKey[],
  threshold: number,
  onProgress?: (current: number, total: number) => void,
  progressInterval: number = 500
): MatchResult[] {
  const index = buildMatchIndex(maps)

  // Build a reverse lookup: map index → map variants (for fuzzy matching)
  const mapVariantsByIndex = new Map<number, string[]>()
  for (const map of maps) {
    mapVariantsByIndex.set(map.index, map.variants)
  }

  const results: MatchResult[] = []

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]

    if (onProgress && i % progressInterval === 0) {
      onProgress(i, tracks.length)
    }

    const matched = new Set<number>()

    for (const trackVariant of track.variants) {
      // 1. Exact match
      const exact = index.variantIndex.get(trackVariant)
      if (exact) {
        for (const idx of exact) matched.add(idx)
      }

      // 2. Find candidates via trigram index, then check contains + fuzzy
      const candidates = findCandidates(trackVariant, index)
      for (const mapIdx of candidates) {
        if (matched.has(mapIdx)) continue

        const mapVars = mapVariantsByIndex.get(mapIdx)
        if (!mapVars) continue

        let isMatch = false

        for (const mapVariant of mapVars) {
          // Contains check (either direction)
          if (
            trackVariant.includes(mapVariant) ||
            mapVariant.includes(trackVariant)
          ) {
            isMatch = true
            break
          }

          // Fuzzy match
          if (fuzzyMatch(trackVariant, mapVariant) >= threshold) {
            isMatch = true
            break
          }
        }

        if (isMatch) matched.add(mapIdx)
      }
    }

    if (matched.size > 0) {
      results.push({
        trackIndex: track.index,
        mapIndices: Array.from(matched).sort((a, b) => a - b),
      })
    }
  }

  return results
}

/**
 * Compute the best match score between a track and a set of maps.
 * Returns the highest fuzzy match score across all variant pairs.
 */
export function computeMatchScore(
  trackVariants: string[],
  mapVariants: string[]
): number {
  let best = 0
  for (const tv of trackVariants) {
    for (const mv of mapVariants) {
      const score = fuzzyMatch(tv, mv)
      if (score > best) best = score
    }
  }
  return best
}
