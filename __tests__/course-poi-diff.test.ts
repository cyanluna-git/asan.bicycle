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

  it('marks every existing POI for deletion when nothing is submitted', () => {
    const plan = buildCoursePoiDiffPlan(
      [{ id: 'poi-1' }, { id: 'poi-2' }, { id: 'poi-3' }],
      [],
    )

    expect(plan.toDeleteIds).toEqual(['poi-1', 'poi-2', 'poi-3'])
    expect(plan.toInsert).toEqual([])
    expect(plan.toUpdate).toEqual([])
    expect(plan.invalidIds).toEqual([])
    expect(plan.duplicateIds).toEqual([])
  })

  it('treats every submitted POI without an id as an insert when there are no existing POIs', () => {
    const plan = buildCoursePoiDiffPlan(
      [],
      [
        {
          name: '편의점 A',
          category: 'convenience_store',
          description: null,
          photo_url: null,
          lat: 36.78,
          lng: 127.01,
        },
        {
          name: '카페 B',
          category: 'cafe',
          description: null,
          photo_url: null,
          lat: 36.79,
          lng: 127.02,
        },
      ],
    )

    expect(plan.toInsert).toHaveLength(2)
    expect(plan.toDeleteIds).toEqual([])
    expect(plan.toUpdate).toEqual([])
    expect(plan.invalidIds).toEqual([])
  })

  it('handles a mixed payload with insert, update and delete in the same call', () => {
    const plan = buildCoursePoiDiffPlan(
      [{ id: 'keep' }, { id: 'drop' }],
      [
        {
          id: 'keep',
          name: '유지되는 카페',
          category: 'cafe',
          description: '수정',
          photo_url: 'https://example.com/keep.jpg',
          lat: 36.78,
          lng: 127.01,
        },
        {
          name: '새로 추가되는 식당',
          category: 'restaurant',
          description: null,
          photo_url: null,
          lat: 36.81,
          lng: 127.05,
        },
      ],
    )

    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].id).toBe('keep')
    expect(plan.toInsert).toHaveLength(1)
    expect(plan.toDeleteIds).toEqual(['drop'])
    expect(plan.invalidIds).toEqual([])
    expect(plan.duplicateIds).toEqual([])
  })

  it('does not leak the optional id field into insert payloads', () => {
    const plan = buildCoursePoiDiffPlan(
      [],
      [
        {
          id: null,
          name: '익명 POI',
          category: null,
          description: null,
          photo_url: null,
          lat: 36.78,
          lng: 127.01,
        },
      ],
    )

    expect(plan.toInsert).toHaveLength(1)
    expect(plan.toInsert[0]).not.toHaveProperty('id')
  })
})
