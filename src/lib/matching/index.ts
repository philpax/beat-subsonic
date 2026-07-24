export {
  foldLookalikes,
  foldDiacritics,
  normalizeVariants,
  normalizeForMatching,
  stripAlbumParentheses,
  stripSuperfluousWords,
} from './normalize'
export {
  jaroSimilarity,
  winklerSimilarity,
  wordBasedSimilarity,
  tokenSetSimilarity,
  fuzzyMatch,
} from './fuzzy'
export {
  buildMapKey,
  buildTrackKey,
  buildMatchIndex,
  matchTrackToMaps,
  matchAllTracks,
  computeMatchScore,
  extractTrigrams,
} from './matcher'
export type {
  MapKey,
  TrackKey,
  MatchIndex,
  MatchResult,
} from './matcher'
export { MatchClient, getMatchClient } from './client'
export type { MatchWorkerInput, MatchProgress } from './client'
