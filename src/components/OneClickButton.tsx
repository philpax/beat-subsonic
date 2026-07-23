import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { buildOneClickUrl, buildMapPageUrl, buildDownloadUrl } from '@/lib/types'
import { Download, ExternalLink, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OneClickButtonProps {
  songKey: string
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'default' | 'sm' | 'icon'
}

export function OneClickButton({
  songKey,
  variant = 'default',
  size = 'default',
}: OneClickButtonProps) {
  const handleClick = () => {
    window.location.href = buildOneClickUrl(songKey)
  }

  const linkClass = cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors border border-border bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
    size === 'sm' ? 'h-7 px-2.5' : 'h-8 px-3'
  )

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger>
          <Button variant={variant} size={size} onClick={handleClick} className="gap-1">
            <Zap className="h-3.5 w-3.5" />
            OneClick
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Requires ModAssistant or BeatSaverDl registered as the beatsaver:// protocol handler
        </TooltipContent>
      </Tooltip>

      <a
        href={buildMapPageUrl(songKey)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        <ExternalLink className="h-3 w-3" />
        BeatSaver
      </a>

      <a
        href={buildDownloadUrl(songKey)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        <Download className="h-3 w-3" />
        ZIP
      </a>
    </div>
  )
}
