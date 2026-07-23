interface SongTableProps {
  tagList: string[]
}

export function SongTable({ tagList }: SongTableProps) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <p className="text-muted-foreground">
        Table view coming in Phase 5. Loaded {tagList.length} tags.
      </p>
    </div>
  )
}
