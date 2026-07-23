import { useState, useEffect } from 'react'

const PREFIX = 'beatsaver-db:pref'

export function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const fullKey = `${PREFIX}:${key}`

  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(fullKey)
      if (stored) return JSON.parse(stored) as T
    } catch {
      // ignore parse errors
    }
    return defaultValue
  })

  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(state))
    } catch {
      // ignore storage errors
    }
  }, [fullKey, state])

  return [state, setState]
}
