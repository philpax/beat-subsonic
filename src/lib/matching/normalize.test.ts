import { describe, it, expect } from 'vitest'
import {
  foldLookalikes,
  foldDiacritics,
  normalizeVariants,
  normalizeForMatching,
  stripAlbumParentheses,
  stripSuperfluousWords,
} from './normalize'

describe('foldLookalikes', () => {
  it('converts curly quotes to straight quotes', () => {
    expect(foldLookalikes('\u2018hello\u2019')).toBe("'hello'")
    expect(foldLookalikes('\u201Chello\u201D')).toBe('"hello"')
  })

  it('converts en/em dashes to hyphens', () => {
    expect(foldLookalikes('foo \u2013 bar')).toBe('foo - bar')
    expect(foldLookalikes('foo \u2014 bar')).toBe('foo - bar')
  })

  it('converts ellipsis to period', () => {
    expect(foldLookalikes('wait\u2026')).toBe('wait.')
  })

  it('converts Unicode spaces to ASCII space', () => {
    expect(foldLookalikes('foo\u00A0bar')).toBe('foo bar')
    expect(foldLookalikes('foo\u3000bar')).toBe('foo bar')
  })

  it('converts full-width Latin to ASCII', () => {
    expect(foldLookalikes('\uFF21\uFF22\uFF23')).toBe('ABC')
    expect(foldLookalikes('\uFF41\uFF42\uFF43')).toBe('abc')
    expect(foldLookalikes('\uFF10\uFF11\uFF12')).toBe('012')
  })

  it('leaves ASCII unchanged', () => {
    expect(foldLookalikes('Hello World 123')).toBe('Hello World 123')
  })

  it('handles empty string', () => {
    expect(foldLookalikes('')).toBe('')
  })
})

describe('foldDiacritics', () => {
  it('folds accented characters to ASCII', () => {
    expect(foldDiacritics('Röyksopp')).toBe('Royksopp')
    expect(foldDiacritics('café')).toBe('cafe')
    expect(foldDiacritics('naïve')).toBe('naive')
    expect(foldDiacritics('Ångström')).toBe('Angstrom')
  })

  it('handles already-ASCII strings', () => {
    expect(foldDiacritics('Hello World')).toBe('Hello World')
  })

  it('handles empty string', () => {
    expect(foldDiacritics('')).toBe('')
  })

  it('handles strings with combining marks already separated', () => {
    // e + combining acute accent
    expect(foldDiacritics('e\u0301')).toBe('e')
  })
})

describe('normalizeVariants', () => {
  it('produces stripped and spaced variants for strings with punctuation', () => {
    const variants = normalizeVariants('AC/DC')
    expect(variants).toContain('acdc')
    expect(variants).toContain('ac dc')
    expect(variants).toHaveLength(2)
  })

  it('deduplicates when stripped and spaced are equal', () => {
    const variants = normalizeVariants('Hello World')
    expect(variants).toEqual(['helloworld', 'hello world'])
  })

  it('folds diacritics before producing variants', () => {
    const variants = normalizeVariants('Röyksopp')
    // Both variants should have 'royksopp' (no diacritics)
    expect(variants).toContain('royksopp')
  })

  it('handles curly apostrophe in "i\'m"', () => {
    // i\u2019m → i'm → stripped: "im", spaced: "i m"
    const variants = normalizeVariants('i\u2019m')
    expect(variants).toContain('im')
    expect(variants).toContain('i m')
  })

  it('handles empty string', () => {
    expect(normalizeVariants('')).toEqual([])
  })

  it('handles string with only punctuation', () => {
    expect(normalizeVariants('!!!')).toEqual([])
  })

  it('lowercases the result', () => {
    const variants = normalizeVariants('CAMELLIA')
    expect(variants.every((v) => v === v.toLowerCase())).toBe(true)
  })

  it('collapses multiple whitespace in spaced variant', () => {
    const variants = normalizeVariants('foo   bar')
    expect(variants).toContain('foo bar')
  })
})

describe('normalizeForMatching', () => {
  it('returns the stripped variant', () => {
    expect(normalizeForMatching('AC/DC')).toBe('acdc')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeForMatching('')).toBe('')
  })

  it('folds diacritics', () => {
    expect(normalizeForMatching('Röyksopp')).toBe('royksopp')
  })
})

describe('stripAlbumParentheses', () => {
  it('strips trailing parenthesized content', () => {
    expect(stripAlbumParentheses('Song (Remaster)')).toBe('Song')
    expect(stripAlbumParentheses('Album (Deluxe Edition)')).toBe('Album')
    expect(stripAlbumParentheses('Track (2023 Mix)')).toBe('Track')
  })

  it('strips multiple trailing parenthesized groups', () => {
    expect(stripAlbumParentheses('Song (Remaster) (Deluxe)')).toBe('Song')
  })

  it('does not strip non-trailing parentheses', () => {
    expect(stripAlbumParentheses('(Intro) Song')).toBe('(Intro) Song')
  })

  it('handles unbalanced parens gracefully', () => {
    expect(stripAlbumParentheses('Song (Remaster')).toBe('Song (Remaster')
    expect(stripAlbumParentheses('Song Remaster)')).toBe('Song Remaster)')
  })

  it('handles empty string', () => {
    expect(stripAlbumParentheses('')).toBe('')
  })

  it('handles string with no parens', () => {
    expect(stripAlbumParentheses('Just A Song')).toBe('Just A Song')
  })

  it('handles nested parens', () => {
    expect(stripAlbumParentheses('Song (Remaster (2023))')).toBe('Song')
  })
})

describe('stripSuperfluousWords', () => {
  it('removes whole-word superfluous terms', () => {
    expect(stripSuperfluousWords('Song Deluxe Edition')).toBe('Song')
    expect(stripSuperfluousWords('Track Remaster')).toBe('Track')
    expect(stripSuperfluousWords('Album EP')).toBe('Album')
  })

  it('does not remove partial-word matches', () => {
    // "editionary" should NOT become "ary"
    expect(stripSuperfluousWords('editionary')).toBe('editionary')
    expect(stripSuperfluousWords('deluxeness')).toBe('deluxeness')
  })

  it('handles empty string', () => {
    expect(stripSuperfluousWords('')).toBe('')
  })

  it('handles string with only superfluous words', () => {
    expect(stripSuperfluousWords('deluxe remaster')).toBe('')
  })

  it('preserves non-superfluous words', () => {
    expect(stripSuperfluousWords('Camellia Body F10ating10')).toBe('Camellia Body F10ating10')
  })

  it('handles case-insensitively', () => {
    expect(stripSuperfluousWords('Song DELUXE Edition')).toBe('Song')
    expect(stripSuperfluousWords('Song Remastered')).toBe('Song')
  })

  it('handles multiple spaces', () => {
    expect(stripSuperfluousWords('Song  Deluxe  Edition')).toBe('Song')
  })

  it('strips punctuation around words before checking', () => {
    expect(stripSuperfluousWords('Song (Deluxe)')).toBe('Song')
  })
})
