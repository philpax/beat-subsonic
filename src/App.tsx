import { useState, useEffect } from 'react'
import { AppShell } from '@/components/AppShell'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SongTable } from '@/components/SongTable'
import { SubsonicView } from '@/components/SubsonicView'
import { MatchView } from '@/components/MatchView'
import { TabLayout, useActiveTab } from '@/components/TabLayout'
import { useDatabase } from '@/hooks/useDatabase'

const THEME_KEY = 'beatsaver-db:theme'

function App() {
  const { state, refresh } = useDatabase()
  const [activeTab, setActiveTab] = useActiveTab()
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      if (stored) return stored === 'dark'
    } catch {
      // ignore
    }
    // Default to dark — the neon-arcade aesthetic is the primary identity
    return true
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.classList.toggle('light', !isDark)
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
    } catch {
      // ignore
    }
  }, [isDark])

  if (state.status !== 'ready') {
    return (
      <LoadingScreen
        status={state.status}
        error={state.error}
        progress={state.progress}
      />
    )
  }

  const stats = state.stats
  const tagList = stats?.tagList ?? []

  return (
    <AppShell
      songCount={stats?.songCount ?? 0}
      scrapeTime={stats?.scrapeTime ?? null}
      onRefresh={refresh}
      isDark={isDark}
      onToggleTheme={() => setIsDark((d) => !d)}
    >
      <TabLayout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'beatsaver' && <SongTable tagList={tagList} />}
        {activeTab === 'subsonic' && <SubsonicView />}
        {activeTab === 'match' && <MatchView />}
      </TabLayout>
    </AppShell>
  )
}

export default App
