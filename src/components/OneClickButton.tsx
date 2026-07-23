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
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
    size === 'sm' ? 'h-8 rounded-md px-3 text-xs' : 'h-9 px-4 py-2'
  )

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger>
          <Button variant={variant} size={size} onClick={handleClick} className="gap-1">
            <Zap className="h-4 w-4" />
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
        <ExternalLink className="h-4 w-4" />
        BeatSaver
      </a>

      <a
        href={buildDownloadUrl(songKey)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        <Download className="h-4 w-4" />
        ZIP
      </a>
    </div>
  )
}
