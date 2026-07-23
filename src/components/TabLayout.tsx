import { useState, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TabId = 'beatsaver' | 'subsonic' | 'match'

interface TabLayoutProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  children: ReactNode
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'beatsaver', label: 'BeatSaver' },
  { id: 'subsonic', label: 'Subsonic' },
  { id: 'match', label: 'Match' },
]

const TAB_STORAGE_KEY = 'beatsaver-db:active-tab'

export function TabLayout({ activeTab, onTabChange, children }: TabLayoutProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="saber-gradient absolute bottom-0 left-0 right-0 h-0.5" />
            )}
          </button>
        ))}
      </div>
      {/* Tab content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

/** Hook for managing the active tab with localStorage persistence. */
export function useActiveTab(): [TabId, (tab: TabId) => void] {
  const [tab, setTab] = useState<TabId>(() => {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null
      if (stored && ['beatsaver', 'subsonic', 'match'].includes(stored)) {
        return stored
      }
    } catch {
      // ignore
    }
    return 'beatsaver'
  })

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab)
    } catch {
      // ignore
    }
  }, [tab])

  return [tab, setTab]
}
