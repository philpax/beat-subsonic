import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { SongFilters } from '@/lib/db/queries'
import {
  MapCharacteristic,
  MapDifficulty,
  RankedStates,
  UploadFlags,
  MapMods,
} from '@/lib/proto/enums'
import { X } from 'lucide-react'

interface FilterPanelProps {
  tagList: string[]
  filters: SongFilters
  onFiltersChange: (filters: SongFilters) => void
}

export function FilterPanel({ tagList, filters, onFiltersChange }: FilterPanelProps) {
  const update = (patch: Partial<SongFilters>) => {
    onFiltersChange({ ...filters, ...patch })
  }

  const toggleArray = (arr: number[] | undefined, value: number): number[] => {
    const current = arr ?? []
    return current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
  }

  const reset = () => {
    onFiltersChange({})
  }

  return (
    <div className="border-b bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Filters</h3>
        <Button variant="ghost" size="sm" onClick={reset} className="gap-1 text-xs">
          <X className="h-3 w-3" />
          Clear all
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {/* Characteristic */}
        <FilterSection title="Characteristic">
          {Object.entries(MapCharacteristic)
            .filter(([k]) => isNaN(Number(k)))
            .map(([label, value]) => (
              <label key={label} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={filters.characteristics?.includes(value as number) ?? false}
                  onClick={() =>
                    update({
                      characteristics: toggleArray(filters.characteristics, value as number),
                    })
                  }
                />
                {label}
              </label>
            ))}
        </FilterSection>

        {/* Difficulty */}
        <FilterSection title="Difficulty">
          {Object.entries(MapDifficulty)
            .filter(([k]) => isNaN(Number(k)))
            .map(([label, value]) => (
              <label key={label} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={filters.difficulties?.includes(value as number) ?? false}
                  onClick={() =>
                    update({
                      difficulties: toggleArray(filters.difficulties, value as number),
                    })
                  }
                />
                {label}
              </label>
            ))}
        </FilterSection>

        {/* Ranked States */}
        <FilterSection title="Ranked">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={(filters.rankedStatesAny ?? 0 & RankedStates.ScoresaberRanked) !== 0}
              onClick={() => {
                const current = filters.rankedStatesAny ?? 0
                update({
                  rankedStatesAny: current ^ RankedStates.ScoresaberRanked,
                })
              }}
            />
            SS Ranked
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={(filters.rankedStatesAny ?? 0 & RankedStates.BeatleaderRanked) !== 0}
              onClick={() => {
                const current = filters.rankedStatesAny ?? 0
                update({
                  rankedStatesAny: current ^ RankedStates.BeatleaderRanked,
                })
              }}
            />
            BL Ranked
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={(filters.rankedStatesAny ?? 0 & RankedStates.ScoresaberQualified) !== 0}
              onClick={() => {
                const current = filters.rankedStatesAny ?? 0
                update({
                  rankedStatesAny: current ^ RankedStates.ScoresaberQualified,
                })
              }}
            />
            SS Qualified
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={(filters.rankedStatesAny ?? 0 & RankedStates.BeatleaderQualified) !== 0}
              onClick={() => {
                const current = filters.rankedStatesAny ?? 0
                update({
                  rankedStatesAny: current ^ RankedStates.BeatleaderQualified,
                })
              }}
            />
            BL Qualified
          </label>
        </FilterSection>

        {/* Upload Flags */}
        <FilterSection title="Upload Flags">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={(filters.uploadFlags ?? 0 & UploadFlags.Curated) !== 0}
              onClick={() => {
                const current = filters.uploadFlags ?? 0
                update({ uploadFlags: current ^ UploadFlags.Curated })
              }}
            />
            Curated
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={(filters.uploadFlags ?? 0 & UploadFlags.VerifiedUploader) !== 0}
              onClick={() => {
                const current = filters.uploadFlags ?? 0
                update({ uploadFlags: current ^ UploadFlags.VerifiedUploader })
              }}
            />
            Verified Uploader
          </label>
        </FilterSection>

        {/* BPM Range */}
        <FilterSection title="BPM Range">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={filters.bpmMin ?? ''}
              onChange={(e) =>
                update({ bpmMin: e.target.value ? Number(e.target.value) : undefined })
              }
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs">—</span>
            <Input
              type="number"
              placeholder="Max"
              value={filters.bpmMax ?? ''}
              onChange={(e) =>
                update({ bpmMax: e.target.value ? Number(e.target.value) : undefined })
              }
              className="h-7 w-16 text-xs"
            />
          </div>
        </FilterSection>

        {/* Star Rating */}
        <FilterSection title="Star Rating">
          <Select
            value={filters.starsSource ?? 'ss'}
            onChange={(e) => update({ starsSource: e.target.value as 'ss' | 'bl' })}
            className="h-7 w-16 text-xs"
          >
            <option value="ss">SS</option>
            <option value="bl">BL</option>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.5"
              placeholder="Min"
              value={filters.starsMin ?? ''}
              onChange={(e) =>
                update({ starsMin: e.target.value ? Number(e.target.value) : undefined })
              }
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs">—</span>
            <Input
              type="number"
              step="0.5"
              placeholder="Max"
              value={filters.starsMax ?? ''}
              onChange={(e) =>
                update({ starsMax: e.target.value ? Number(e.target.value) : undefined })
              }
              className="h-7 w-16 text-xs"
            />
          </div>
        </FilterSection>

        {/* Mods */}
        <FilterSection title="Mods">
          {Object.entries(MapMods)
            .filter(([k]) => isNaN(Number(k)))
            .map(([label, value]) => (
              <label key={label} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={(filters.mods ?? 0 & (value as number)) !== 0}
                  onClick={() => {
                    const current = filters.mods ?? 0
                    update({ mods: current ^ (value as number) })
                  }}
                />
                {label}
              </label>
            ))}
        </FilterSection>

        {/* Tags */}
        {tagList.length > 0 && (
          <FilterSection title="Tags">
            <div className="max-h-32 overflow-y-auto">
              {tagList.slice(0, 20).map((tag, i) => (
                <label key={tag} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={filters.tags?.includes(i) ?? false}
                    onClick={() =>
                      update({
                        tags: toggleArray(filters.tags, i),
                      })
                    }
                  />
                  {tag}
                </label>
              ))}
            </div>
          </FilterSection>
        )}
      </div>
    </div>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
