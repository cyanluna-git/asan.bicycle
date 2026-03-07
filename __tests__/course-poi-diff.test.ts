import { describe, expect, it } from 'vitest'
import { buildCoursePoiDiffPlan } from '@/lib/course-poi-diff'

describe('buildCoursePoiDiffPlan', () => {
  it('splits submitted POIs into update, insert, and delete sets', () => {
    const plan = buildCoursePoiDiffPlan(
      [{ id: 'poi-1' }, { id: 'poi-2' }],
      [
        {
          id: 'poi-1',
          name: '수정된 카페',
          category: 'cafe',
          description: '업데이트',
          photo_url: 'https://example.com/cafe.jpg',
          lat: 36.78,
          lng: 127.01,
        },
        {
          name: '새 편의점',
          category: 'convenience_store',
          description: null,
          photo_url: null,
          lat: 36.79,
          lng: 127.02,
        },
      ],
    )

    expect(plan.toUpdate).toEqual([
      {
        id: 'poi-1',
        name: '수정된 카페',
        category: 'cafe',
        description: '업데이트',
        photo_url: 'https://example.com/cafe.jpg',
        lat: 36.78,
        lng: 127.01,
      },
    ])
    expect(plan.toInsert).toEqual([
      {
        name: '새 편의점',
        category: 'convenience_store',
        description: null,
        photo_url: null,
        lat: 36.79,
        lng: 127.02,
      },
    ])
    expect(plan.toDeleteIds).toEqual(['poi-2'])
    expect(plan.invalidIds).toEqual([])
    expect(plan.duplicateIds).toEqual([])
  })

  it('flags submitted ids that do not belong to the existing course POIs', () => {
    const plan = buildCoursePoiDiffPlan(
      [{ id: 'poi-1' }],
      [
        {
          id: 'poi-999',
          name: '알 수 없는 POI',
          category: 'other',
          description: null,
          photo_url: null,
          lat: 36.78,
          lng: 127.01,
        },
      ],
    )

    expect(plan.invalidIds).toEqual(['poi-999'])
    expect(plan.toUpdate).toEqual([])
    expect(plan.toInsert).toEqual([])
    expect(plan.toDeleteIds).toEqual(['poi-1'])
  })

  it('flags duplicate submitted ids', () => {
    const plan = buildCoursePoiDiffPlan(
      [{ id: 'poi-1' }],
      [
        {
          id: 'poi-1',
          name: '첫 번째',
          category: 'cafe',
          description: null,
          photo_url: null,
          lat: 36.78,
          lng: 127.01,
        },
        {
          id: 'poi-1',
          name: '두 번째',
          category: 'restaurant',
          description: null,
          photo_url: null,
          lat: 36.79,
          lng: 127.02,
        },
      ],
    )

    expect(plan.duplicateIds).toEqual(['poi-1'])
    expect(plan.toUpdate).toHaveLength(1)
  })
})
