import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { CoverImage } from '@/components/CoverImage'
import { OneClickButton } from '@/components/OneClickButton'
import {
  RankedBadge,
  UploadFlagBadge,
  TagBadges,
  CharacteristicBadge,
  DifficultyBadge,
  ModBadges,
} from '@/components/Badges'
import { getDbClient } from '@/lib/db/client'
import type { SongRow, DifficultyRow } from '@/lib/types'

interface SongDetailDialogProps {
  song: SongRow | null
  tagList: string[]
  onClose: () => void
}

export function SongDetailDialog({ song, tagList, onClose }: SongDetailDialogProps) {
  const [difficulties, setDifficulties] = useState<DifficultyRow[]>([])

  useEffect(() => {
    if (!song) return
    let cancelled = false
    const fetch = async () => {
      try {
        const client = getDbClient()
        const rows = await client.getDifficulties(song.map_id)
        if (!cancelled) {
          setDifficulties(rows as unknown as DifficultyRow[])
        }
      } catch (err) {
        console.error('Failed to fetch difficulties:', err)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [song])

  if (!song) return null

  return (
    <Dialog open={!!song} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-border bg-card">
        <DialogHeader>
          <div className="flex gap-4">
            <CoverImage
              hash={song.hash}
              alt={song.song_name}
              className="h-20 w-20 rounded-md"
            />
            <div className="flex-1 space-y-1">
              <DialogTitle className="text-lg font-bold tracking-tight">{song.song_name}</DialogTitle>
              <DialogDescription className="text-sm">
                <span className="text-muted-foreground">by </span>
                <span className="font-medium text-foreground">{song.song_author}</span>
              </DialogDescription>
              <div className="text-xs text-muted-foreground">
                mapped by <span className="font-medium text-foreground">{song.level_author}</span>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <OneClickButton songKey={song.key} size="sm" />
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
            <MetaItem label="Key" value={song.key} mono />
            <MetaItem label="BPM" value={song.bpm.toFixed(1)} mono />
            <MetaItem label="Duration" value={formatDuration(song.duration)} mono />
            <MetaItem label="Rating" value={`${(song.rating * 100).toFixed(1)}%`} mono />
            <MetaItem label="Upvotes" value={song.upvotes.toLocaleString()} mono />
            <MetaItem label="Downvotes" value={song.downvotes.toLocaleString()} mono />
            <MetaItem
              label="Uploaded"
              value={new Date(song.upload_time * 1000).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            />
            <MetaItem label="Uploader" value={song.uploader_name} />
          </div>

          {/* Badges */}
          <div className="space-y-2">
            <RankedBadge rankedStates={song.ranked_states} />
            <UploadFlagBadge uploadFlags={song.upload_flags} />
            {song.tags > 0 && <TagBadges tagsBitfield={song.tags} tagList={tagList} />}
          </div>

          {/* Difficulty table */}
          {difficulties.length > 0 && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Difficulties</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Mode</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Diff</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">SS</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">BL</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">NJS</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Notes</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Bombs</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Walls</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Mods</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {difficulties.map((diff) => (
                    <TableRow key={diff.id}>
                      <TableCell>
                        <CharacteristicBadge characteristic={diff.characteristic} />
                      </TableCell>
                      <TableCell>
                        <DifficultyBadge difficulty={diff.difficulty} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{diff.stars_ss > 0 ? diff.stars_ss.toFixed(2) : '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{diff.stars_bl > 0 ? diff.stars_bl.toFixed(2) : '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{diff.njs > 0 ? diff.njs.toFixed(1) : '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{diff.notes}</TableCell>
                      <TableCell className="font-mono text-xs">{diff.bombs}</TableCell>
                      <TableCell className="font-mono text-xs">{diff.obstacles}</TableCell>
                      <TableCell>
                        <ModBadges mods={diff.mods} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
