import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DataStatusBadge } from '@/components/DataStatusBadge'
import { RefreshCw, Music2, Moon, Sun } from 'lucide-react'

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
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <Music2 className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-bold">BeatSaver Map Database</h1>
          </div>
          <div className="flex items-center gap-2">
            <DataStatusBadge scrapeTime={scrapeTime} songCount={songCount} />
            <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh data">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onToggleTheme} title="Toggle theme">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
