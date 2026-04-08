import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

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

/**
 * Resolve an editable course id for the signed-in test user.
 *
 * Strategy: visit /my-courses, look for the first "수정" link which carries
 * `/courses/<uuid>/edit` as its href. Returns null if the signed-in user
 * has no courses, in which case dependent tests skip themselves.
 */
async function findEditableCourseId(page: Page): Promise<string | null> {
  await page.goto('/my-courses')

  // Wait for either the card grid or the empty state copy to render.
  const anyEditLink = page.locator('a[href*="/edit"]').first()
  const emptyState = page.getByText('아직 등록한 코스가 없습니다.')

  await expect(anyEditLink.or(emptyState)).toBeVisible({ timeout: 15_000 })

  if ((await emptyState.count()) > 0 && (await emptyState.isVisible())) {
    return null
  }

  const href = await anyEditLink.getAttribute('href')
  if (!href) return null

  const match = href.match(/\/courses\/([a-f0-9-]+)\/edit/)
  return match?.[1] ?? null
}

test.describe('Course edit — owner permission and UI', () => {
  test.beforeAll(() => {
    if (!hasAuthState()) {
      test.skip(
        true,
        'playwright/.auth/user.json not populated — skipping course-edit flow. ' +
          'Create .env.test.local and run `pnpm exec playwright test --project=setup` first.',
      )
    }
  })

  test('owner can open the edit page and see expected controls', async ({
    page,
  }) => {
    const courseId = await findEditableCourseId(page)
    test.skip(
      courseId == null,
      'Test account has no owned courses — upload a fixture first (see upload.spec.ts).',
    )

    await page.goto(`/courses/${courseId}/edit`)

    // Main heading
    await expect(
      page.getByRole('heading', { name: '코스 수정' }),
    ).toBeVisible({ timeout: 15_000 })

    // Stat strip — verifies data loaded into the form
    await expect(page.getByText('거리', { exact: true })).toBeVisible()
    await expect(page.getByText('획득 고도', { exact: true })).toBeVisible()

    // Save button rendered by CourseMetadataForm (submitLabel="변경 저장")
    await expect(
      page.getByRole('button', { name: /변경 저장/ }),
    ).toBeVisible()

    // Title input (CourseMetadataForm uses a label containing "코스 이름")
    const titleInput = page.getByLabel(/코스 이름/).first()
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toBeEditable()
  })

  test('title edit persists to the course browse view (round-trip)', async ({
    page,
  }) => {
    const courseId = await findEditableCourseId(page)
    test.skip(
      courseId == null,
      'Test account has no owned courses — upload a fixture first (see upload.spec.ts).',
    )

    await page.goto(`/courses/${courseId}/edit`)
    await expect(
      page.getByRole('heading', { name: '코스 수정' }),
    ).toBeVisible({ timeout: 15_000 })

    const titleInput = page.getByLabel(/코스 이름/).first()
    const originalTitle = (await titleInput.inputValue())?.trim()
    test.skip(
      !originalTitle,
      'Could not read original course title; skipping round-trip test.',
    )

    const suffix = ` [e2e-${Date.now().toString(36)}]`
    const temporaryTitle = `${originalTitle}${suffix}`

    try {
      await titleInput.fill(temporaryTitle)
      await page.getByRole('button', { name: /변경 저장/ }).click()

      // Edit page redirects to /courses?focus=<id> on success.
      await page.waitForURL(/\/courses\?focus=/, { timeout: 30_000 })

      // The focused card should display the updated title.
      await expect(
        page.getByText(temporaryTitle, { exact: false }).first(),
      ).toBeVisible({ timeout: 15_000 })
    } finally {
      // Best-effort revert so the test run is self-cleaning.
      await page.goto(`/courses/${courseId}/edit`)
      await expect(
        page.getByRole('heading', { name: '코스 수정' }),
      ).toBeVisible({ timeout: 15_000 })
      const revertInput = page.getByLabel(/코스 이름/).first()
      if ((await revertInput.count()) > 0) {
        await revertInput.fill(originalTitle ?? '')
        const save = page.getByRole('button', { name: /변경 저장/ })
        if ((await save.count()) > 0 && (await save.isEnabled())) {
          await save.click().catch(() => {})
          await page
            .waitForURL(/\/courses\?focus=/, { timeout: 20_000 })
            .catch(() => {})
        }
      }
    }
  })

  test.skip(
    'non-owner sees 수정 권한이 없습니다 on /courses/<id>/edit — needs a second account',
    async () => {
      // Intentionally skipped: requires a second Supabase test account whose
      // auth state is distinct from playwright/.auth/user.json, plus a known
      // course owned by the primary account. Single-account CI fixture cannot
      // exercise the non-owner branch safely.
    },
  )

  test.skip(
    'POI add/delete round-trip — covered by explore-sidebar flow, not the edit page',
    async () => {
      // Intentionally skipped: the CourseEditPageClient surface does not host
      // the POI add panel directly — POI creation happens through the sidebar
      // flow on /explore (CoursePoiAddPanel) and requires Kakao Maps JS to
      // resolve map coordinates. That interaction is more appropriate for the
      // explore spec once a stable place-search fixture exists.
    },
  )
})
