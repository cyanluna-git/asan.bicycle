import { describe, expect, it } from 'vitest'
import { buildCourseDownloadFilename } from '@/lib/gpx-download'

describe('buildCourseDownloadFilename', () => {
  it('builds a stable filename from title and date', () => {
    expect(
      buildCourseDownloadFilename('아산 신정호 순환 코스', '2026-03-07T00:00:00Z'),
    ).toBe('아산_신정호_순환_코스_20260307.gpx')
  })

  it('removes invalid filename characters', () => {
    expect(
      buildCourseDownloadFilename('A/B:C*D?E"F<G>H|', '2026-03-07T00:00:00Z'),
    ).toBe('A_B_C_D_E_F_G_H_20260307.gpx')
  })

  it('falls back when the title is empty after sanitizing', () => {
    expect(
      buildCourseDownloadFilename('   ', '2026-03-07T00:00:00Z'),
    ).toBe('course_20260307.gpx')
  })
})
