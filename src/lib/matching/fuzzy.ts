/**
 * Fuzzy string matching — ported from blackbird-spotcheck/src/main.rs.
 *
 * Implements Jaro-Winkler similarity, word-based Jaccard similarity,
 * and token-set similarity (inspired by RapidFuzz's token_set_ratio).
 *
 * All functions are pure (no I/O) and testable in Node without a browser.
 */

/**
 * Jaro similarity between two strings.
 * Ported from blackbird-spotcheck/src/main.rs `jaro_similarity`.
 *
 * Returns a value in [0, 1] where 1 = identical.
 */
/** Shared scratch for jaroSimilarity — avoids two allocations per call. */
let jaroScratchA = new Uint8Array(64)
let jaroScratchB = new Uint8Array(64)

export function jaroSimilarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0.0
  if (a === b) return 1.0

  const aLen = a.length
  const bLen = b.length

  // Maximum match distance
  const matchDistance = Math.floor(Math.max(aLen, bLen) / 2) - 1
  const effectiveDistance = Math.max(0, matchDistance)

  if (jaroScratchA.length < aLen) jaroScratchA = new Uint8Array(aLen * 2)
  if (jaroScratchB.length < bLen) jaroScratchB = new Uint8Array(bLen * 2)
  const aMatches = jaroScratchA.fill(0, 0, aLen)
  const bMatches = jaroScratchB.fill(0, 0, bLen)

  let matches = 0

  // Find matching characters within the allowed distance
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - effectiveDistance)
    const end = Math.min(i + effectiveDistance + 1, bLen)

    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue
      if (a[i] !== b[j]) continue
      aMatches[i] = 1
      bMatches[j] = 1
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  // Count transpositions
  let transpositions = 0
  let k = 0
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }

  const m = matches
  return (m / aLen + m / bLen + (m - transpositions / 2) / m) / 3
}

/**
 * Winkler boost for Jaro similarity.
 * Ported from blackbird-spotcheck/src/main.rs `winkler_similarity`.
 *
 * Gives extra weight to strings that share a common prefix (up to 4 chars).
 */
export function winklerSimilarity(a: string, b: string, jaro: number): number {
  const prefixLength = Math.min(4, a.length, b.length)
  let prefix = 0
  for (let i = 0; i < prefixLength; i++) {
    if (a[i] === b[i]) prefix++
    else break
  }

  const winklerBoost = 0.1 * prefix * (1 - jaro)
  return jaro + winklerBoost
}

/**
 * Word-based Jaccard similarity.
 * Ported from blackbird-spotcheck/src/main.rs `word_based_similarity`.
 *
 * Tokenizes both strings on whitespace and computes the Jaccard index
 * of the word sets: |intersection| / |union|.
 */
export function wordBasedSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 0))
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 0))

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0

  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0.0
}

/**
 * Token-set similarity — inspired by RapidFuzz's token_set_ratio.
 *
 * Tokenizes both strings on whitespace, computes the intersection and
 * difference of the token sets, then scores as:
 *   |intersection| / (|intersection| + |diff_a|/2 + |diff_b|/2)
 *
 * This handles word reordering, extra words, and partial matches better
 * than Jaro-Winkler on full strings.
 */
export function tokenSetSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter((w) => w.length > 0))
  const tokensB = new Set(b.split(/\s+/).filter((w) => w.length > 0))

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0

  let intersection = 0
  const diffA: string[] = []
  const diffB: string[] = []

  for (const w of tokensA) {
    if (tokensB.has(w)) intersection++
    else diffA.push(w)
  }
  for (const w of tokensB) {
    if (!tokensA.has(w)) diffB.push(w)
  }

  const denom = intersection + diffA.length / 2 + diffB.length / 2
  return denom > 0 ? intersection / denom : 0.0
}

/** Minimum length for a contains check to be meaningful. */
const MIN_CONTAINS_LENGTH = 3

/**
 * Check if one string contains the other (either direction).
 * Returns 0.8 if true, 0 otherwise.
 * Ignores contains when the shorter string is too short (< 3 chars).
 */
function containsCheck(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0.0
  if (a === b) return 1.0
  // Only count contains if the shorter string is long enough to be meaningful
  const shorter = a.length < b.length ? a : b
  if (shorter.length < MIN_CONTAINS_LENGTH) return 0.0
  if (a.includes(b) || b.includes(a)) return 0.8
  return 0.0
}

/**
 * Full fuzzy match score — max of all similarity metrics.
 * Ported from blackbird-spotcheck/src/main.rs `fuzzy_match`.
 *
 * Returns the highest score among:
 * - Exact match (1.0)
 * - Contains check (0.8)
 * - Jaro-Winkler similarity
 * - Word-based Jaccard similarity
 * - Token-set similarity
 */
export function fuzzyMatch(a: string, b: string): number {
  if (a === b) return 1.0

  const contains = containsCheck(a, b)
  const jaro = jaroSimilarity(a, b)
  const winkler = winklerSimilarity(a, b, jaro)
  const word = wordBasedSimilarity(a, b)
  const tokenSet = tokenSetSimilarity(a, b)

  return Math.max(contains, winkler, word, tokenSet)
}

// ---- Threshold-aware fast path ----

/**
 * Precomputed per-string facts for the threshold-aware fast path.
 * Cached per normalized variant string; variants come from a bounded
 * dataset, so an unbounded cache is fine.
 */
export interface StringMeta {
  /** Token set, or null for single-token strings (token === the string). */
  tokens: Set<string> | null
  /** Number of tokens. */
  tokenCount: number
  /** First 4 chars packed big-endian into one int (0-padded), for prefix comparison. */
  prefix4: number
  /**
   * Character counts over the 37-symbol normalized alphabet (space, a-z,
   * 0-9). Bounds Jaro matches: m <= sum(min(countsA, countsB)).
   */
  charCounts: Uint8Array
}

const metaCache = new Map<string, StringMeta>()

function packPrefix4(s: string): number {
  let packed = 0
  for (let i = 0; i < 4; i++) {
    packed = (packed << 8) | (i < s.length ? s.charCodeAt(i) & 0xff : 0)
  }
  return packed
}

const CHAR_CLASSES = 37

function countChars(s: string): Uint8Array {
  const counts = new Uint8Array(CHAR_CLASSES)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    // a-z → 1-26, 0-9 → 27-36, anything else (space) → 0
    const slot = c >= 97 && c <= 122 ? c - 96 : c >= 48 && c <= 57 ? c - 21 : 0
    if (counts[slot] < 255) counts[slot]++
  }
  return counts
}

/** Get (and cache) the precomputed metadata for a string. */
export function stringMeta(s: string): StringMeta {
  let meta = metaCache.get(s)
  if (meta === undefined) {
    const single = s.indexOf(' ') < 0
    const tokens = single ? null : new Set(s.split(/\s+/).filter((w) => w.length > 0))
    meta = {
      tokens,
      tokenCount: tokens ? tokens.size : s.length > 0 ? 1 : 0,
      prefix4: packPrefix4(s),
      charCounts: countChars(s),
    }
    metaCache.set(s, meta)
  }
  return meta
}

/** Common-prefix length (capped at 4) from two packed prefixes. */
function prefixLength4(pa: number, pb: number, maxLen: number): number {
  const cap = maxLen < 4 ? maxLen : 4
  let prefix = 0
  let shift = 24
  while (prefix < cap && ((pa >>> shift) & 0xff) === ((pb >>> shift) & 0xff)) {
    prefix++
    shift -= 8
  }
  return prefix
}

/**
 * Decide whether fuzzyMatch(a, b) >= threshold without always computing
 * every metric. Produces the same verdict as `fuzzyMatch(a, b) >= threshold`.
 *
 * Optimizations over calling fuzzyMatch directly:
 * - Token sets are cached per string (fuzzyMatch re-splits on every call).
 * - Word-based Jaccard is skipped entirely: Jaccard i/(A+B-i) is always
 *   <= token-set Dice 2i/(A+B), so it can never decide the max.
 * - Jaro-Winkler (the most expensive metric) runs last, and only when a
 *   length/prefix upper bound shows it could still reach the threshold:
 *   jaro <= (min/a + min/b + 1)/3, winkler <= jaro + 0.1*prefix*(1-jaro).
 */
export function fuzzyMatchAtLeast(a: string, b: string, threshold: number): boolean {
  if (a === b) return true
  if (a.length === 0 || b.length === 0) return threshold <= 0
  if (containsCheck(a, b) >= threshold) return true
  return fuzzyBeyondContains(a, stringMeta(a), b, stringMeta(b), threshold)
}

/**
 * Decide whether Dice token-set or Jaro-Winkler similarity reaches the
 * threshold, given precomputed metadata. The caller is responsible for
 * exact-equality and contains checks (matcher call sites already do them).
 *
 * - Word-based Jaccard is skipped entirely: Jaccard i/(A+B-i) is always
 *   <= token-set Dice 2i/(A+B), so it can never decide the max.
 * - When either side is a single token, Dice is capped at 2/(1+n) <= 2/3
 *   (equal single tokens mean equal strings, handled by the caller), so
 *   for thresholds above 2/3 the token phase is skipped without touching
 *   the token sets.
 * - Jaro-Winkler (the most expensive metric) runs last, and only when a
 *   length/prefix upper bound shows it could still reach the threshold:
 *   jaro <= (min/a + min/b + 1)/3, winkler <= jaro + 0.1*prefix*(1-jaro).
 *   The prefix comes from packed prefix ints — no string reads at all on
 *   the rejection path.
 */
export function fuzzyBeyondContains(
  a: string,
  am: StringMeta,
  b: string,
  bm: StringMeta,
  threshold: number,
): boolean {
  // Token-set (Dice) similarity
  if (am.tokenCount > 0 && bm.tokenCount > 0) {
    const diceUpper = (2 * Math.min(am.tokenCount, bm.tokenCount)) / (am.tokenCount + bm.tokenCount)
    if (diceUpper >= threshold && am.tokens && bm.tokens) {
      let intersection = 0
      const [small, large] =
        am.tokens.size <= bm.tokens.size ? [am.tokens, bm.tokens] : [bm.tokens, am.tokens]
      for (const w of small) {
        if (large.has(w)) intersection++
      }
      if ((2 * intersection) / (am.tokenCount + bm.tokenCount) >= threshold) return true
    } else if (diceUpper >= threshold && (!am.tokens || !bm.tokens)) {
      // One side single-token: Dice can only reach 2/(1+n), n >= 2 impossible
      // for threshold > 2/3; for lower thresholds check membership directly.
      const single = am.tokens ? b : a
      const multi = am.tokens ? am.tokens : bm.tokens
      if (multi && multi.has(single) && 2 / (am.tokenCount + bm.tokenCount) >= threshold)
        return true
    }
  }

  // Jaro-Winkler upper bounds, cheapest first:
  // 1. length-only bound (free) — rejects very different lengths
  // 2. character multiset intersection bound — m cannot exceed the shared
  //    character count, which is far tighter than min-length for unrelated
  //    strings of similar length (the common rejection case)
  const minLen = Math.min(a.length, b.length)
  const prefix = prefixLength4(am.prefix4, bm.prefix4, minLen)
  const lenUpper = (minLen / a.length + minLen / b.length + 1) / 3
  if (lenUpper + 0.1 * prefix * (1 - lenUpper) < threshold) return false

  const ca = am.charCounts
  const cb = bm.charCounts
  let mMax = 0
  for (let c = 0; c < ca.length; c++) {
    mMax += ca[c] < cb[c] ? ca[c] : cb[c]
  }
  if (mMax === 0) return false
  const m = mMax < minLen ? mMax : minLen
  const jaroUpper = (m / a.length + m / b.length + 1) / 3
  if (jaroUpper + 0.1 * prefix * (1 - jaroUpper) < threshold) return false

  const jaro = jaroSimilarity(a, b)
  return winklerSimilarity(a, b, jaro) >= threshold
}

/**
 * Offset of the remainder after the common leading WHOLE tokens of two
 * spaced strings ("more than friends" / "more than life" → 10, the start
 * of "friends"/"life"). Returns 0 when no complete leading token is shared.
 * Both remainders start at the same offset because the prefix is identical.
 */
function commonLeadingTokenOffset(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  if (i === 0) return 0
  // Give back any partially shared token: cut at the last space boundary
  const lastSpace = a.lastIndexOf(' ', i - 1)
  return lastSpace < 0 ? 0 : lastSpace + 1
}

/**
 * Like fuzzyBeyondContains, but Jaro-Winkler is made token-aware: when both
 * strings are multi-token and share leading whole tokens, the shared prefix
 * is peeled off and the REMAINDERS must clear the threshold.
 *
 * Rationale: Jaro-Winkler over full titles is dominated by a shared first
 * word — "the deal"/"the pain", "game over"/"game start", and every
 * "more than X"/"more than Y" scored ≥0.85 despite being different songs.
 * Peeling keeps genuine typo tolerance ("harder better faster stroger" →
 * remainder "stroger" vs "stronger" still matches) while rejecting pairs
 * whose only similarity is the shared opening word(s).
 *
 * A remainder that is empty on either side means one string is a
 * token-aligned prefix of the other — that is containment, which the
 * caller's contains stage decides, so the fuzzy stage rejects it here.
 */
export function fuzzyTokenAware(
  a: string,
  am: StringMeta,
  b: string,
  bm: StringMeta,
  threshold: number,
): boolean {
  // Token-set (Dice) similarity on the full strings — order-insensitive,
  // so leading-token peeling does not apply
  if (am.tokenCount > 0 && bm.tokenCount > 0 && am.tokens && bm.tokens) {
    const diceUpper = (2 * Math.min(am.tokenCount, bm.tokenCount)) / (am.tokenCount + bm.tokenCount)
    if (diceUpper >= threshold) {
      let intersection = 0
      const [small, large] =
        am.tokens.size <= bm.tokens.size ? [am.tokens, bm.tokens] : [bm.tokens, am.tokens]
      for (const w of small) {
        if (large.has(w)) intersection++
      }
      if ((2 * intersection) / (am.tokenCount + bm.tokenCount) >= threshold) return true
    }
  }

  // Jaro-Winkler stage, with leading-token peeling when both are multi-token
  if (am.tokens && bm.tokens) {
    const offset = commonLeadingTokenOffset(a, b)
    if (offset > 0) {
      const ra = a.slice(offset)
      const rb = b.slice(offset)
      if (ra.length === 0 || rb.length === 0) return false
      const jaro = jaroSimilarity(ra, rb)
      return winklerSimilarity(ra, rb, jaro) >= threshold
    }
  }

  return fuzzyBeyondContains(a, am, b, bm, threshold)
}
