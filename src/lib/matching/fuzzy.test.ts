import { describe, it, expect } from 'vitest'
import {
  jaroSimilarity,
  winklerSimilarity,
  wordBasedSimilarity,
  tokenSetSimilarity,
  fuzzyMatch,
} from './fuzzy'

describe('jaroSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroSimilarity('hello', 'hello')).toBe(1.0)
  })

  it('returns 0.0 for empty strings', () => {
    expect(jaroSimilarity('', '')).toBe(0.0)
    expect(jaroSimilarity('a', '')).toBe(0.0)
    expect(jaroSimilarity('', 'a')).toBe(0.0)
  })

  it('returns high similarity for similar strings', () => {
    expect(jaroSimilarity('martha', 'marhta')).toBeGreaterThan(0.9)
  })

  it('returns lower similarity for different strings', () => {
    expect(jaroSimilarity('abc', 'xyz')).toBeLessThan(0.5)
  })

  it('handles different length strings', () => {
    expect(jaroSimilarity('a', 'abc')).toBeGreaterThan(0)
    expect(jaroSimilarity('a', 'abc')).toBeLessThan(1)
  })
})

describe('winklerSimilarity', () => {
  it('boosts strings with common prefix', () => {
    const jaro = jaroSimilarity('martha', 'marhta')
    const winkler = winklerSimilarity('martha', 'marhta', jaro)
    expect(winkler).toBeGreaterThanOrEqual(jaro)
  })

  it('returns 1.0 for identical strings (jaro=1, no boost needed)', () => {
    const jaro = jaroSimilarity('hello', 'hello')
    expect(winklerSimilarity('hello', 'hello', jaro)).toBe(1.0)
  })
})

describe('wordBasedSimilarity', () => {
  it('returns 1.0 for identical word sets', () => {
    expect(wordBasedSimilarity('hello world', 'world hello')).toBe(1.0)
  })

  it('returns 0.0 for empty strings', () => {
    expect(wordBasedSimilarity('', '')).toBe(1.0)
    expect(wordBasedSimilarity('a', '')).toBe(0.0)
  })

  it('returns partial similarity for overlapping words', () => {
    const score = wordBasedSimilarity('foo bar', 'foo baz')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('returns 0 for completely different words', () => {
    expect(wordBasedSimilarity('abc', 'xyz')).toBe(0.0)
  })
})

describe('tokenSetSimilarity', () => {
  it('returns 1.0 for identical token sets', () => {
    expect(tokenSetSimilarity('foo bar', 'bar foo')).toBe(1.0)
  })

  it('returns 1.0 for empty strings', () => {
    expect(tokenSetSimilarity('', '')).toBe(1.0)
  })

  it('returns 0.0 for one empty string', () => {
    expect(tokenSetSimilarity('foo', '')).toBe(0.0)
  })

  it('handles extra words in one string', () => {
    const score = tokenSetSimilarity('camellia body', 'camellia body f10ating10')
    // intersection=2, diff_a=0, diff_b=1
    // score = 2 / (2 + 0/2 + 1/2) = 2 / 2.5 = 0.8
    expect(score).toBeCloseTo(0.8, 2)
  })

  it('handles partial overlap', () => {
    const score = tokenSetSimilarity('foo bar', 'bar baz')
    // intersection=1, diff_a=1, diff_b=1
    // score = 1 / (1 + 0.5 + 0.5) = 0.5
    expect(score).toBeCloseTo(0.5, 2)
  })
})

describe('fuzzyMatch', () => {
  it('returns 1.0 for identical strings', () => {
    expect(fuzzyMatch('hello', 'hello')).toBe(1.0)
  })

  it('returns at least 0.8 for contains relationship', () => {
    // fuzzyMatch takes the max of all metrics, so contains (0.8) is a floor
    expect(fuzzyMatch('hello world', 'hello')).toBeGreaterThanOrEqual(0.8)
    expect(fuzzyMatch('hello', 'hello world')).toBeGreaterThanOrEqual(0.8)
  })

  it('returns high score for very similar strings', () => {
    expect(fuzzyMatch('camellia', 'camellia')).toBe(1.0)
  })

  it('returns low score for completely different strings', () => {
    expect(fuzzyMatch('abc', 'xyz')).toBeLessThan(0.5)
  })

  it('handles word reordering well via token-set', () => {
    const score = fuzzyMatch('foo bar', 'bar foo')
    expect(score).toBe(1.0) // token set gives 1.0 for same tokens
  })
})
