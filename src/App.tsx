import { useState, useEffect } from 'react'
import { Redirect, Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { AppShell } from '@/components/AppShell'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SongTable } from '@/components/SongTable'
import { SubsonicView } from '@/components/SubsonicView'
import { MatchView } from '@/components/MatchView'
import { TabLayout, DEFAULT_TAB_PATH } from '@/components/TabLayout'
import { useDatabase } from '@/hooks/useDatabase'

const THEME_KEY = 'beatsaver-db:theme'

function App() {
  const { state, refresh } = useDatabase()
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
    return <LoadingScreen status={state.status} error={state.error} progress={state.progress} />
  }

  const stats = state.stats
  const tagList = stats?.tagList ?? []

  return (
    <Router hook={useHashLocation}>
      <AppShell
        songCount={stats?.songCount ?? 0}
        scrapeTime={stats?.scrapeTime ?? null}
        onRefresh={refresh}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
      >
        <TabLayout>
          <Switch>
            <Route path="/beatsaver">
              <SongTable tagList={tagList} />
            </Route>
            <Route path="/subsonic">
              <SubsonicView />
            </Route>
            <Route path="/match">
              <MatchView tagList={tagList} />
            </Route>
            {/* No (or unknown) hash — go to the default tab */}
            <Route>
              <Redirect to={DEFAULT_TAB_PATH} replace />
            </Route>
          </Switch>
        </TabLayout>
      </AppShell>
    </Router>
  )
}

export default App
