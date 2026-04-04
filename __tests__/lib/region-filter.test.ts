import { describe, it, expect } from 'vitest'
import {
  parseFilterParams,
  buildFilterQuery,
  countActiveFilters,
  defaultFilterState,
} from '@/lib/filter'

describe('parseFilterParams — region', () => {
  it('should parse a valid region UUID from search params', () => {
    const params = new URLSearchParams('region=550e8400-e29b-41d4-a716-446655440000')
    const state = parseFilterParams(params)
    expect(state.regionId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('should return null for invalid region ID', () => {
    const params = new URLSearchParams('region=not-a-uuid')
    const state = parseFilterParams(params)
    expect(state.regionId).toBeNull()
  })

  it('should return null when region is absent', () => {
    const params = new URLSearchParams('')
    const state = parseFilterParams(params)
    expect(state.regionId).toBeNull()
  })

  it('should parse region from a Record', () => {
    const params = { region: '550e8400-e29b-41d4-a716-446655440000' }
    const state = parseFilterParams(params)
    expect(state.regionId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('should parse region alongside other filters', () => {
    const params = new URLSearchParams(
      'difficulty=easy,moderate&distance=medium&region=550e8400-e29b-41d4-a716-446655440000',
    )
    const state = parseFilterParams(params)
    expect(state.difficulty).toEqual(['easy', 'moderate'])
    expect(state.distance).toBe('medium')
    expect(state.regionId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })
})

describe('buildFilterQuery — region', () => {
  it('should include region in query string', () => {
    const state = {
      ...defaultFilterState(),
      regionId: '550e8400-e29b-41d4-a716-446655440000',
    }
    const query = buildFilterQuery(state)
    expect(query).toContain('region=550e8400-e29b-41d4-a716-446655440000')
  })

  it('should omit region when null', () => {
    const state = defaultFilterState()
    const query = buildFilterQuery(state)
    expect(query).not.toContain('region')
  })

  it('should round-trip region through parse and build', () => {
    const original = {
      ...defaultFilterState(),
      regionId: '550e8400-e29b-41d4-a716-446655440000',
    }
    const query = buildFilterQuery(original)
    const parsed = parseFilterParams(new URLSearchParams(query))
    expect(parsed.regionId).toBe(original.regionId)
  })
})

describe('countActiveFilters — region', () => {
  it('should count region as an active filter', () => {
    const state = {
      ...defaultFilterState(),
      regionId: '550e8400-e29b-41d4-a716-446655440000',
    }
    expect(countActiveFilters(state)).toBe(1)
  })

  it('should count region alongside other filters', () => {
    const state = {
      ...defaultFilterState(),
      difficulty: ['easy' as const],
      regionId: '550e8400-e29b-41d4-a716-446655440000',
    }
    expect(countActiveFilters(state)).toBe(2)
  })

  it('should not count null region', () => {
    expect(countActiveFilters(defaultFilterState())).toBe(0)
  })
})

describe('defaultFilterState', () => {
  it('should include regionId as null', () => {
    const state = defaultFilterState()
    expect(state.regionId).toBeNull()
    expect(state).toHaveProperty('regionId')
  })
})
