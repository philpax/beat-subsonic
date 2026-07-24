/**
 * Forum-style pagination page-list construction.
 */

/** How many page numbers to show on each side of the current page. */
export const PAGE_WINDOW_RADIUS = 5

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

/**
 * The forum-style page list: a window around the current page, with page 1
 * and the last page always anchored and nulls marking elided ranges.
 *
 * The list always has exactly `2*radius + 5` entries (window + anchors +
 * gaps) whenever there are that many pages, padding the run near the ends
 * instead of shrinking it — so the control doesn't change width as the
 * current page moves.
 */
export function buildPageList(page: number, totalPages: number, radius: number): (number | null)[] {
  const totalSlots = 2 * radius + 5

  // Few enough pages that everything fits with no elision
  if (totalPages <= totalSlots) return range(1, totalPages)

  // Near the start: 1..(slots-2), gap, last
  if (page <= radius + 2) {
    return [...range(1, totalSlots - 2), null, totalPages]
  }

  // Near the end: 1, gap, (last-(slots-3))..last
  if (page >= totalPages - radius - 1) {
    return [1, null, ...range(totalPages - (totalSlots - 3), totalPages)]
  }

  // Middle: 1, gap, window, gap, last
  return [1, null, ...range(page - radius, page + radius), null, totalPages]
}
