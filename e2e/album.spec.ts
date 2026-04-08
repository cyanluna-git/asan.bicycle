import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

/**
 * E2E: Course album photo upload with EXIF GPS, caption, delete, and per-user limit.
 *
 * Fixture JPEGs live under e2e/fixtures/:
 *   - test-photo-with-gps.jpg : 8x8 JPEG with GPS EXIF (Seorak-ish coords)
 *   - test-photo-no-gps.jpg   : 8x8 JPEG without GPS EXIF
 *
 * Auth-dependent blocks skip gracefully when playwright/.auth/user.json is missing,
 * mirroring the pattern from e2e/upload.spec.ts.
 */

// 설악그란폰도 — same known course used in course-detail.spec.ts
const SEORAK_COURSE_ID = 'a3c49cb0-c25d-4437-8b41-c167b800e00d'

const FIXTURE_PHOTO_WITH_GPS = path.join(
  process.cwd(),
  'e2e/fixtures/test-photo-with-gps.jpg',
)
const FIXTURE_PHOTO_NO_GPS = path.join(
  process.cwd(),
  'e2e/fixtures/test-photo-no-gps.jpg',
)

const AUTH_STATE = path.join(process.cwd(), 'playwright/.auth/user.json')

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

async function getAccessTokenFromPage(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    // The app exports a singleton supabase client on window is not guaranteed.
    // Read the auth token directly from localStorage, which is how
    // @supabase/auth-helpers persists sessions for the browser client.
    const entries = Object.keys(window.localStorage)
    const tokenKey = entries.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!tokenKey) return null
    try {
      const raw = window.localStorage.getItem(tokenKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { access_token?: string }
      return parsed.access_token ?? null
    } catch {
      return null
    }
  })
}

async function deletePhotoViaApi(
  page: Page,
  courseId: string,
  photoId: string,
  accessToken: string,
): Promise<void> {
  await page.request.delete(`/api/courses/${courseId}/album`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    data: { photoId },
  })
}

async function cleanupPhotosViaServiceRole(photoIds: string[]): Promise<void> {
  if (photoIds.length === 0) return
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return
  }
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Fetch storage paths before deleting rows so we can cascade the cleanup.
    const selectResponse = await admin
      .from('course_album_photos')
      .select('id, storage_path')
      .in('id', photoIds)
    const rows = (selectResponse.data ?? []) as Array<{
      id: string
      storage_path: string | null
    }>
    const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p)
    await admin.from('course_album_photos').delete().in('id', photoIds)
    if (paths.length > 0) {
      await admin.storage.from('course-album-photos').remove(paths)
    }
  } catch (error) {
    console.warn(
      '[album.spec cleanup] service-role cleanup failed:',
      error instanceof Error ? error.message : error,
    )
  }
}

async function openAlbumTab(page: Page): Promise<void> {
  await page.goto(`/courses/${SEORAK_COURSE_ID}`)
  // The course detail panel renders a tab labeled "사진 <N>".
  const albumTab = page.getByRole('button', { name: /^사진\s*\d/ }).first()
  await albumTab.waitFor({ state: 'visible', timeout: 20_000 })
  await albumTab.click()
}

test.describe('Course album — unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('album tab shows login prompt without upload form', async ({ page }) => {
    await openAlbumTab(page)

    // Anonymous users see the login CTA inside the album tab, not the upload form.
    await expect(
      page.getByText('라이딩 사진을 올리려면 로그인이 필요합니다.'),
    ).toBeVisible({ timeout: 10_000 })

    // Upload form submit button should NOT be rendered for anonymous users.
    await expect(
      page.getByRole('button', { name: /^앨범 사진 업로드$/ }),
    ).toHaveCount(0)
  })
})

test.describe('Course album — authenticated flow', () => {
  const uploadedPhotoIds: string[] = []

  test.beforeAll(() => {
    if (!hasAuthState()) {
      test.skip(
        true,
        'playwright/.auth/user.json not found — skipping auth-dependent album flow. ' +
          'Create .env.test.local and run `pnpm exec playwright test --project=setup` first.',
      )
    }

    if (!fs.existsSync(FIXTURE_PHOTO_WITH_GPS) || !fs.existsSync(FIXTURE_PHOTO_NO_GPS)) {
      throw new Error(
        `Missing album fixtures. Expected:\n  ${FIXTURE_PHOTO_WITH_GPS}\n  ${FIXTURE_PHOTO_NO_GPS}`,
      )
    }
  })

  test.afterEach(async ({ page }) => {
    if (uploadedPhotoIds.length === 0) return

    const accessToken = await getAccessTokenFromPage(page).catch(() => null)
    if (accessToken) {
      for (const photoId of uploadedPhotoIds) {
        await deletePhotoViaApi(page, SEORAK_COURSE_ID, photoId, accessToken).catch(() => {})
      }
    }

    // Always attempt a service-role cleanup as a safety net (best effort).
    await cleanupPhotosViaServiceRole([...uploadedPhotoIds])

    uploadedPhotoIds.length = 0
  })

  test('upload with GPS EXIF → gallery renders, caption persists, API reports lat/lng', async ({
    page,
  }) => {
    await openAlbumTab(page)

    // Upload form is rendered inline for authenticated users.
    const fileInput = page.locator('input[type="file"][accept^="image/"]').first()
    await fileInput.setInputFiles(FIXTURE_PHOTO_WITH_GPS)

    const captionText = '설악 업힐 정상 컷 — E2E 테스트'
    const captionTextarea = page.locator('textarea[id^="course-album-caption-"]').first()
    await captionTextarea.fill(captionText)
    await expect(captionTextarea).toHaveValue(captionText)

    await page.getByRole('button', { name: /^앨범 사진 업로드$/ }).click()

    // Success banner from CourseAlbumUploadForm.
    await expect(
      page.getByText('앨범 사진이 업로드되었습니다.'),
    ).toBeVisible({ timeout: 30_000 })

    // Verify end-to-end via the public album API — newest photo must carry
    // non-null lat/lng extracted from EXIF, and the caption we just submitted.
    const apiResponse = await page.request.get(
      `/api/courses/${SEORAK_COURSE_ID}/album?limit=4`,
    )
    expect(apiResponse.ok()).toBeTruthy()
    const apiJson = (await apiResponse.json()) as {
      photos: Array<{
        id: string
        caption: string | null
        lat: number | null
        lng: number | null
      }>
    }
    expect(Array.isArray(apiJson.photos)).toBe(true)
    const justUploaded = apiJson.photos.find((p) => p.caption === captionText)
    expect(
      justUploaded,
      'newest upload should be reachable via album GET',
    ).toBeDefined()
    expect(typeof justUploaded!.lat).toBe('number')
    expect(typeof justUploaded!.lng).toBe('number')
    uploadedPhotoIds.push(justUploaded!.id)

    // Open the full album surface (sheet) to confirm gallery rendering + caption text.
    await page.getByRole('button', { name: /^앨범 보기$/ }).click()
    await expect(page.getByText(captionText).first()).toBeVisible({ timeout: 10_000 })
  })

  test('upload without GPS EXIF is rejected with Korean error message', async ({
    page,
  }) => {
    await openAlbumTab(page)

    const fileInput = page.locator('input[type="file"][accept^="image/"]').first()
    await fileInput.setInputFiles(FIXTURE_PHOTO_NO_GPS)

    await page.getByRole('button', { name: /^앨범 사진 업로드$/ }).click()

    await expect(
      page.getByText('GPS 위치 메타데이터가 있는 사진만 업로드할 수 있습니다.'),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('caption textarea enforces maxLength=180', async ({ page }) => {
    await openAlbumTab(page)

    const captionTextarea = page.locator('textarea[id^="course-album-caption-"]').first()
    await expect(captionTextarea).toHaveAttribute('maxLength', '180')

    // Typing > 180 chars must be clipped by the DOM attribute.
    const oversized = 'ㄱ'.repeat(185)
    await captionTextarea.fill(oversized)
    const stored = await captionTextarea.inputValue()
    expect(stored.length).toBeLessThanOrEqual(180)
    expect(stored.length).toBe(180)
  })

  test('delete button removes photo from album gallery', async ({ page }) => {
    await openAlbumTab(page)

    // Upload a fresh photo via the UI so ownership matches the test user.
    const fileInput = page.locator('input[type="file"][accept^="image/"]').first()
    await fileInput.setInputFiles(FIXTURE_PHOTO_WITH_GPS)
    const caption = `삭제 테스트 ${Date.now()}`
    const captionTextarea = page.locator('textarea[id^="course-album-caption-"]').first()
    await captionTextarea.fill(caption)
    await page.getByRole('button', { name: /^앨범 사진 업로드$/ }).click()
    await expect(
      page.getByText('앨범 사진이 업로드되었습니다.'),
    ).toBeVisible({ timeout: 30_000 })

    // Look up the new photo via API to obtain its id for cleanup bookkeeping.
    const apiResponse = await page.request.get(
      `/api/courses/${SEORAK_COURSE_ID}/album?limit=4`,
    )
    const apiJson = (await apiResponse.json()) as {
      photos: Array<{ id: string; caption: string | null }>
    }
    const target = apiJson.photos.find((p) => p.caption === caption)
    expect(target, 'uploaded photo must appear via album GET').toBeDefined()
    uploadedPhotoIds.push(target!.id)

    // Open full album surface and click the delete button for the matching card.
    await page.getByRole('button', { name: /^앨범 보기$/ }).click()
    const captionLocator = page.getByText(caption).first()
    await expect(captionLocator).toBeVisible({ timeout: 10_000 })

    const deleteButton = page.getByRole('button', { name: '앨범 사진 삭제' }).first()
    await expect(deleteButton).toBeVisible({ timeout: 5_000 })
    await deleteButton.click()

    // Caption text for that photo should disappear from the gallery.
    await expect(page.getByText(caption)).toHaveCount(0, { timeout: 10_000 })

    // Since we deleted through UI, drop from the cleanup list to avoid a 404.
    const idx = uploadedPhotoIds.indexOf(target!.id)
    if (idx >= 0) uploadedPhotoIds.splice(idx, 1)
  })

  test('per-user photo quota error surfaces in the UI (mocked API)', async ({
    page,
  }) => {
    // Intercept the album POST so we don't need to upload 30 real files to CI
    // storage. The UI must render the server-side quota message.
    const quotaMessage = '코스당 업로드 가능한 사진은 최대 30장입니다.'
    await page.route('**/api/courses/*/album', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: quotaMessage }),
        })
        return
      }
      await route.continue()
    })

    await openAlbumTab(page)

    const fileInput = page.locator('input[type="file"][accept^="image/"]').first()
    await fileInput.setInputFiles(FIXTURE_PHOTO_WITH_GPS)
    await page.getByRole('button', { name: /^앨범 사진 업로드$/ }).click()

    await expect(page.getByText(quotaMessage)).toBeVisible({ timeout: 15_000 })
  })
})
