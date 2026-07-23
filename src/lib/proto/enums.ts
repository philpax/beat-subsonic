/**
 * Enum and flag definitions for BeatSaver map data.
 * Values verified from SongDifficultyProto.cs and SongProto.cs in the
 * kinsi55/BeatSaberScrappedData source.
 */

/** MapCharacteristic — which Beat Saber game mode the difficulty belongs to. */
export const MapCharacteristic = {
  Custom: 0,
  Standard: 1,
  OneSaber: 2,
  NoArrows: 3,
  NinetyDegree: 4,
  ThreeSixtyDegree: 5,
  Lightshow: 6,
  Lawless: 7,
} as const
export type MapCharacteristic = (typeof MapCharacteristic)[keyof typeof MapCharacteristic]

const MapCharacteristicLabels: Record<number, string> = {
  0: 'Custom',
  1: 'Standard',
  2: 'One Saber',
  3: 'No Arrows',
  4: '90 Degree',
  5: '360 Degree',
  6: 'Lightshow',
  7: 'Lawless',
}

export function characteristicLabel(n: number): string {
  return MapCharacteristicLabels[n] ?? `Unknown(${n})`
}

/** MapDifficulty — the difficulty rank. */
export const MapDifficulty = {
  Easy: 0,
  Normal: 1,
  Hard: 2,
  Expert: 3,
  ExpertPlus: 4,
} as const
export type MapDifficulty = (typeof MapDifficulty)[keyof typeof MapDifficulty]

const MapDifficultyLabels: Record<number, string> = {
  0: 'Easy',
  1: 'Normal',
  2: 'Hard',
  3: 'Expert',
  4: 'Expert+',
}

export function difficultyLabel(n: number): string {
  return MapDifficultyLabels[n] ?? `Unknown(${n})`
}

/** RankedStates — bitfield flags on a song's ranked status. */
export const RankedStates = {
  ScoresaberRanked: 1,
  BeatleaderRanked: 2,
  ScoresaberQualified: 4,
  BeatleaderQualified: 8,
} as const
export type RankedStates = (typeof RankedStates)[keyof typeof RankedStates]

export function isRankedSet(flags: number, bit: number): boolean {
  return (flags & bit) === bit
}

/** UploadFlags — bitfield flags on a song's upload status. */
export const UploadFlags = {
  Curated: 1,
  VerifiedUploader: 2,
} as const
export type UploadFlags = (typeof UploadFlags)[keyof typeof UploadFlags]

export function isUploadFlagSet(flags: number, bit: number): boolean {
  return (flags & bit) === bit
}

/** MapMods — bitfield flags for difficulty mods/requirements. */
export const MapMods = {
  NoodleExtensions: 1,
  MappingExtensions: 2,
  Chroma: 4,
  Cinema: 8,
} as const
export type MapMods = (typeof MapMods)[keyof typeof MapMods]

export function isModSet(flags: number, bit: number): boolean {
  return (flags & bit) === bit
}

/** Known BeatSaver tags. The tagList is dynamic from the dump, but these are common. */
export const BeatSaverTags = [
  'accuracy',
  'dance',
  'ambient',
  'folk',
  'electronic',
  'metal',
  'joke',
  'speedcore',
  'trance',
  'disney',
  'fnf',
  'rbp',
  'stream',
  'tech',
  'jump',
  'fitness',
  'balanced',
  'dance',
] as const

/**
 * Build a mapping from tag string to bit position.
 * Bit position i means tagList[i] is set.
 */
export function buildTagMap(tagList: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < tagList.length; i++) {
    map.set(tagList[i], i)
  }
  return map
}

/**
 * Get all tag names set in a song's tags bitfield.
 */
export function getTagNames(tagsBitfield: number, tagList: string[]): string[] {
  const names: string[] = []
  let bits = tagsBitfield
  let i = 0
  while (bits > 0) {
    if (bits & 1) {
      const name = tagList[i]
      if (name) names.push(name)
    }
    bits = Math.floor(bits / 2)
    i++
  }
  return names
}
