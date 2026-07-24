import { type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { cn } from '@/lib/utils'

export type TabId = 'beatsaver' | 'subsonic' | 'match'

interface TabLayoutProps {
  children: ReactNode
}

const TABS: { id: TabId; label: string; path: string }[] = [
  { id: 'beatsaver', label: 'BeatSaver', path: '/beatsaver' },
  { id: 'subsonic', label: 'Subsonic', path: '/subsonic' },
  { id: 'match', label: 'Match', path: '/match' },
]

/** Where a hash-less load lands (connecting Subsonic is step one). */
export const DEFAULT_TAB_PATH = '/subsonic'

export function TabLayout({ children }: TabLayoutProps) {
  const [location] = useLocation()

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.path}
            className={cn(
              'relative px-4 py-2 text-sm font-medium transition-colors',
              location === tab.path
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {location === tab.path && (
              <div className="saber-gradient absolute bottom-0 left-0 right-0 h-0.5" />
            )}
          </Link>
        ))}
      </div>
      {/* Tab content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
