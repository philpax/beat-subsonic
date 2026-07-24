/**
 * Text normalisation pipeline — ported from blackbird-core/src/library.rs.
 *
 * Pipeline: foldLookalikes → foldDiacritics → normalizeVariants
 *
 * All functions here are pure (no I/O) and testable in Node without a browser.
 */

/** Lookup table for Unicode lookalike characters → ASCII equivalents. */
const LOOKALIKE_MAP: Record<string, string> = {
  // Curly quotes → straight quotes
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201B': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u201F': '"',
  '\u00AB': '"',
  '\u00BB': '"',
  // En/em dashes → hyphen
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2015': '-',
  // Ellipsis → period
  '\u2026': '.',
  // Single guillemets
  '\u2039': "'",
  '\u203A': "'",
  // Bullet
  '\u2022': '*',
  // Non-breaking space and other Unicode spaces → ASCII space
  '\u00A0': ' ',
  '\u1680': ' ',
  '\u2000': ' ',
  '\u2001': ' ',
  '\u2002': ' ',
  '\u2003': ' ',
  '\u2004': ' ',
  '\u2005': ' ',
  '\u2006': ' ',
  '\u2007': ' ',
  '\u2008': ' ',
  '\u2009': ' ',
  '\u200A': ' ',
  '\u202F': ' ',
  '\u205F': ' ',
  '\u3000': ' ',
  // Full-width Latin letters → ASCII
  '\uFF01': '!',
  '\uFF02': '"',
  '\uFF03': '#',
  '\uFF04': '$',
  '\uFF05': '%',
  '\uFF06': '&',
  '\uFF07': "'",
  '\uFF08': '(',
  '\uFF09': ')',
  '\uFF0A': '*',
  '\uFF0B': '+',
  '\uFF0C': ',',
  '\uFF0D': '-',
  '\uFF0E': '.',
  '\uFF0F': '/',
  '\uFF10': '0',
  '\uFF11': '1',
  '\uFF12': '2',
  '\uFF13': '3',
  '\uFF14': '4',
  '\uFF15': '5',
  '\uFF16': '6',
  '\uFF17': '7',
  '\uFF18': '8',
  '\uFF19': '9',
  '\uFF1A': ':',
  '\uFF1B': ';',
  '\uFF1C': '<',
  '\uFF1D': '=',
  '\uFF1E': '>',
  '\uFF1F': '?',
  '\uFF20': '@',
  '\uFF21': 'A',
  '\uFF22': 'B',
  '\uFF23': 'C',
  '\uFF24': 'D',
  '\uFF25': 'E',
  '\uFF26': 'F',
  '\uFF27': 'G',
  '\uFF28': 'H',
  '\uFF29': 'I',
  '\uFF2A': 'J',
  '\uFF2B': 'K',
  '\uFF2C': 'L',
  '\uFF2D': 'M',
  '\uFF2E': 'N',
  '\uFF2F': 'O',
  '\uFF30': 'P',
  '\uFF31': 'Q',
  '\uFF32': 'R',
  '\uFF33': 'S',
  '\uFF34': 'T',
  '\uFF35': 'U',
  '\uFF36': 'V',
  '\uFF37': 'W',
  '\uFF38': 'X',
  '\uFF39': 'Y',
  '\uFF3A': 'Z',
  '\uFF3B': '[',
  '\uFF3C': '\\',
  '\uFF3D': ']',
  '\uFF3E': '^',
  '\uFF3F': '_',
  '\uFF40': '`',
  '\uFF41': 'a',
  '\uFF42': 'b',
  '\uFF43': 'c',
  '\uFF44': 'd',
  '\uFF45': 'e',
  '\uFF46': 'f',
  '\uFF47': 'g',
  '\uFF48': 'h',
  '\uFF49': 'i',
  '\uFF4A': 'j',
  '\uFF4B': 'k',
  '\uFF4C': 'l',
  '\uFF4D': 'm',
  '\uFF4E': 'n',
  '\uFF4F': 'o',
  '\uFF50': 'p',
  '\uFF51': 'q',
  '\uFF52': 'r',
  '\uFF53': 's',
  '\uFF54': 't',
  '\uFF55': 'u',
  '\uFF56': 'v',
  '\uFF57': 'w',
  '\uFF58': 'x',
  '\uFF59': 'y',
  '\uFF5A': 'z',
  '\uFF5B': '{',
  '\uFF5C': '|',
  '\uFF5D': '}',
  '\uFF5E': '~',
}

/** Fast test: does the string contain any non-ASCII character? */
const NON_ASCII = /[\u0080-\uffff]/

/**
 * Fold Unicode lookalike characters to their ASCII equivalents.
 * Ported from blackbird-core/src/library.rs `fold_lookalikes`.
 */
export function foldLookalikes(s: string): string {
  if (!NON_ASCII.test(s)) return s
  let result = ''
  for (const ch of s) {
    result += LOOKALIKE_MAP[ch] ?? ch
  }
  return result
}

/**
 * Fold diacritics by NFKD-normalising and stripping combining marks.
 * Ported from blackbird-core/src/library.rs `fold_diacritics`.
 *
 * Uses String.prototype.normalize('NFKD') then removes characters
 * in the combining diacritical marks range (U+0300–U+036F).
 */
export function foldDiacritics(s: string): string {
  if (!NON_ASCII.test(s)) return s
  return s.normalize('NFKD').replace(/[\u0300-\u036F]/g, '')
}

/**
 * Produce normalised variants of a string for matching.
 * Ported from blackbird-core/src/library.rs `normalize_variants`.
 *
 * Returns up to 2 variants:
 * - "stripped": all punctuation removed, whitespace collapsed, lowercased
 * - "spaced": punctuation → spaces, whitespace collapsed, lowercased
 *
 * If both variants are equal, only one is returned.
 */
export function normalizeVariants(s: string): string[] {
  const folded = foldDiacritics(foldLookalikes(s)).toLowerCase()

  // Stripped: remove all non-alphanumeric characters
  const stripped = folded.replace(/[^a-z0-9]+/g, '')

  // Spaced: replace non-alphanumeric runs with single space, trim
  const spaced = folded.replace(/[^a-z0-9]+/g, ' ').trim()

  if (stripped === spaced) {
    return stripped ? [stripped] : []
  }
  // Deduplicate: if one is empty, return only the non-empty one
  const variants: string[] = []
  if (stripped) variants.push(stripped)
  if (spaced && spaced !== stripped) variants.push(spaced)
  return variants
}

/**
 * Convenience: return the first (stripped) normalised variant, lowercased.
 * Used for building match keys where a single canonical form is needed.
 */
export function normalizeForMatching(s: string): string {
  const variants = normalizeVariants(s)
  return variants.length > 0 ? variants[0] : ''
}

/**
 * Strip trailing parenthesized content from album/song names.
 * Ported from blackbird-spotcheck/src/main.rs `strip_album_parentheses`.
 *
 * Removes trailing groups like "(Remaster)", "(Deluxe Edition)", "(2023 Mix)".
 * Handles unbalanced parens gracefully (leaves them as-is).
 */
export function stripAlbumParentheses(s: string): string {
  let result = s.trimEnd()

  // Repeatedly strip trailing parenthesized groups
  while (result.length > 0) {
    const trimmed = result.trimEnd()
    if (trimmed.length === 0) break

    // Must end with ')'
    if (!trimmed.endsWith(')')) break

    // Find the matching '(' for the final ')' by scanning backwards
    let depth = 0
    let openIdx = -1
    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i] === ')') depth++
      else if (trimmed[i] === '(') {
        depth--
        if (depth === 0) {
          openIdx = i
          break
        }
      }
    }

    // If we found a matching '(' and it's not the whole string, strip the group
    if (openIdx > 0) {
      result = trimmed.slice(0, openIdx).trimEnd()
    } else {
      break
    }
  }

  return result
}

/** Version clauses containing one of these words may identify a remix/edit. */
const REMIX_KEYWORD = /\b(?:remix(?:ed)?|bootleg|flip|rework|remake|edit|mix|cover|mashup)\b/i

/**
 * Generic version words that don't identify WHO made the version —
 * "(radio edit)" and "(extended mix)" are still the original work, while
 * "(Congorock remix)" is not.
 */
const REMIX_GENERIC_WORDS = new Set([
  'remix',
  'remixed',
  'bootleg',
  'flip',
  'rework',
  'remake',
  'edit',
  'mix',
  'cover',
  'mashup',
  'radio',
  'extended',
  'original',
  'album',
  'club',
  'dub',
  'single',
  'version',
  'ver',
  'vip',
  'instrumental',
  'full',
  'short',
  'size',
  'the',
  'feat',
  'featuring',
])

/**
 * Extract remixer-identity tokens from a title's version clauses.
 *
 * Looks at parenthesized/bracketed groups and dash-separated suffixes; when
 * a clause contains a remix-family keyword, the remaining non-generic words
 * identify the remixer: "Cinema (Congorock remix)" → ["congorock"],
 * "Cinema - Skrillex Remix" → ["skrillex"], "Cinema (radio edit)" → [].
 *
 * Used to keep remixes from matching the original (and vice versa): a
 * track tagged [congorock] must find that identity somewhere on the map
 * before a title match counts.
 */
export function extractRemixTags(title: string): string[] {
  const clauses: string[] = []
  for (const m of title.matchAll(/\(([^()]*)\)|\[([^[\]]*)\]/g)) {
    clauses.push(m[1] ?? m[2] ?? '')
  }
  const dashIdx = title.indexOf(' - ')
  if (dashIdx >= 0) clauses.push(title.slice(dashIdx + 3))

  const tags: string[] = []
  const seen = new Set<string>()
  for (const clause of clauses) {
    if (!REMIX_KEYWORD.test(clause)) continue
    // Last normalizeVariants entry is the word-preserving "spaced" form
    const variants = normalizeVariants(clause)
    if (variants.length === 0) continue
    const spaced = variants[variants.length - 1]
    for (const word of spaced.split(' ')) {
      if (word.length < 3) continue
      if (REMIX_GENERIC_WORDS.has(word)) continue
      if (/^\d+$/.test(word)) continue
      if (!seen.has(word)) {
        seen.add(word)
        tags.push(word)
      }
    }
  }
  return tags
}

/** Words to strip from album/song names before normalisation. */
const SUPERFLUOUS_WORDS = new Set([
  'edition',
  'deluxe',
  'remaster',
  'remastered',
  'remix',
  'remixed',
  'ep',
  'lp',
  'single',
  'explicit',
  'clean',
  'reissue',
  'rerelease',
  'expanded',
  'anniversary',
  'collector',
  'bonus',
  'version',
  'mono',
  'stereo',
  // Connector — "Rip & Tear" and "Rip and Tear" must normalize identically
  // ("&" is punctuation and vanishes, so "and" must vanish too)
  'and',
  // OST filler — soundtrack rips title the same music "X BGM", "X Theme",
  // or just "X" depending on the source
  'bgm',
  'theme',
  'ost',
])

/**
 * Remove superfluous words from a string.
 * Ported from blackbird-spotcheck/src/main.rs `strip_superfluous_words`.
 *
 * Removes whole-word matches of common superfluous terms like "edition",
 * "deluxe", "remaster", "ep", "lp", etc. Only removes whole words —
 * "editionary" will NOT become "ary".
 */
/** Parenthesized/bracketed mapper credit anywhere in an artist field, e.g. "(mapped by Roffle)". */
const MAPPER_CREDIT_PAREN =
  /[([{][^()[\]{}]*\b(?:beatmapp?e?d?|mapp?e?d?|charte?d?|edit(?:ed)?|remapp?e?d?)\s+by\b[^()[\]{}]*[)\]}]/gi

/** A segment that is purely a mapper credit, e.g. "beatmap by kieve", "Edit by Barudaq". */
const MAPPER_CREDIT_SEGMENT = /^\s*(?:beatmapp?e?d?|mapp?e?d?|charte?d?|edit(?:ed)?|remapp?e?d?)\s+by\b/i

/** Hard separators between unrelated credits: "|", "//", ";". */
const HARD_SEPARATOR = /\s*(?:\|+|\/\/+|;)\s*/

/** Soft separators between collaborating artists. */
const SOFT_SEPARATOR = /\s+(?:feat\.?|ft\.?|featuring|vs\.?|x|×|&|\+|and|with|w\/)\s+|\s*,\s*/i

/**
 * Split a (possibly messy) artist credit into candidate artist strings.
 *
 * Old BeatSaver maps conflate map author and track author: `level_author`
 * frequently holds strings like "Camellia feat. nanahira",
 * "gmtn (mapped by Roffle)", or "Shiggy Jr. | beatmap by kieve".
 * This produces the cleaned full string plus each collaborator segment,
 * with pure mapper credits dropped, so that exact index lookups succeed
 * where fuzzy matching against the messy blob would have been required.
 *
 * The cleaned full string is always first; the original semantics of
 * matching against the whole field are preserved by keeping it.
 */
export function splitArtistSegments(s: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (v: string) => {
    const trimmed = v.trim()
    if (!trimmed || seen.has(trimmed) || MAPPER_CREDIT_SEGMENT.test(trimmed)) return
    seen.add(trimmed)
    out.push(trimmed)
  }

  const cleaned = s.replace(MAPPER_CREDIT_PAREN, ' ')
  push(cleaned)
  for (const hard of cleaned.split(HARD_SEPARATOR)) {
    push(hard)
    const soft = hard.split(SOFT_SEPARATOR)
    if (soft.length > 1) {
      for (const segment of soft) push(segment)
    }
  }
  return out
}

export function stripSuperfluousWords(s: string): string {
  const words = s.split(/\s+/)
  const filtered = words.filter((w) => {
    const lower = w.toLowerCase()
    // Strip surrounding punctuation for the word check
    const cleaned = lower.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    return !SUPERFLUOUS_WORDS.has(cleaned)
  })
  return filtered.join(' ').trim()
}
