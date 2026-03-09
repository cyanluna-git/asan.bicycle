import { describe, expect, it } from 'vitest'
import {
  getPoiCategoryTabs,
  normalizePoiCategory,
  sortPoisForRail,
  suggestPoiCategoryFromSearch,
} from '@/lib/poi'
import type { PoiMapItem } from '@/types/course'

const POIS: PoiMapItem[] = [
  {
    id: '2',
    course_id: 'course-1',
    name: 'B 카페',
    category: 'cafe',
    description: null,
    photo_url: null,
    lat: 36.8,
    lng: 127.1,
  },
  {
    id: '1',
    course_id: 'course-1',
    name: 'A 식당',
    category: 'restaurant',
    description: null,
    photo_url: null,
    lat: 36.7,
    lng: 127.0,
  },
  {
    id: '3',
    course_id: 'course-1',
    name: '이름 없는 장소',
    category: 'mystery',
    description: null,
    photo_url: null,
    lat: 36.9,
    lng: 127.2,
  },
]

describe('normalizePoiCategory', () => {
  it('keeps known categories', () => {
    expect(normalizePoiCategory('cafe')).toBe('cafe')
  })

  it('maps empty or unknown categories to other', () => {
    expect(normalizePoiCategory(null)).toBe('other')
    expect(normalizePoiCategory('unknown')).toBe('other')
  })
})

describe('getPoiCategoryTabs', () => {
  it('returns unique categories in predefined order', () => {
    expect(getPoiCategoryTabs(POIS)).toEqual(['cafe', 'restaurant', 'other'])
  })
})

describe('sortPoisForRail', () => {
  it('sorts all-category view by category order and then name', () => {
    expect(sortPoisForRail(POIS, 'all').map((poi) => poi.id)).toEqual(['2', '1', '3'])
  })

  it('filters category tabs and sorts by name', () => {
    expect(sortPoisForRail(POIS, 'restaurant').map((poi) => poi.id)).toEqual(['1'])
  })
})

describe('suggestPoiCategoryFromSearch', () => {
  it('maps common Kakao place categories to internal POI categories', () => {
    expect(suggestPoiCategoryFromSearch('음식점 > 한식')).toBe('restaurant')
    expect(suggestPoiCategoryFromSearch('카페')).toBe('cafe')
    expect(suggestPoiCategoryFromSearch('관광명소')).toBe('photo_spot')
    expect(suggestPoiCategoryFromSearch('화장실')).toBe('restroom')
  })

  it('falls back to other for unknown search categories', () => {
    expect(suggestPoiCategoryFromSearch('은행')).toBe('other')
    expect(suggestPoiCategoryFromSearch(null)).toBe('other')
  })
})
