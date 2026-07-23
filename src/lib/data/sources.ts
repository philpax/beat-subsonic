/**
 * Data source URLs for the BeatSaver scrapped data dump.
 * Matches the DataGetter.cs pattern from kinsi55/BeatSaberScrappedData.
 */

export type DataSourceId = 'Direct' | 'JSDelivr'

export interface DataSource {
  id: DataSourceId
  url: string
}

/** Primary source: GitHub raw */
export const DIRECT_SOURCE: DataSource = {
  id: 'Direct',
  url: 'https://raw.githubusercontent.com/kinsi55/BeatSaberScrappedData/master/songDetails2_v3.gz',
}

/** Fallback source: jsDelivr CDN */
export const JDELIVR_SOURCE: DataSource = {
  id: 'JSDelivr',
  url: 'https://cdn.jsdelivr.net/gh/kinsi55/BeatSaberScrappedData@master/songDetails2_v3.gz',
}

/** All sources, in priority order (Direct first, jsDelivr fallback) */
export const DATA_SOURCES: DataSource[] = [DIRECT_SOURCE, JDELIVR_SOURCE]
