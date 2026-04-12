import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const FIXTURE_GPX = path.join(process.cwd(), 'e2e/fixtures/test-route.gpx')
const AUTH_STATE = path.join(process.cwd(), 'playwright/.auth/user.json')

const TEST_COURSE_TITLE = 'E2E테스트코스'
const TEST_UPHILL_NAME = 'E2E테스트고개'

function hasAuthState(): boolean {
  try {
    if (!fs.existsSync(AUTH_STATE)) return false
    const raw = fs.readFileSync(AUTH_STATE, 'utf8')
    const parsed = JSON.parse(raw) as {
      cookies?: unknown[]
      origins?: { localStorage?: unknown[] }[]
    }
    const hasCookies = Array.isArray(parsed.cookies) && parsed.cookies.length > 0
    const hasStorage =
      Array.isArray(parsed.origins) &&
      parsed.origins.some(
        (o) => Array.isArray(o?.localStorage) && (o.localStorage?.length ?? 0) > 0,
      )
    return hasCookies || hasStorage
  } catch {
    return false
  }
}

/**
 * Attempts to delete test course and famous_uphill rows.
 * Best-effort: silently logs if Supabase service role env is missing.
 */
async function cleanupTestData(courseId: string | null): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.log('[cleanup] Skipping DB cleanup — SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (courseId) {
      await admin.from('course_uphills').delete().eq('course_id', courseId)
      await admin.from('uphill_segments').delete().eq('course_id', courseId)
      await admin.from('courses').delete().eq('id', courseId)
      console.log(`[cleanup] deleted course ${courseId}`)
    }

    await admin.from('famous_uphills').delete().eq('name', TEST_UPHILL_NAME)
    console.log(`[cleanup] deleted famous_uphill ${TEST_UPHILL_NAME}`)
  } catch (error) {
    console.warn('[cleanup] failed:', error instanceof Error ? error.message : error)
  }
}

// Reset storageState so unauthenticated test runs truly anonymous, even
// though the chromium project uses a shared auth file by default.
test.describe('Upload page — unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows login prompt without upload UI', async ({ page }) => {
    await page.goto('/upload')

    await expect(
      page.getByRole('heading', { name: '로그인이 필요합니다' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Google로 시작하기/ }),
    ).toBeVisible()

    // Upload UI (dropzone copy) must NOT be rendered
    await expect(
      page.getByText('GPX 파일을 드래그하거나 클릭하여 선택'),
    ).toHaveCount(0)
  })
})

test.describe('Upload page — full authenticated flow', () => {
  let uploadedCourseId: string | null = null

  test.beforeAll(() => {
    if (!hasAuthState()) {
      test.skip(
        true,
        'playwright/.auth/user.json not found — skipping auth-dependent upload flow. ' +
          'Create .env.test.local and run `pnpm exec playwright test --project=setup` first.',
      )
    }
  })

  test.afterEach(async () => {
    await cleanupTestData(uploadedCourseId)
    uploadedCourseId = null
  })

  test('GPX upload → uphill rename → save → famous_uphills promotion → detail', async ({
    page,
  }) => {
    // 1. Navigate to /upload (authenticated)
    await page.goto('/upload')

    // Sanity: upload dropzone visible
    await expect(
      page.getByText('GPX 파일을 드래그하거나 클릭하여 선택'),
    ).toBeVisible({ timeout: 10_000 })

    // 2. Select the fixture GPX file
    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(FIXTURE_GPX)

    // 3. Wait for parsing: StatCard "거리" label appears
    await expect(page.getByText('거리', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // 4. Wait for UphillEditor; expect at least one segment input present
    const uphillHeading = page.getByRole('heading', { name: '업힐 구간' })
    await expect(uphillHeading).toBeVisible({ timeout: 15_000 })

    const segmentNameInputs = page.locator('input[placeholder="구간 이름"]')
    const segmentCount = await segmentNameInputs.count()
    if (segmentCount === 0) {
      // If auto-detection yielded nothing, add one manually
      await page.getByRole('button', { name: /구간 추가/ }).click()
      // Click the chart twice to define a segment — approximate center
      const chart = page.locator('.recharts-wrapper').first()
      const box = await chart.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5)
        await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
      }
      await expect(segmentNameInputs.first()).toBeVisible({ timeout: 5_000 })
    }

    // 5. Rename first uphill segment → TEST_UPHILL_NAME
    const firstSegmentInput = segmentNameInputs.first()
    await firstSegmentInput.fill(TEST_UPHILL_NAME)
    await expect(firstSegmentInput).toHaveValue(TEST_UPHILL_NAME)

    // 6. Fill metadata: title + ensure difficulty selected
    const titleInput = page.getByLabel(/코스 이름/).first()
    await titleInput.fill(TEST_COURSE_TITLE)

    // 7. Submit
    await page.getByRole('button', { name: /코스 업로드/ }).click()

    // 8. Expect redirect to /courses?focus=<id>
    await page.waitForURL(/\/courses\?focus=/, { timeout: 30_000 })
    const url = new URL(page.url())
    uploadedCourseId = url.searchParams.get('focus')
    expect(uploadedCourseId).toBeTruthy()

    // 9. Navigate to detail — expect uphill name rendered
    await page.goto(`/courses/${uploadedCourseId}`)
    await expect(page.getByText(TEST_UPHILL_NAME).first()).toBeVisible({
      timeout: 15_000,
    })

    // 10. Verify famous_uphills API reports the new uphill
    const res = await page.request.get('/api/famous-uphills')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const rows: Array<{ name?: string }> = Array.isArray(body)
      ? body
      : Array.isArray(body?.uphills)
        ? body.uphills
        : Array.isArray(body?.data)
          ? body.data
          : []
    const found = rows.some((row) => row?.name === TEST_UPHILL_NAME)
    expect(
      found,
      `famous_uphills should contain ${TEST_UPHILL_NAME}`,
    ).toBeTruthy()
  })
})
