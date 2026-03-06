import { describe, expect, it } from 'vitest'
import {
  appendMetadataHistoryEntry,
  buildPoiDraftFromRecord,
  buildMetadataHistoryEntry,
  buildStartPointOptions,
  isObjectUrl,
  parseStartPointLocation,
  recommendStartPoint,
} from '@/lib/course-upload'
import { getUploaderDisplayName } from '@/lib/user-display-name'

describe('parseStartPointLocation', () => {
  it('parses geojson-like coordinates', () => {
    expect(
      parseStartPointLocation({
        type: 'Point',
        coordinates: [127.004, 36.789],
      }),
    ).toEqual({ lat: 36.789, lng: 127.004 })
  })

  it('parses WKT point strings', () => {
    expect(parseStartPointLocation('POINT(127.004 36.789)')).toEqual({
      lat: 36.789,
      lng: 127.004,
    })
  })
})

describe('buildStartPointOptions / recommendStartPoint', () => {
  const options = buildStartPointOptions([
    {
      id: 'a',
      name: '온양온천역',
      location: { coordinates: [127.004, 36.789] },
    },
    {
      id: 'b',
      name: '신정호',
      location: { coordinates: [127.0, 36.778] },
    },
  ])

  it('builds typed start-point options', () => {
    expect(options).toEqual([
      { id: 'a', name: '온양온천역', lat: 36.789, lng: 127.004 },
      { id: 'b', name: '신정호', lat: 36.778, lng: 127.0 },
    ])
  })

  it('recommends the nearest start point', () => {
    expect(recommendStartPoint(36.7885, 127.0042, options)?.id).toBe('a')
  })
})

describe('buildMetadataHistoryEntry', () => {
  it('captures the uploaded metadata snapshot', () => {
    expect(
      buildMetadataHistoryEntry({
        actorDisplayName: 'cyanluna',
        actorUserId: 'user-1',
        form: {
          title: '  아산 라이딩 ',
          description: ' 코스 설명 ',
          difficulty: 'moderate',
          theme: '호수',
          tags: '호수,카페',
          startPointId: 'sp-1',
        },
        tags: ['호수', '카페'],
      }),
    ).toMatchObject({
      type: 'create',
      actorUserId: 'user-1',
      actorDisplayName: 'cyanluna',
      values: {
        title: '아산 라이딩',
        description: '코스 설명',
        difficulty: 'moderate',
        theme: '호수',
        tags: ['호수', '카페'],
        start_point_id: 'sp-1',
      },
    })
  })
})

describe('appendMetadataHistoryEntry', () => {
  it('appends onto an existing history array', () => {
    const next = appendMetadataHistoryEntry(
      [{ type: 'create' }],
      buildMetadataHistoryEntry({
        actorDisplayName: 'cyanluna',
        actorUserId: 'user-1',
        form: {
          title: '수정된 코스',
          description: '',
          difficulty: 'easy',
          theme: '',
          tags: '',
          startPointId: '',
        },
        tags: [],
        type: 'edit',
      }),
    )

    expect(Array.isArray(next)).toBe(true)
    expect(next).toHaveLength(2)
    expect((next as Array<{ type: string }>)[1].type).toBe('edit')
  })
})

describe('buildPoiDraftFromRecord / isObjectUrl', () => {
  it('converts a persisted POI row into an editable draft', () => {
    expect(
      buildPoiDraftFromRecord({
        id: 'poi-1',
        name: '온양 카페',
        category: 'cafe',
        description: '잠깐 쉬기 좋음',
        photo_url: 'https://example.com/cafe.jpg',
        lat: 36.78,
        lng: 127.01,
      }),
    ).toMatchObject({
      persistedId: 'poi-1',
      name: '온양 카페',
      category: 'cafe',
      description: '잠깐 쉬기 좋음',
      photoUrl: 'https://example.com/cafe.jpg',
      photoPreviewUrl: 'https://example.com/cafe.jpg',
      lat: 36.78,
      lng: 127.01,
    })
  })

  it('detects browser object URLs only', () => {
    expect(isObjectUrl('blob:https://example.com/123')).toBe(true)
    expect(isObjectUrl('https://example.com/photo.jpg')).toBe(false)
    expect(isObjectUrl(null)).toBe(false)
  })
})

describe('getUploaderDisplayName', () => {
  it('prefers full_name and falls back to the email prefix', () => {
    expect(
      getUploaderDisplayName({
        email: 'rider@example.com',
        user_metadata: { full_name: '아산 라이더' },
      } as never),
    ).toBe('아산 라이더')

    expect(
      getUploaderDisplayName({
        email: 'rider@example.com',
        user_metadata: {},
      } as never),
    ).toBe('rider')
  })
})
