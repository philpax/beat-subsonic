import { Badge } from '@/components/ui/badge'
import {
  RankedStates,
  UploadFlags,
  MapMods,
  characteristicLabel,
  difficultyLabel,
  isRankedSet,
  isUploadFlagSet,
  isModSet,
  getTagNames,
} from '@/lib/proto/enums'

export function RankedBadge({ rankedStates }: { rankedStates: number }) {
  const badges: React.ReactNode[] = []
  if (isRankedSet(rankedStates, RankedStates.ScoresaberRanked))
    badges.push(<Badge key="ss" variant="default" className="text-xs">SS Ranked</Badge>)
  if (isRankedSet(rankedStates, RankedStates.BeatleaderRanked))
    badges.push(<Badge key="bl" variant="secondary" className="text-xs">BL Ranked</Badge>)
  if (isRankedSet(rankedStates, RankedStates.ScoresaberQualified))
    badges.push(<Badge key="ssq" variant="outline" className="text-xs">SS Qualified</Badge>)
  if (isRankedSet(rankedStates, RankedStates.BeatleaderQualified))
    badges.push(<Badge key="blq" variant="outline" className="text-xs">BL Qualified</Badge>)
  return <div className="flex flex-wrap gap-1">{badges}</div>
}

export function UploadFlagBadge({ uploadFlags }: { uploadFlags: number }) {
  const badges: React.ReactNode[] = []
  if (isUploadFlagSet(uploadFlags, UploadFlags.Curated))
    badges.push(<Badge key="curated" variant="default" className="text-xs">Curated</Badge>)
  if (isUploadFlagSet(uploadFlags, UploadFlags.VerifiedUploader))
    badges.push(<Badge key="verified" variant="secondary" className="text-xs">Verified</Badge>)
  return <div className="flex flex-wrap gap-1">{badges}</div>
}

export function CharacteristicBadge({ characteristic }: { characteristic: number }) {
  return <Badge variant="outline" className="text-xs">{characteristicLabel(characteristic)}</Badge>
}

export function DifficultyBadge({ difficulty }: { difficulty: number }) {
  const colors: Record<number, string> = {
    0: 'bg-green-500/20 text-green-700 dark:text-green-400',
    1: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    2: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
    3: 'bg-pink-500/20 text-pink-700 dark:text-pink-400',
    4: 'bg-red-500/20 text-red-700 dark:text-red-400',
  }
  return (
    <Badge className={`text-xs ${colors[difficulty] ?? ''}`}>
      {difficultyLabel(difficulty)}
    </Badge>
  )
}

export function ModBadges({ mods }: { mods: number }) {
  const badges: React.ReactNode[] = []
  if (isModSet(mods, MapMods.NoodleExtensions))
    badges.push(<Badge key="ne" variant="outline" className="text-xs">NE</Badge>)
  if (isModSet(mods, MapMods.MappingExtensions))
    badges.push(<Badge key="me" variant="outline" className="text-xs">ME</Badge>)
  if (isModSet(mods, MapMods.Chroma))
    badges.push(<Badge key="chroma" variant="outline" className="text-xs">Chroma</Badge>)
  if (isModSet(mods, MapMods.Cinema))
    badges.push(<Badge key="cinema" variant="outline" className="text-xs">Cinema</Badge>)
  return <div className="flex flex-wrap gap-1">{badges}</div>
}

export function TagBadges({ tagsBitfield, tagList }: { tagsBitfield: number; tagList: string[] }) {
  const names = getTagNames(tagsBitfield, tagList)
  if (names.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>
      ))}
    </div>
  )
}
