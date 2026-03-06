import type { PoiMapItem } from '@/types/course'
import type { Enums } from '@/types/database'

export type PoiCategory = Enums<'poi_category'>
export type PoiCategoryFilter = 'all' | PoiCategory

type PoiMeta = {
  label: string
  emoji: string
  color: string
}

export const POI_CATEGORY_ORDER: PoiCategory[] = [
  'cafe',
  'restaurant',
  'convenience_store',
  'rest_area',
  'repair_shop',
  'photo_spot',
  'parking',
  'restroom',
  'water_fountain',
  'other',
]

const POI_CATEGORY_SET = new Set<string>(POI_CATEGORY_ORDER)

export const POI_META: Record<PoiCategory, PoiMeta> = {
  cafe: { label: '카페', emoji: '☕', color: '#6F4E37' },
  restaurant: { label: '식당', emoji: '🍽️', color: '#E85D2E' },
  convenience_store: { label: '편의점', emoji: '🏪', color: '#2563EB' },
  rest_area: { label: '쉼터', emoji: '🛖', color: '#16A34A' },
  repair_shop: { label: '자전거 수리', emoji: '🔧', color: '#7C3AED' },
  photo_spot: { label: '포토스팟', emoji: '📸', color: '#DB2777' },
  parking: { label: '주차', emoji: '🅿️', color: '#475569' },
  restroom: { label: '화장실', emoji: '🚻', color: '#0891B2' },
  water_fountain: { label: '음수대', emoji: '💧', color: '#0284C7' },
  other: { label: '기타', emoji: '📍', color: '#64748B' },
}

export function normalizePoiCategory(category: string | null | undefined): PoiCategory {
  if (category && POI_CATEGORY_SET.has(category)) {
    return category as PoiCategory
  }
  return 'other'
}

export function getPoiMeta(category: string | null | undefined): PoiMeta {
  return POI_META[normalizePoiCategory(category)]
}

function comparePoiName(a: PoiMapItem, b: PoiMapItem) {
  return a.name.localeCompare(b.name, 'ko')
}

function comparePoiCategory(a: PoiMapItem, b: PoiMapItem) {
  return (
    POI_CATEGORY_ORDER.indexOf(normalizePoiCategory(a.category))
    - POI_CATEGORY_ORDER.indexOf(normalizePoiCategory(b.category))
  )
}

export function getPoiCategoryTabs(pois: PoiMapItem[]): PoiCategory[] {
  const seen = new Set<PoiCategory>()

  for (const poi of pois) {
    seen.add(normalizePoiCategory(poi.category))
  }

  return POI_CATEGORY_ORDER.filter((category) => seen.has(category))
}

export function sortPoisForRail(
  pois: PoiMapItem[],
  activeCategory: PoiCategoryFilter,
): PoiMapItem[] {
  const filtered = activeCategory === 'all'
    ? pois
    : pois.filter((poi) => normalizePoiCategory(poi.category) === activeCategory)

  return [...filtered].sort((a, b) => {
    if (activeCategory === 'all') {
      const categoryResult = comparePoiCategory(a, b)
      if (categoryResult !== 0) {
        return categoryResult
      }
    }

    return comparePoiName(a, b)
  })
}
