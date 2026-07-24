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
 * Performance model (~120k maps, ~18k tracks, <1s single-core):
 * - Artist variants are interned to integer ids; each id maps to its list of
 *   map indices, and a trigram index maps trigrams to variant ids.
 * - Everything derived from a track's artist — candidate maps, and the
 *   verdict of "does map-artist-variant X match this track's artist" — is
 *   cached per unique artist. A library has far fewer unique artists than
 *   tracks, and a candidate set has far fewer unique artist variants than
 *   maps, so fuzzy artist comparisons collapse from per-(track, map) pairs
 *   to per-(unique artist, unique variant) pairs.
 * - Messy conflated credits ("Camellia feat. nanahira", "gmtn (mapped by
 *   Roffle)", "Artist - Title" in songName) are split at preprocessing time
 *   (see splitArtistSegments), converting fuzzy-path traffic into O(1)
 *   exact index hits.
 */

import {
  extractRemixTags,
  normalizeVariants,
  splitArtistSegments,
  stripAlbumParentheses,
  stripSuperfluousWords,
} from './normalize'
import { fuzzyMatch, fuzzyBeyondContains, stringMeta, type StringMeta } from './fuzzy'

// ---- Types ----

/** A BeatSaver map with pre-computed normalized artist + title variants. */
export interface MapKey {
  index: number
  /** Normalised variants of the song author (artist). */
  artistVariants: string[]
  /** Normalised variants of the song name (title). */
  titleVariants: string[]
  /** Remixer-identity tokens from the title's version clauses (see extractRemixTags). */
  remixTags: string[]
  /** Legacy field — combined variants for backward compat. Kept empty. */
  variants: string[]
}

/** A Subsonic track with pre-computed normalized artist + title variants. */
export interface TrackKey {
  index: number
  artistVariants: string[]
  titleVariants: string[]
  /** Remixer-identity tokens from the title's version clauses (see extractRemixTags). */
  remixTags: string[]
  /** Legacy field — combined variants for backward compat. Kept empty. */
  variants: string[]
}

/** Pre-built index for fast map lookups. */
export interface MatchIndex {
  /** Interned unique artist variant strings, indexed by variant id. */
  artistVariants: string[]
  /** Lazily computed metadata per artist variant id (see StringMeta). */
  artistVariantMeta: (StringMeta | undefined)[]
  /** Artist variant string → variant id. */
  artistVariantIds: Map<string, number>
  /** Variant id → map indices that have this artist variant. */
  artistVariantMaps: number[][]
  /**
   * Artist trigram postings in CSR layout: for trigram code c, the variant
   * ids are trigramPostings[trigramOffsets[c] .. trigramOffsets[c+1]].
   */
  trigramOffsets: Int32Array
  trigramPostings: Int32Array
  /** Map index → its artist variant ids (reverse of artistVariantMaps). */
  mapArtistIds: number[][]
  /** Map index → lazily computed metadata per title variant. */
  mapTitleMetas: (StringMeta[] | undefined)[]
  /** Exact title variant → map indices. */
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
 * Memoized field → variants caches. Author fields repeat heavily (the same
 * artist/mapper string appears on many maps, every track of an album shares
 * its artist), so normalization runs once per unique string. Cached arrays
 * are treated as immutable by all callers.
 */
const titleFieldCache = new Map<string, string[]>()
const artistFieldCache = new Map<string, string[]>()

function titleVariantsOf(s: string): string[] {
  let variants = titleFieldCache.get(s)
  if (variants === undefined) {
    variants = normalizeField(s)
    titleFieldCache.set(s, variants)
  }
  return variants
}

function artistVariantsOf(s: string): string[] {
  let variants = artistFieldCache.get(s)
  if (variants === undefined) {
    variants = []
    const seen = new Set<string>()
    for (const segment of splitArtistSegments(s)) {
      for (const v of normalizeField(segment)) {
        if (!seen.has(v)) {
          seen.add(v)
          variants.push(v)
        }
      }
    }
    artistFieldCache.set(s, variants)
  }
  return variants
}

function addVariants(target: string[], seen: Set<string>, variants: string[]): void {
  for (const v of variants) {
    if (!seen.has(v)) {
      seen.add(v)
      target.push(v)
    }
  }
}

/**
 * Build normalized artist + title variants for a BeatSaver map.
 *
 * Artist variants are built from BOTH songAuthor and levelAuthor, because
 * old BeatSaver maps frequently put the artist name in the mapper field
 * (and vice versa), or leave songAuthor empty. By including both, we
 * match regardless of which field the artist name ended up in.
 *
 * Additionally, old maps often wrote "Artist - Title" into songName with
 * an empty songAuthor; when songName contains " - ", the left side also
 * contributes artist variants and the right side title variants.
 */
const remixTagCache = new Map<string, string[]>()

function remixTagsOf(title: string): string[] {
  let tags = remixTagCache.get(title)
  if (tags === undefined) {
    tags = extractRemixTags(title)
    remixTagCache.set(title, tags)
  }
  return tags
}

export function buildMapKey(song: {
  levelAuthor: string
  songAuthor: string
  songName: string
}): Omit<MapKey, 'index'> {
  const artistSeen = new Set<string>()
  const artistVariants: string[] = []
  addVariants(artistVariants, artistSeen, artistVariantsOf(song.songAuthor))
  addVariants(artistVariants, artistSeen, artistVariantsOf(song.levelAuthor))
  const remixTags = remixTagsOf(song.songName)

  const dashIdx = song.songName.indexOf(' - ')
  if (dashIdx <= 0) {
    return { artistVariants, titleVariants: titleVariantsOf(song.songName), remixTags, variants: [] }
  }

  const titleSeen = new Set<string>()
  const titleVariants: string[] = []
  addVariants(titleVariants, titleSeen, titleVariantsOf(song.songName))
  addVariants(artistVariants, artistSeen, artistVariantsOf(song.songName.slice(0, dashIdx)))
  addVariants(titleVariants, titleSeen, titleVariantsOf(song.songName.slice(dashIdx + 3)))

  return { artistVariants, titleVariants, remixTags, variants: [] }
}

/**
 * Build normalized artist + title variants for a Subsonic track.
 */
export function buildTrackKey(track: {
  artist: string
  title: string
}): Omit<TrackKey, 'index'> {
  return {
    // The cached arrays are shared; treat them as immutable
    artistVariants: artistVariantsOf(track.artist),
    titleVariants: titleVariantsOf(track.title),
    remixTags: remixTagsOf(track.title),
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

/**
 * Integer trigram codes: normalized variants only contain [a-z0-9 ], a
 * 37-character alphabet, so a trigram fits in 37^3 = 50,653 codes. Using
 * ints instead of substrings avoids string allocation and Map hashing in
 * both index build and candidate voting.
 */
const TRIGRAM_ALPHABET = 37
export const TRIGRAM_CODE_SPACE = TRIGRAM_ALPHABET * TRIGRAM_ALPHABET * TRIGRAM_ALPHABET

function charCode37(c: number): number {
  if (c >= 97 && c <= 122) return c - 96 // a-z → 1-26
  if (c >= 48 && c <= 57) return c - 21 // 0-9 → 27-36
  return 0 // space (and anything unexpected)
}

/**
 * Append the unique trigram codes of a normalized variant to `out`.
 * Returns the number of unique trigrams. `out` is caller-provided scratch.
 */
function collectUniqueTrigramCodes(s: string, out: number[]): number {
  out.length = 0
  for (let i = 0; i + 3 <= s.length; i++) {
    const code =
      (charCode37(s.charCodeAt(i)) * TRIGRAM_ALPHABET + charCode37(s.charCodeAt(i + 1))) *
        TRIGRAM_ALPHABET +
      charCode37(s.charCodeAt(i + 2))
    // Variants are short (~10-30 trigrams); linear dedupe beats a Set here
    let dup = false
    for (let j = 0; j < out.length; j++) {
      if (out[j] === code) {
        dup = true
        break
      }
    }
    if (!dup) out.push(code)
  }
  return out.length
}

// ---- Index building (pure) ----

/**
 * Build a match index from map keys.
 *
 * Artist variants are interned: each unique variant string gets an integer
 * id, its list of map indices, and trigram-index entries. Titles get an
 * exact-lookup index; title trigrams are not needed because candidate
 * retrieval is always artist-driven.
 */
export function buildMatchIndex(maps: MapKey[]): MatchIndex {
  const artistVariants: string[] = []
  const artistVariantMeta: (StringMeta | undefined)[] = []
  const artistVariantIds = new Map<string, number>()
  const artistVariantMaps: number[][] = []
  const mapArtistIds: number[][] = []
  const mapTitleMetas: (StringMeta[] | undefined)[] = []
  const titleVariantIndex = new Map<string, number[]>()

  for (const map of maps) {
    const artistIds: number[] = []
    for (const variant of map.artistVariants) {
      let id = artistVariantIds.get(variant)
      if (id === undefined) {
        id = artistVariants.length
        artistVariantIds.set(variant, id)
        artistVariants.push(variant)
        artistVariantMaps.push([])
      }
      artistIds.push(id)
      const mapList = artistVariantMaps[id]
      if (mapList[mapList.length - 1] !== map.index) mapList.push(map.index)
    }
    mapArtistIds[map.index] = artistIds

    for (const variant of map.titleVariants) {
      let mapList = titleVariantIndex.get(variant)
      if (!mapList) {
        mapList = []
        titleVariantIndex.set(variant, mapList)
      }
      if (mapList[mapList.length - 1] !== map.index) mapList.push(map.index)
    }
  }
  artistVariantMeta.length = artistVariants.length
  mapTitleMetas.length = maps.length

  // Trigram postings in CSR layout: count pass, prefix sum, fill pass.
  // Avoids ~1.8M small-array pushes that a Map/array-of-arrays build costs.
  const variantCount = artistVariants.length
  const trigramScratch: number[] = []
  const trigramOffsets = new Int32Array(TRIGRAM_CODE_SPACE + 1)
  let totalPostings = 0
  for (let id = 0; id < variantCount; id++) {
    collectUniqueTrigramCodes(artistVariants[id], trigramScratch)
    for (const code of trigramScratch) trigramOffsets[code + 1]++
    totalPostings += trigramScratch.length
  }
  for (let c = 0; c < TRIGRAM_CODE_SPACE; c++) {
    trigramOffsets[c + 1] += trigramOffsets[c]
  }
  const trigramPostings = new Int32Array(totalPostings)
  const cursor = trigramOffsets.slice(0, TRIGRAM_CODE_SPACE)
  for (let id = 0; id < variantCount; id++) {
    // Recomputing codes is cheaper than storing 119k small arrays
    collectUniqueTrigramCodes(artistVariants[id], trigramScratch)
    for (const code of trigramScratch) {
      trigramPostings[cursor[code]++] = id
    }
  }

  return {
    artistVariants,
    artistVariantMeta,
    artistVariantIds,
    artistVariantMaps,
    trigramOffsets,
    trigramPostings,
    mapArtistIds,
    mapTitleMetas,
    titleVariantIndex,
  }
}

// ---- Artist resolution (cached per unique artist) ----

/** Maximum candidates to consider per track (performance guard). */
const MAX_CANDIDATES = 2000

/** Everything derivable from a track's artist alone, computed once per unique artist. */
interface ArtistResolution {
  /**
   * Artist variant ids accepted for this artist (exact hits, or trigram-voted
   * variants that passed the contains/fuzzy check). Any map carrying one of
   * these ids has a matching artist by construction.
   */
  acceptedIds: Set<number>
  /** Union of the accepted variants' map indices (capped at MAX_CANDIDATES). */
  candidateMaps: number[]
  /**
   * Memoized verdicts for map artist variants encountered outside the
   * candidate set (exact-title fast path): variant id → matches artist?
   */
  verdicts: Map<number, boolean>
}

/** Shared state for matching many tracks against one index. */
interface MatcherContext {
  index: MatchIndex
  maps: MapKey[]
  threshold: number
  /** Track artist signature → resolution (candidates + fuzzy verdicts). */
  resolutions: Map<string, ArtistResolution>
  /** Scratch array for trigram vote counting, one slot per artist variant id. */
  voteCounts: Int32Array
  /** Scratch list of variant ids touched during a vote count. */
  touched: number[]
}

function createContext(index: MatchIndex, maps: MapKey[], threshold: number): MatcherContext {
  return {
    index,
    maps,
    threshold,
    resolutions: new Map(),
    voteCounts: new Int32Array(index.artistVariants.length),
    touched: [],
  }
}

/** Lazily compute (and cache) metadata for an artist variant id. */
function variantMeta(index: MatchIndex, id: number): StringMeta {
  let meta = index.artistVariantMeta[id]
  if (meta === undefined) {
    meta = stringMeta(index.artistVariants[id])
    index.artistVariantMeta[id] = meta
  }
  return meta
}

/** Lazily compute (and cache) title metadata for a map. */
function titleMetasFor(index: MatchIndex, mapIdx: number, titleVariants: string[]): StringMeta[] {
  let metas = index.mapTitleMetas[mapIdx]
  if (metas === undefined) {
    metas = titleVariants.map(stringMeta)
    index.mapTitleMetas[mapIdx] = metas
  }
  return metas
}

/** Does one map artist variant match any of the track's artist variants? */
function artistPairMatches(
  trackArtistVariants: string[],
  trackArtistMetas: StringMeta[],
  ma: string,
  mam: StringMeta,
  threshold: number
): boolean {
  for (let i = 0; i < trackArtistVariants.length; i++) {
    const ta = trackArtistVariants[i]
    if (ta === ma || ta.includes(ma) || ma.includes(ta)) return true
    if (fuzzyBeyondContains(ta, trackArtistMetas[i], ma, mam, threshold)) return true
  }
  return false
}

/**
 * Resolve everything artist-derived for a track, cached per unique artist:
 * 1. Exact artist variant lookup (primary) — O(1) per variant
 * 2. Artist trigram vote (fallback) — variant ids sharing ≥25% of the track
 *    artist's trigrams are contains/fuzzy-checked ONCE at the variant level;
 *    the accepted variants' maps become the candidate set. This collapses
 *    the fuzzy artist work from per-(track, map) to per-(artist, variant).
 */
function resolveArtist(ctx: MatcherContext, track: TrackKey): ArtistResolution {
  const signature = track.artistVariants.join('|')  // '|' cannot appear in normalized variants
  let resolution = ctx.resolutions.get(signature)
  if (resolution) return resolution

  const { index, threshold, voteCounts, touched } = ctx
  const acceptedIds = new Set<number>()

  // Primary: exact artist variant lookup — candidates are NOT capped on
  // this path (a prolific artist like Camellia legitimately has thousands
  // of maps, and every one is a genuine artist match)
  let exactHit = false
  for (const variant of track.artistVariants) {
    const id = index.artistVariantIds.get(variant)
    if (id !== undefined) {
      acceptedIds.add(id)
      exactHit = true
    }
  }

  // Fallback: trigram vote, then contains/fuzzy check per voted variant
  if (!exactHit) {
    const trackMetas = track.artistVariants.map(stringMeta)
    const votedIds = new Set<number>()
    const trigramScratch: number[] = []
    const { trigramOffsets, trigramPostings } = index
    for (const variant of track.artistVariants) {
      const trigramCount = collectUniqueTrigramCodes(variant, trigramScratch)
      if (trigramCount === 0) continue
      const minShared = Math.max(2, Math.ceil(trigramCount * 0.25))

      for (const code of trigramScratch) {
        const end = trigramOffsets[code + 1]
        for (let p = trigramOffsets[code]; p < end; p++) {
          const id = trigramPostings[p]
          if (voteCounts[id] === 0) touched.push(id)
          voteCounts[id]++
        }
      }
      for (const id of touched) {
        if (voteCounts[id] >= minShared) votedIds.add(id)
        voteCounts[id] = 0
      }
      touched.length = 0
    }

    for (const id of votedIds) {
      if (
        artistPairMatches(
          track.artistVariants,
          trackMetas,
          index.artistVariants[id],
          variantMeta(index, id),
          threshold
        )
      ) {
        acceptedIds.add(id)
      }
    }
  }

  const candidateSet = new Set<number>()
  outer: for (const id of acceptedIds) {
    for (const mapIdx of index.artistVariantMaps[id]) {
      candidateSet.add(mapIdx)
      // Performance guard applies only to fuzzy-derived candidates
      if (!exactHit && candidateSet.size >= MAX_CANDIDATES) break outer
    }
  }

  resolution = {
    acceptedIds,
    candidateMaps: Array.from(candidateSet),
    verdicts: new Map(),
  }
  ctx.resolutions.set(signature, resolution)
  return resolution
}

/**
 * Check if a map's artist matches the resolved track artist.
 * Fast path: any of the map's artist variant ids is already accepted.
 * Slow path (exact-title hits outside the candidate set): full
 * contains/fuzzy check, memoized per unique map artist variant string.
 */
function artistMatches(
  ctx: MatcherContext,
  resolution: ArtistResolution,
  trackArtistVariants: string[],
  trackArtistMetas: StringMeta[],
  mapIdx: number
): boolean {
  const { index } = ctx
  const ids = index.mapArtistIds[mapIdx]
  if (!ids) return false

  for (const id of ids) {
    if (resolution.acceptedIds.has(id)) return true
  }

  for (const id of ids) {
    let verdict = resolution.verdicts.get(id)
    if (verdict === undefined) {
      verdict = artistPairMatches(
        trackArtistVariants,
        trackArtistMetas,
        index.artistVariants[id],
        variantMeta(index, id),
        ctx.threshold
      )
      resolution.verdicts.set(id, verdict)
    }
    if (verdict) return true
  }
  return false
}

/**
 * Check if any title variant of the track matches any title variant of the map.
 * Match = contains (either direction) OR fuzzy ≥ threshold.
 */
function titleMatches(
  trackTitleVariants: string[],
  trackTitleMetas: StringMeta[],
  mapTitleVariants: string[],
  mapTitleMetas: StringMeta[],
  threshold: number
): boolean {
  for (let i = 0; i < trackTitleVariants.length; i++) {
    const tt = trackTitleVariants[i]
    for (let j = 0; j < mapTitleVariants.length; j++) {
      const mt = mapTitleVariants[j]
      if (tt === mt) return true
      if (tt.includes(mt) || mt.includes(tt)) return true
      if (fuzzyBeyondContains(tt, trackTitleMetas[i], mt, mapTitleMetas[j], threshold)) return true
    }
  }
  return false
}

/** Does any variant contain the given tag as a substring? */
function variantsMention(variants: string[], tag: string): boolean {
  for (const v of variants) {
    if (v.includes(tag)) return true
  }
  return false
}

/**
 * Check remix compatibility between a track and a map.
 *
 * A remix is a different musical work from the original, so a title match
 * alone is not enough: "Cinema (Congorock remix)" must not match the
 * original "Cinema" or "Cinema (Skrillex Remix)" maps.
 *
 * - Neither side has remix tags → compatible (original ↔ original).
 * - Both sides tagged → compatible only when they share a tag.
 * - One side tagged → compatible only when the other side mentions the
 *   remixer somewhere in its artist/title (covers maps crediting the
 *   remixer in the author field, e.g. songAuthor "Krayysh Remix", and
 *   cover versions credited like "Camellia feat. Kasane Teto").
 */
function remixCompatible(track: TrackKey, map: MapKey): boolean {
  const trackTags = track.remixTags
  const mapTags = map.remixTags
  if (trackTags.length === 0 && mapTags.length === 0) return true

  for (const t of trackTags) {
    for (const m of mapTags) {
      if (t === m || t.includes(m) || m.includes(t)) return true
    }
  }

  if (mapTags.length === 0) {
    for (const tag of trackTags) {
      if (variantsMention(map.artistVariants, tag) || variantsMention(map.titleVariants, tag)) {
        return true
      }
    }
    return false
  }
  if (trackTags.length === 0) {
    for (const tag of mapTags) {
      if (variantsMention(track.artistVariants, tag) || variantsMention(track.titleVariants, tag)) {
        return true
      }
    }
    return false
  }
  return false
}

// ---- Matching (pure) ----

function matchTrackWithContext(ctx: MatcherContext, track: TrackKey): number[] {
  const { index, maps, threshold } = ctx
  const resolution = resolveArtist(ctx, track)
  const matched = new Set<number>()
  const trackArtistMetas = track.artistVariants.map(stringMeta)
  const trackTitleMetas = track.titleVariants.map(stringMeta)

  // 1. Exact title match (fast path) — may reach maps outside the artist
  //    candidate set (e.g. artist spelled too differently for trigrams)
  for (const titleVariant of track.titleVariants) {
    const exact = index.titleVariantIndex.get(titleVariant)
    if (exact) {
      for (const mapIdx of exact) {
        if (matched.has(mapIdx)) continue
        if (!remixCompatible(track, maps[mapIdx])) continue
        if (artistMatches(ctx, resolution, track.artistVariants, trackArtistMetas, mapIdx)) {
          matched.add(mapIdx)
        }
      }
    }
  }

  // 2. Artist-driven candidates — the artist already matched during
  //    resolution (candidates are maps of accepted variants), so only the
  //    title needs checking
  for (const mapIdx of resolution.candidateMaps) {
    if (matched.has(mapIdx)) continue

    const map = maps[mapIdx]
    if (!map) continue

    if (!remixCompatible(track, map)) continue
    if (
      titleMatches(
        track.titleVariants,
        trackTitleMetas,
        map.titleVariants,
        titleMetasFor(index, mapIdx, map.titleVariants),
        threshold
      )
    ) {
      matched.add(mapIdx)
    }
  }

  return Array.from(matched).sort((a, b) => a - b)
}

/**
 * Match a single track against the match index.
 * A match requires BOTH title AND artist to match.
 *
 * Standalone convenience wrapper — creates a fresh context per call.
 * For bulk matching use matchAllTracks, which shares per-artist caches.
 */
export function matchTrackToMaps(
  track: TrackKey,
  index: MatchIndex,
  maps: MapKey[],
  threshold: number
): number[] {
  return matchTrackWithContext(createContext(index, maps, threshold), track)
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
/** Cache of built indexes per maps array, so re-matching (e.g. after a
 * threshold change) skips the index build. */
const indexCache = new WeakMap<MapKey[], MatchIndex>()

export function matchAllTracks(
  tracks: TrackKey[],
  maps: MapKey[],
  threshold: number,
  onProgress?: (current: number, total: number) => void,
  progressInterval: number = 500
): MatchResult[] {
  let index = indexCache.get(maps)
  if (!index) {
    index = buildMatchIndex(maps)
    indexCache.set(maps, index)
  }
  const ctx = createContext(index, maps, threshold)

  const results: MatchResult[] = []

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]

    if (onProgress && i % progressInterval === 0) {
      onProgress(i, tracks.length)
    }

    const mapIndices = matchTrackWithContext(ctx, track)

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
 * Returns the minimum of the best title score and best artist score,
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
