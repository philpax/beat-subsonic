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
export function jaroSimilarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0.0
  if (a === b) return 1.0

  const aLen = a.length
  const bLen = b.length

  // Maximum match distance
  const matchDistance = Math.floor(Math.max(aLen, bLen) / 2) - 1
  const effectiveDistance = Math.max(0, matchDistance)

  const aMatches = new Array<boolean>(aLen).fill(false)
  const bMatches = new Array<boolean>(bLen).fill(false)

  let matches = 0

  // Find matching characters within the allowed distance
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - effectiveDistance)
    const end = Math.min(i + effectiveDistance + 1, bLen)

    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue
      if (a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
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
