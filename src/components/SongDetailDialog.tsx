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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex gap-4">
            <CoverImage
              hash={song.hash}
              alt={song.song_name}
              className="h-24 w-24 rounded-lg"
            />
            <div className="flex-1 space-y-1">
              <DialogTitle className="text-xl">{song.song_name}</DialogTitle>
              <DialogDescription>
                by <span className="font-medium text-foreground">{song.song_author}</span>
              </DialogDescription>
              <div className="text-sm text-muted-foreground">
                Mapped by <span className="font-medium text-foreground">{song.level_author}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <OneClickButton songKey={song.key} size="sm" />
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
            <MetaItem label="Key" value={song.key} mono />
            <MetaItem label="BPM" value={song.bpm.toFixed(1)} />
            <MetaItem label="Duration" value={formatDuration(song.duration)} />
            <MetaItem label="Rating" value={`${(song.rating * 100).toFixed(1)}%`} />
            <MetaItem label="Upvotes" value={song.upvotes.toLocaleString()} />
            <MetaItem label="Downvotes" value={song.downvotes.toLocaleString()} />
            <MetaItem
              label="Uploaded"
              value={new Date(song.upload_time * 1000).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            />
            <MetaItem label="Uploader" value={song.uploader_name} />
            <MetaItem label="Hash" value={song.hash.slice(0, 12) + '...'} mono />
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
              <h3 className="mb-2 text-sm font-medium">Difficulties</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Characteristic</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead>SS Stars</TableHead>
                    <TableHead>BL Stars</TableHead>
                    <TableHead>NJS</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Bombs</TableHead>
                    <TableHead>Obstacles</TableHead>
                    <TableHead>Mods</TableHead>
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
                      <TableCell>{diff.stars_ss > 0 ? diff.stars_ss.toFixed(2) : '—'}</TableCell>
                      <TableCell>{diff.stars_bl > 0 ? diff.stars_bl.toFixed(2) : '—'}</TableCell>
                      <TableCell>{diff.njs > 0 ? diff.njs.toFixed(1) : '—'}</TableCell>
                      <TableCell>{diff.notes}</TableCell>
                      <TableCell>{diff.bombs}</TableCell>
                      <TableCell>{diff.obstacles}</TableCell>
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
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
