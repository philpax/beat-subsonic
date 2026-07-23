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

/**
 * Fold Unicode lookalike characters to their ASCII equivalents.
 * Ported from blackbird-core/src/library.rs `fold_lookalikes`.
 */
export function foldLookalikes(s: string): string {
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
])

/**
 * Remove superfluous words from a string.
 * Ported from blackbird-spotcheck/src/main.rs `strip_superfluous_words`.
 *
 * Removes whole-word matches of common superfluous terms like "edition",
 * "deluxe", "remaster", "ep", "lp", etc. Only removes whole words —
 * "editionary" will NOT become "ary".
 */
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
