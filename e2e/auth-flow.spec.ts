import { test, expect } from '@playwright/test'
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

// ------------------------------------------------------------------
// Group 1 — truly anonymous: clears storageState to override project
// default that points at playwright/.auth/user.json.
// ------------------------------------------------------------------
test.describe('Auth flow — unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('/upload shows login prompt, hides upload UI', async ({ page }) => {
    await page.goto('/upload')

    await expect(
      page.getByRole('heading', { name: '로그인이 필요합니다' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Google로 로그인/ }),
    ).toBeVisible()

    // The GPX dropzone copy must NOT be present for anonymous visitors.
    await expect(
      page.getByText('GPX 파일을 드래그하거나 클릭하여 선택'),
    ).toHaveCount(0)
  })

  test('/my-courses shows login prompt or redirects away', async ({ page }) => {
    const response = await page.goto('/my-courses')
    expect(response, 'navigation response should not be null').not.toBeNull()
    expect(response!.status()).toBeLessThan(500)

    const finalUrl = new URL(page.url())
    const stillOnMyCourses = finalUrl.pathname.startsWith('/my-courses')

    if (stillOnMyCourses) {
      // Page rendered its own unauthenticated prompt (see
      // MyCoursesPageClient): "내가 등록한 코스를 보거나 수정하려면 로그인이 필요합니다."
      await expect(
        page.getByRole('heading', { name: '내 코스' }),
      ).toBeVisible({ timeout: 15_000 })
      const loginButton = page.getByRole('button', { name: /Google로 로그인/ })
      await expect(loginButton).toBeVisible()
    } else {
      // Redirected away — acceptable (e.g. to /courses). Just assert the new
      // pathname is a known public area.
      expect(finalUrl.pathname).toMatch(/^\/(courses|$)/)
    }
  })
})

// ------------------------------------------------------------------
// Group 2 — authenticated. Relies on playwright/.auth/user.json being
// populated by auth.setup.ts. Skips the whole block when missing.
// ------------------------------------------------------------------
test.describe('Auth flow — authenticated redirects', () => {
  test.beforeAll(() => {
    if (!hasAuthState()) {
      test.skip(
        true,
        'playwright/.auth/user.json not populated — skipping auth-dependent redirect checks. ' +
          'Populate .env.test.local and run `pnpm exec playwright test --project=setup` first.',
      )
    }
  })

  test('post-login domain is the baseURL origin (not a prod vercel host)', async ({
    page,
    baseURL,
  }) => {
    // The auth setup wrote localStorage for the baseURL origin. Navigating to
    // "/" should keep us on that origin, not bounce to a production host.
    await page.goto('/')
    const currentOrigin = new URL(page.url()).origin
    const expectedOrigin = new URL(baseURL ?? 'http://localhost:3102').origin
    expect(currentOrigin).toBe(expectedOrigin)
    expect(currentOrigin).not.toMatch(/vercel\.app$/)
  })

  test('logged-in /upload renders the GPX dropzone', async ({ page }) => {
    await page.goto('/upload')

    await expect(
      page.getByText('GPX 파일을 드래그하거나 클릭하여 선택'),
    ).toBeVisible({ timeout: 15_000 })

    // And no login prompt.
    await expect(
      page.getByRole('heading', { name: '로그인이 필요합니다' }),
    ).toHaveCount(0)
  })

  test('existing user visiting /auth/callback lands on /courses (may carry region params)', async ({
    page,
  }) => {
    await page.goto('/auth/callback')

    // Give the client-side onAuthStateChange resolver a moment to route us
    // to the post-login destination. All acceptable destinations live under
    // /courses (with optional ?region=... or ?setup-region=1).
    await page.waitForURL((url) => url.pathname.startsWith('/courses'), {
      timeout: 15_000,
    })

    const url = new URL(page.url())
    expect(url.pathname).toMatch(/^\/courses/)
  })

  test.skip(
    'new user (home_region_id null) sees setup-region modal signal — requires dedicated second account',
    async ({ page }) => {
      // Intentionally skipped: verifying the "new user" branch requires a
      // second Supabase test account whose user_profiles.home_region_id is
      // reset to null before the test, plus SUPABASE_SERVICE_ROLE_KEY to do
      // the reset. Our shared single-account fixture cannot model this safely
      // without leaking state across runs, so we document the case and skip.
      await page.goto('/auth/callback')
    },
  )
})
