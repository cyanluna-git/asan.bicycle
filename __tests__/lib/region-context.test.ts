import { describe, it, expect, beforeEach, vi } from 'vitest'

// Test region context logic as pure session storage operations

const TEMP_ID_KEY = 'temporary_region_id'
const TEMP_NAME_KEY = 'temporary_region_name'

describe('region context — temporary region session storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('should store temporary region in sessionStorage', () => {
    sessionStorage.setItem(TEMP_ID_KEY, 'region-123')
    sessionStorage.setItem(TEMP_NAME_KEY, '충남 아산시')

    expect(sessionStorage.getItem(TEMP_ID_KEY)).toBe('region-123')
    expect(sessionStorage.getItem(TEMP_NAME_KEY)).toBe('충남 아산시')
  })

  it('should clear temporary region from sessionStorage', () => {
    sessionStorage.setItem(TEMP_ID_KEY, 'region-123')
    sessionStorage.setItem(TEMP_NAME_KEY, '충남 아산시')

    sessionStorage.removeItem(TEMP_ID_KEY)
    sessionStorage.removeItem(TEMP_NAME_KEY)

    expect(sessionStorage.getItem(TEMP_ID_KEY)).toBeNull()
    expect(sessionStorage.getItem(TEMP_NAME_KEY)).toBeNull()
  })

  it('should return null when no temporary region is set', () => {
    expect(sessionStorage.getItem(TEMP_ID_KEY)).toBeNull()
    expect(sessionStorage.getItem(TEMP_NAME_KEY)).toBeNull()
  })

  it('should overwrite existing temporary region', () => {
    sessionStorage.setItem(TEMP_ID_KEY, 'region-a')
    sessionStorage.setItem(TEMP_NAME_KEY, '서울')

    sessionStorage.setItem(TEMP_ID_KEY, 'region-b')
    sessionStorage.setItem(TEMP_NAME_KEY, '부산')

    expect(sessionStorage.getItem(TEMP_ID_KEY)).toBe('region-b')
    expect(sessionStorage.getItem(TEMP_NAME_KEY)).toBe('부산')
  })
})

describe('region context — temporary vs home region priority', () => {
  it('should prefer temporary region over home region', () => {
    const homeRegionId = 'home-123'
    const homeRegionName = '충남 아산시'
    const tempRegionId = 'temp-456'
    const tempRegionName = '서울 강남구'

    const currentRegionId = tempRegionId ?? homeRegionId
    const currentRegionName = tempRegionName ?? homeRegionName
    const isTemporary = tempRegionId !== null

    expect(currentRegionId).toBe('temp-456')
    expect(currentRegionName).toBe('서울 강남구')
    expect(isTemporary).toBe(true)
  })

  it('should fall back to home region when no temporary region', () => {
    const homeRegionId = 'home-123'
    const homeRegionName = '충남 아산시'
    const tempRegionId: string | null = null
    const tempRegionName: string | null = null

    const currentRegionId = tempRegionId ?? homeRegionId
    const currentRegionName = tempRegionName ?? homeRegionName
    const isTemporary = tempRegionId !== null

    expect(currentRegionId).toBe('home-123')
    expect(currentRegionName).toBe('충남 아산시')
    expect(isTemporary).toBe(false)
  })

  it('should return null when neither temporary nor home region exists', () => {
    const homeRegionId: string | null = null
    const homeRegionName: string | null = null
    const tempRegionId: string | null = null
    const tempRegionName: string | null = null

    const currentRegionId = tempRegionId ?? homeRegionId
    const currentRegionName = tempRegionName ?? homeRegionName

    expect(currentRegionId).toBeNull()
    expect(currentRegionName).toBeNull()
  })
})

describe('region onboarding — skip logic', () => {
  const SESSION_KEY = 'region_onboarding_skipped'

  beforeEach(() => {
    sessionStorage.clear()
  })

  it('should not be skipped by default', () => {
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('should be skipped after user dismisses', () => {
    sessionStorage.setItem(SESSION_KEY, 'true')
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('true')
  })

  it('should determine modal visibility based on session flag', () => {
    const isSkipped = sessionStorage.getItem(SESSION_KEY) === 'true'
    expect(isSkipped).toBe(false)

    sessionStorage.setItem(SESSION_KEY, 'true')
    const isSkippedAfter = sessionStorage.getItem(SESSION_KEY) === 'true'
    expect(isSkippedAfter).toBe(true)
  })
})

describe('region filter — fallback logic', () => {
  it('should attempt sigungu first, then expand to sido', () => {
    type Course = { id: string; region_id: string }
    const allCourses: Course[] = [
      { id: 'c1', region_id: 'sido-1-sigungu-1' },
      { id: 'c2', region_id: 'sido-1-sigungu-2' },
      { id: 'c3', region_id: 'sido-2-sigungu-1' },
    ]
    const sidoSigunguMap: Record<string, string[]> = {
      'sido-1': ['sido-1-sigungu-1', 'sido-1-sigungu-2'],
      'sido-2': ['sido-2-sigungu-1'],
    }

    // Exact sigungu match
    const regionId = 'sido-1-sigungu-1'
    const exactMatch = allCourses.filter((c) => c.region_id === regionId)
    expect(exactMatch).toHaveLength(1)

    // No match for a specific sigungu -> expand to sido
    const emptyRegionId = 'sido-1-sigungu-3'
    const emptyMatch = allCourses.filter((c) => c.region_id === emptyRegionId)
    expect(emptyMatch).toHaveLength(0)

    // Expand to parent sido
    const parentSidoId = 'sido-1'
    const sidoRegions = sidoSigunguMap[parentSidoId] ?? []
    const expandedMatch = allCourses.filter((c) => sidoRegions.includes(c.region_id))
    expect(expandedMatch).toHaveLength(2)
  })

  it('should return all courses when sido expansion also yields 0', () => {
    type Course = { id: string; region_id: string }
    const allCourses: Course[] = [
      { id: 'c1', region_id: 'region-a' },
    ]

    const emptyRegion = 'region-z'
    const emptySidoRegions: string[] = []

    const sigunguMatch = allCourses.filter((c) => c.region_id === emptyRegion)
    expect(sigunguMatch).toHaveLength(0)

    const sidoMatch = allCourses.filter((c) => emptySidoRegions.includes(c.region_id))
    expect(sidoMatch).toHaveLength(0)

    // Fallback to all
    const fallback = sigunguMatch.length > 0 ? sigunguMatch : sidoMatch.length > 0 ? sidoMatch : allCourses
    expect(fallback).toHaveLength(1)
  })
})

describe('install prompt — dismiss logic (pure)', () => {
  const DISMISS_DAYS = 7

  function isDismissed(dismissedAt: number | null, now: number): boolean {
    if (dismissedAt === null) return false
    return now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000
  }

  it('should not be dismissed when no timestamp stored', () => {
    expect(isDismissed(null, Date.now())).toBe(false)
  })

  it('should be dismissed within 7 days', () => {
    const now = Date.now()
    expect(isDismissed(now, now)).toBe(true)
    expect(isDismissed(now, now + 6 * 24 * 60 * 60 * 1000)).toBe(true)
  })

  it('should not be dismissed after 7 days', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    expect(isDismissed(eightDaysAgo, Date.now())).toBe(false)
  })
})
