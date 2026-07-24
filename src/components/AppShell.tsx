import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Moon, Sun } from 'lucide-react'
import { formatIsoDate } from '@/components/table-shared'

interface AppShellProps {
  children: ReactNode
  songCount: number
  scrapeTime: number | null
  onRefresh: () => void
  isDark: boolean
  onToggleTheme: () => void
}

export function AppShell({
  children,
  songCount,
  scrapeTime,
  onRefresh,
  isDark,
  onToggleTheme,
}: AppShellProps) {
  const scrapeDate = scrapeTime
    ? formatIsoDate(scrapeTime)
    : null

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-bold tracking-tight">BeatSubsonic</h1>
            <span className="text-xs text-muted-foreground">
              {songCount.toLocaleString()} maps
              {scrapeDate && <span className="ml-1">· updated {scrapeDate}</span>}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onRefresh} title="Check for updates" className="h-8 w-8">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onToggleTheme} title="Toggle theme" className="h-8 w-8">
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {/* Saber gradient underline */}
        <div className="saber-gradient h-px" />
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="mx-auto h-full max-w-[1600px] px-6">{children}</div>
      </main>
    </div>
  )
}
