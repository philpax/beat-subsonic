import { describe, it, expect } from 'vitest'
import { planDataLoad } from '@/hooks/useDatabase'

describe('planDataLoad', () => {
  it('returns use-cache when data unchanged and DB has songs', () => {
    const plan = planDataLoad(100, { changed: false })
    expect(plan.action).toBe('use-cache')
  })

  it('returns skip when data unchanged but DB is empty', () => {
    const plan = planDataLoad(0, { changed: false })
    expect(plan.action).toBe('skip')
  })

  it('returns import when data changed and database present', () => {
    const tagList = ['accuracy', 'dance']
    const plan = planDataLoad(0, {
      changed: true,
      database: { tagList },
    })
    expect(plan.action).toBe('import')
    if (plan.action === 'import') {
      expect(plan.database.tagList).toEqual(tagList)
    }
  })

  it('returns import when data changed and DB already has songs', () => {
    const plan = planDataLoad(50, {
      changed: true,
      database: { tagList: [] },
    })
    expect(plan.action).toBe('import')
  })

  it('returns skip when data changed but no database', () => {
    const plan = planDataLoad(0, { changed: true })
    expect(plan.action).toBe('skip')
  })
})
