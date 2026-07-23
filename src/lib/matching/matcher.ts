/**
 * Matching engine — matches Subsonic tracks against BeatSaver maps.
 *
 * Pure functions only (no I/O). All decision logic is testable in Node.
 *
 * Strategy:
 * - Build a match index from BeatSaver map keys (normalized variants)
 * - For each Subsonic track, check exact/contains match first (O(1) lookup),
 *   then fall back to fuzzy matching on maps sharing the same first word.
 * - A match is found if ANY normalized variant of the track's key contains
 *   (or is contained by) ANY normalized variant of the map's key, OR if the
 *   fuzzy match score ≥ threshold.
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
  /** Maps each normalized variant string → array of map indices. */
  variantIndex: Map<string, number[]>
  /** Maps first word of each variant → array of map indices (for fuzzy fallback). */
  firstWordBuckets: Map<string, number[]>
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

// ---- Index building (pure) ----

/**
 * Build a match index from an array of map keys.
 *
 * Creates:
 * - A variant index: Map<normalizedVariant, number[]> for O(1) exact lookup
 * - First-word buckets: Map<firstWord, number[]> for fuzzy fallback
 */
export function buildMatchIndex(maps: MapKey[]): MatchIndex {
  const variantIndex = new Map<string, number[]>()
  const firstWordBuckets = new Map<string, number[]>()

  for (const map of maps) {
    for (const variant of map.variants) {
      // Add to variant index
      const existing = variantIndex.get(variant)
      if (existing) {
        if (!existing.includes(map.index)) existing.push(map.index)
      } else {
        variantIndex.set(variant, [map.index])
      }

      // Add to first-word bucket
      const firstWord = variant.split(/\s+/)[0]
      if (firstWord) {
        const bucket = firstWordBuckets.get(firstWord)
        if (bucket) {
          if (!bucket.includes(map.index)) bucket.push(map.index)
        } else {
          firstWordBuckets.set(firstWord, [map.index])
        }
      }
    }
  }

  return { variantIndex, firstWordBuckets }
}

// ---- Matching (pure) ----

/**
 * Match a single track's variants against the match index.
 *
 * Checks:
 * 1. Exact variant match (O(1) lookup in variantIndex)
 * 2. Contains check (either direction, across all variant pairs)
 * 3. Fuzzy match ≥ threshold (only on maps sharing the same first word)
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

    // 2. Contains check + fuzzy match on maps sharing the same first word
    const firstWord = trackVariant.split(/\s+/)[0]
    if (firstWord) {
      const bucket = index.firstWordBuckets.get(firstWord)
      if (bucket) {
        for (const mapIdx of bucket) {
          if (matched.has(mapIdx)) continue
          const mapVars = maps[mapIdx]?.variants
          if (!mapVars) continue

          for (const mapVariant of mapVars) {
            if (
              trackVariant.includes(mapVariant) ||
              mapVariant.includes(trackVariant)
            ) {
              matched.add(mapIdx)
              break
            }
            if (fuzzyMatch(trackVariant, mapVariant) >= threshold) {
              matched.add(mapIdx)
              break
            }
          }
        }
      }
    }

    // 3. Scan full variant index for contains matches (handles first-word mismatch)
    for (const [mapVariant, mapIndices] of index.variantIndex) {
      if (mapIndices.every((idx) => matched.has(idx))) continue
      if (
        trackVariant.includes(mapVariant) ||
        mapVariant.includes(trackVariant)
      ) {
        for (const idx of mapIndices) matched.add(idx)
      }
    }
  }

  return Array.from(matched).sort((a, b) => a - b)
}

/**
 * Match all tracks against all maps.
 *
 * Builds the match index, then batch-matches all tracks.
 * Returns only tracks with ≥1 match.
 *
 * This is the main entry point for the matching engine.
 */
export function matchAllTracks(
  tracks: TrackKey[],
  maps: MapKey[],
  threshold: number
): MatchResult[] {
  const index = buildMatchIndex(maps)

  // Build a reverse lookup: map index → map variants (for fuzzy matching)
  const mapVariantsByIndex = new Map<number, string[]>()
  for (const map of maps) {
    mapVariantsByIndex.set(map.index, map.variants)
  }

  const results: MatchResult[] = []

  for (const track of tracks) {
    const matched = new Set<number>()

    for (const trackVariant of track.variants) {
      // 1. Exact match
      const exact = index.variantIndex.get(trackVariant)
      if (exact) {
        for (const idx of exact) matched.add(idx)
      }

      // 2. Contains check + fuzzy match on maps sharing the same first word
      const firstWord = trackVariant.split(/\s+/)[0]
      if (firstWord) {
        const bucket = index.firstWordBuckets.get(firstWord)
        if (bucket) {
          for (const mapIdx of bucket) {
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
      }

      // 3. Also check maps where the track variant is a substring of the map variant
      //    or vice versa — scan the full variant index for contains matches
      //    This handles cases where the first words don't match but one contains the other
      for (const [mapVariant, mapIndices] of index.variantIndex) {
        if (matched.size > 0 && mapIndices.every((idx) => matched.has(idx))) continue
        if (
          trackVariant.includes(mapVariant) ||
          mapVariant.includes(trackVariant)
        ) {
          for (const idx of mapIndices) matched.add(idx)
        }
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
