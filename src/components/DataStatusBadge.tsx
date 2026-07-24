import { Badge } from '@/components/ui/badge'
import { Clock, Database } from 'lucide-react'
import { formatIsoDate } from '@/components/table-shared'

interface DataStatusBadgeProps {
  scrapeTime: number | null
  songCount: number
}

export function DataStatusBadge({ scrapeTime, songCount }: DataStatusBadgeProps) {
  const formattedTime = scrapeTime ? formatIsoDate(scrapeTime) : 'Unknown'

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1">
        <Database className="h-3 w-3" />
        {songCount.toLocaleString()} maps
      </Badge>
      <Badge variant="outline" className="gap-1">
        <Clock className="h-3 w-3" />
        Scraped: {formattedTime}
      </Badge>
    </div>
  )
}
