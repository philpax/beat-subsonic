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
    badges.push(
      <span
        key="ss"
        className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary"
      >
        SS RANKED
      </span>,
    )
  if (isRankedSet(rankedStates, RankedStates.BeatleaderRanked))
    badges.push(
      <span
        key="bl"
        className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent"
      >
        BL RANKED
      </span>,
    )
  if (isRankedSet(rankedStates, RankedStates.ScoresaberQualified))
    badges.push(
      <span
        key="ssq"
        className="rounded border border-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-primary"
      >
        SS QUALIFIED
      </span>,
    )
  if (isRankedSet(rankedStates, RankedStates.BeatleaderQualified))
    badges.push(
      <span
        key="blq"
        className="rounded border border-accent/30 px-1.5 py-0.5 text-[10px] font-medium text-accent"
      >
        BL QUALIFIED
      </span>,
    )
  return <div className="flex flex-wrap gap-1">{badges}</div>
}

export function UploadFlagBadge({ uploadFlags }: { uploadFlags: number }) {
  const badges: React.ReactNode[] = []
  if (isUploadFlagSet(uploadFlags, UploadFlags.Curated))
    badges.push(
      <span
        key="curated"
        className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary"
      >
        CURATED
      </span>,
    )
  if (isUploadFlagSet(uploadFlags, UploadFlags.VerifiedUploader))
    badges.push(
      <span
        key="verified"
        className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
      >
        VERIFIED
      </span>,
    )
  return <div className="flex flex-wrap gap-1">{badges}</div>
}

export function CharacteristicBadge({ characteristic }: { characteristic: number }) {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {characteristicLabel(characteristic)}
    </span>
  )
}

export function DifficultyBadge({ difficulty }: { difficulty: number }) {
  const colors: Record<number, string> = {
    0: 'text-green-400',
    1: 'text-blue-400',
    2: 'text-purple-400',
    3: 'text-pink-400',
    4: 'text-red-400',
  }
  return (
    <span className={`text-[10px] font-bold ${colors[difficulty] ?? 'text-muted-foreground'}`}>
      {difficultyLabel(difficulty)}
    </span>
  )
}

export function ModBadges({ mods }: { mods: number }) {
  const badges: React.ReactNode[] = []
  if (isModSet(mods, MapMods.NoodleExtensions))
    badges.push(
      <span
        key="ne"
        className="rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground"
      >
        NE
      </span>,
    )
  if (isModSet(mods, MapMods.MappingExtensions))
    badges.push(
      <span
        key="me"
        className="rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground"
      >
        ME
      </span>,
    )
  if (isModSet(mods, MapMods.Chroma))
    badges.push(
      <span
        key="chroma"
        className="rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground"
      >
        CHROMA
      </span>,
    )
  if (isModSet(mods, MapMods.Cinema))
    badges.push(
      <span
        key="cinema"
        className="rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground"
      >
        CINEMA
      </span>,
    )
  return <div className="flex flex-wrap gap-1">{badges}</div>
}

export function TagBadges({ tagsBitfield, tagList }: { tagsBitfield: number; tagList: string[] }) {
  const names = getTagNames(tagsBitfield, tagList)
  if (names.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
        >
          {name}
        </span>
      ))}
    </div>
  )
}
