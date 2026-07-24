import { describe, it, expect } from 'vitest'
import { buildPageList } from './pagination'

describe('buildPageList', () => {
  it('lists all pages when they fit without elision', () => {
    expect(buildPageList(1, 5, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageList(3, 5, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageList(8, 15, 5)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })

  it('elides the middle with first/last pages anchored', () => {
    expect(buildPageList(10, 30, 5)).toEqual([
      1,
      null,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      null,
      30,
    ])
  })

  it('pads the run near the start instead of shrinking', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, null, 30]
    for (let page = 1; page <= 7; page++) {
      expect(buildPageList(page, 30, 5)).toEqual(expected)
    }
  })

  it('pads the run near the end instead of shrinking', () => {
    const expected = [1, null, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
    for (let page = 24; page <= 30; page++) {
      expect(buildPageList(page, 30, 5)).toEqual(expected)
    }
  })

  it('always renders a constant number of slots when pages overflow', () => {
    for (let page = 1; page <= 100; page++) {
      expect(buildPageList(page, 100, 5)).toHaveLength(15)
    }
  })

  it('handles a single page', () => {
    expect(buildPageList(1, 1, 5)).toEqual([1])
  })
})
