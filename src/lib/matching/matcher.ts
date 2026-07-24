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
  /** Maps each artist variant → set of map indices (primary lookup). */
  artistIndex: Map<string, Set<number>>
  /** Maps each artist trigram → set of artist variants (fuzzy artist lookup). */
  artistTrigramIndex: Map<string, Set<string>>
  /** Maps each exact title variant → array of map indices. */
  titleVariantIndex: Map<string, number[]>
  /** Maps each title trigram → set of map indices (fallback for title search). */
  titleTrigramIndex: Map<string, Set<number>>
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
 *
 * Artist variants are built from BOTH songAuthor and levelAuthor, because
 * old BeatSaver maps frequently put the artist name in the mapper field
 * (and vice versa), or leave songAuthor empty. By including both, we
 * match regardless of which field the artist name ended up in.
 *
 * Title variants are built from songName only.
 */
export function buildMapKey(song: {
  levelAuthor: string
  songAuthor: string
  songName: string
}): Omit<MapKey, 'index'> {
  // Collect artist variants from both fields, deduplicated
  const fromSongAuthor = normalizeField(song.songAuthor)
  const fromLevelAuthor = normalizeField(song.levelAuthor)
  const seen = new Set<string>()
  const artistVariants: string[] = []
  for (const v of [...fromSongAuthor, ...fromLevelAuthor]) {
    if (!seen.has(v)) {
      seen.add(v)
      artistVariants.push(v)
    }
  }

  return {
    artistVariants,
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
 *
 * Primary index: artist variant → map indices. This lets us find all maps
 * by a given artist in O(1), which is the most discriminating filter since
 * artist names are far more unique than title trigrams.
 *
 * Secondary indexes: exact title variant lookup and title trigram index
 * (used as fallback when artist matching fails or for contains checks).
 */
export function buildMatchIndex(maps: MapKey[]): MatchIndex {
  const artistIndex = new Map<string, Set<number>>()
  const artistTrigramIndex = new Map<string, Set<string>>()
  const titleTrigramIndex = new Map<string, Set<number>>()
  const titleVariantIndex = new Map<string, number[]>()

  for (const map of maps) {
    // Artist index — primary lookup + artist trigram index for fuzzy artist search
    for (const artistVariant of map.artistVariants) {
      let set = artistIndex.get(artistVariant)
      if (!set) {
        set = new Set<number>()
        artistIndex.set(artistVariant, set)
      }
      set.add(map.index)

      // Build artist trigram index for fuzzy artist matching
      const trigrams = extractTrigrams(artistVariant)
      for (const trigram of trigrams) {
        let artistSet = artistTrigramIndex.get(trigram)
        if (!artistSet) {
          artistSet = new Set<string>()
          artistTrigramIndex.set(trigram, artistSet)
        }
        artistSet.add(artistVariant)
      }
    }

    for (const titleVariant of map.titleVariants) {
      // Exact title variant index
      const existing = titleVariantIndex.get(titleVariant)
      if (existing) {
        if (!existing.includes(map.index)) existing.push(map.index)
      } else {
        titleVariantIndex.set(titleVariant, [map.index])
      }

      // Trigram index (fallback)
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

  return { artistIndex, artistTrigramIndex, titleTrigramIndex, titleVariantIndex }
}

/** Maximum candidates to consider per track (performance guard). */
const MAX_CANDIDATES = 2000

/**
 * Find candidate map indices using:
 * 1. Exact artist variant lookup (primary) — O(1), returns maps by exact artist
 * 2. Artist trigram search (secondary) — finds artist variants that share trigrams
 *    with the track artist, fuzzy-matches only those (~50 vs ~1000 candidates)
 * 3. Title trigram search (tertiary fallback) — for tracks with no artist match
 */
function findCandidates(
  track: TrackKey,
  index: MatchIndex
): Set<number> {
  const candidates = new Set<number>()

  // Primary: exact artist variant lookup
  for (const artistVariant of track.artistVariants) {
    const maps = index.artistIndex.get(artistVariant)
    if (maps) {
      for (const mapIdx of maps) {
        candidates.add(mapIdx)
      }
    }
  }

  // If exact artist lookup found candidates, we're done — they're already
  // pre-filtered by artist. The artistMatches check in matchTrackToMaps
  // will verify the match is above threshold.
  if (candidates.size > 0) {
    return candidates
  }

  // Secondary: artist trigram search — find artist variants that share
  // trigrams with the track artist, then look up maps for those artists.
  // This handles slight artist name variations (e.g. "BRADIO" vs "Bradio")
  // without scanning all title trigram candidates.
  const candidateArtistVariants = new Set<string>()
  for (const trackArtistVariant of track.artistVariants) {
    const trigrams = extractTrigrams(trackArtistVariant)
    const uniqueTrigrams = new Set(trigrams)
    const minShared = Math.max(2, Math.ceil(uniqueTrigrams.size * 0.25))

    const variantCounts = new Map<string, number>()
    for (const trigram of uniqueTrigrams) {
      const artistVariants = index.artistTrigramIndex.get(trigram)
      if (artistVariants) {
        for (const v of artistVariants) {
          variantCounts.set(v, (variantCounts.get(v) ?? 0) + 1)
        }
      }
    }

    for (const [v, count] of variantCounts) {
      if (count >= minShared) {
        candidateArtistVariants.add(v)
      }
    }
  }

  // Look up maps for candidate artist variants
  for (const v of candidateArtistVariants) {
    const maps = index.artistIndex.get(v)
    if (maps) {
      for (const mapIdx of maps) {
        candidates.add(mapIdx)
        if (candidates.size >= MAX_CANDIDATES) return candidates
      }
    }
  }

  // If no artist match at all (exact or trigram), skip the expensive title
  // trigram fallback — the track artist has no maps on BeatSaver, so running
  // title trigrams would just scan ~1000 candidates for nothing.
  if (candidates.size === 0 && candidateArtistVariants.size === 0) {
    return candidates
  }

  // Tertiary: title trigram search — last resort for tracks with no
  // artist match at all (e.g. soundtrack compilations where the track
  // artist is "Various Artists" or empty)
  if (candidates.size === 0) {
    for (const titleVariant of track.titleVariants) {
      const trigrams = extractTrigrams(titleVariant)
      const uniqueTrigrams = new Set(trigrams)
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

      for (const [mapIdx, count] of candidateCounts) {
        if (count >= minShared) {
          candidates.add(mapIdx)
          if (candidates.size >= MAX_CANDIDATES) return candidates
        }
      }
    }
  }

  return candidates
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
 *
 * Strategy: look up maps by artist (O(1) exact/contains), then check title
 * only within that small candidate set. Falls back to trigram title search
 * only if no artist match is found (handles artist name variations).
 */
export function matchTrackToMaps(
  track: TrackKey,
  index: MatchIndex,
  maps: MapKey[],
  threshold: number
): number[] {
  const matched = new Set<number>()

  // 1. Exact title match (fast path)
  for (const titleVariant of track.titleVariants) {
    const exact = index.titleVariantIndex.get(titleVariant)
    if (exact) {
      for (const mapIdx of exact) {
        if (matched.has(mapIdx)) continue
        if (artistMatches(track.artistVariants, maps[mapIdx].artistVariants, threshold)) {
          matched.add(mapIdx)
        }
      }
    }
  }

  // 2. Find candidates via artist index (primary) or trigram fallback
  const candidates = findCandidates(track, index)
  for (const mapIdx of candidates) {
    if (matched.has(mapIdx)) continue

    const map = maps[mapIdx]
    if (!map) continue

    // Artist check first — cheap and eliminates most false candidates
    if (!artistMatches(track.artistVariants, map.artistVariants, threshold)) continue

    // Title check — expensive fuzzy match, only on artist-matched candidates
    if (titleMatches(track.titleVariants, map.titleVariants, threshold)) {
      matched.add(mapIdx)
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
