import { test, expect } from '@playwright/test'

// /explore is public — discard any cached auth state so we exercise the
// read-only visitor experience.
test.use({ storageState: { cookies: [], origins: [] } })

// 설악그란폰도 — known course with populated route + metadata, used elsewhere
// in the suite (course-detail.spec.ts).
const SEORAK_COURSE_ID = 'a3c49cb0-c25d-4437-8b41-c167b800e00d'

const KAKAO_AVAILABLE = process.env.KAKAO_MAP_AVAILABLE === 'true'

test.describe('Course detail page — map and detail panel', () => {
  test('course detail page mounts the Kakao map container', async ({ page }) => {
    const response = await page.goto(`/courses/${SEORAK_COURSE_ID}`)
    expect(response, 'navigation response should not be null').not.toBeNull()
    expect(response!.status()).toBeLessThan(400)

    // KakaoMap wraps its <Map> in a div carrying this attribute regardless of
    // whether the Kakao SDK script has actually loaded. Treat it as the
    // stable DOM anchor for the map surface.
    const mapSurface = page.locator('[data-map-interaction-surface="true"]')
    await expect(mapSurface).toBeVisible({ timeout: 15_000 })
  })

  test('course detail panel renders distance and elevation metrics', async ({
    page,
  }) => {
    await page.goto(`/courses/${SEORAK_COURSE_ID}`)

    // CourseDetailPanel renders "거리" / "획득고도" SummaryMetric labels and a
    // km-suffixed value. The server hydrates this content so it does not
    // depend on the Kakao JS SDK loading successfully.
    await expect(page.getByText('거리', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      page.getByText('획득고도', { exact: true }).first(),
    ).toBeVisible()

    // Sanity: a numeric km readout is present in the panel.
    await expect(page.locator('text=/\\d+(?:\\.\\d+)?\\s*km/').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('SlopeLegend is not rendered anywhere on the course detail surface', async ({
    page,
  }) => {
    await page.goto(`/courses/${SEORAK_COURSE_ID}`)

    // Wait for the panel to be ready so we can assert on the steady-state DOM.
    await expect(page.getByText('거리', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    })

    // 1) No element with SlopeLegend-typed class / data-slot attribute.
    const byClassOrSlot = page.locator(
      '[class*="SlopeLegend"], [data-slot="slope-legend"]',
    )
    await expect(byClassOrSlot).toHaveCount(0)

    // 2) No element with aria-label "경사도 범례" (legend group contract).
    const byAria = page.getByRole('group', { name: '경사도 범례' })
    await expect(byAria).toHaveCount(0)

    // 3) Guard against an unrendered-but-styled container: there must be no
    // "pointer-events-none absolute bottom-4 left-4" wrapper whose label
    // reads "경사도" (which is exactly the legacy SlopeLegend shape in
    // components/map/kakao-map.tsx).
    const legacyWrapper = page.locator(
      'div.pointer-events-none.absolute.bottom-4.left-4:has-text("경사도")',
    )
    await expect(legacyWrapper).toHaveCount(0)
  })

  test('kakao map marker interaction (skipped when SDK unavailable)', async ({
    page,
  }) => {
    test.skip(
      !KAKAO_AVAILABLE,
      'Kakao Maps SDK not available in this environment — set KAKAO_MAP_AVAILABLE=true to run.',
    )

    await page.goto(`/courses/${SEORAK_COURSE_ID}`)
    const mapSurface = page.locator('[data-map-interaction-surface="true"]')
    await expect(mapSurface).toBeVisible({ timeout: 15_000 })

    // Once the Kakao SDK resolves, react-kakao-maps-sdk mounts its overlay
    // container inside the map div. Wait for any descendant with the vendor
    // class prefix.
    const anyKakaoNode = mapSurface.locator('div').filter({
      has: page.locator('img, canvas, [class*="kakao"]'),
    })
    await expect(anyKakaoNode.first()).toBeVisible({ timeout: 20_000 })
  })
})
