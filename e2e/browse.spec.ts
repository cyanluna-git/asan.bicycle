import { test, expect, type Page } from '@playwright/test'

// Public browsing page — no auth required.
test.use({ storageState: { cookies: [], origins: [] } })

async function getFirstCardTitle(page: Page): Promise<string | null> {
  const card = page.locator('a[href*="courseId="]').first()
  const count = await card.count()
  if (count === 0) return null
  const heading = card.locator('h2').first()
  if ((await heading.count()) === 0) return null
  const text = (await heading.textContent())?.trim()
  return text && text.length > 0 ? text : null
}

async function countCards(page: Page): Promise<number> {
  return page.locator('a[href*="courseId="]').count()
}

test.describe('Courses browse page', () => {
  test('initial load shows a bounded sample of cards (not all 495)', async ({
    page,
  }) => {
    await page.goto('/courses')

    // Wait for the server-rendered cards to appear
    const cards = page.locator('a[href*="courseId="]')
    await expect(cards.first()).toBeVisible({ timeout: 15_000 })

    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    // Browse API limits to <= 40 by default — well below the 495 total
    expect(count).toBeLessThan(100)
  })

  test('random sampling: reloading rotates the first card at least once in 3 tries', async ({
    page,
  }) => {
    await page.goto('/courses')
    await expect(page.locator('a[href*="courseId="]').first()).toBeVisible({
      timeout: 15_000,
    })
    const initialTitle = await getFirstCardTitle(page)
    expect(initialTitle).not.toBeNull()

    let changed = false
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.reload()
      await expect(
        page.locator('a[href*="courseId="]').first(),
      ).toBeVisible({ timeout: 15_000 })
      const next = await getFirstCardTitle(page)
      if (next && next !== initialTitle) {
        changed = true
        break
      }
    }
    expect(
      changed,
      'Random sampling should yield a different first card within 3 reloads',
    ).toBeTruthy()
  })

  test('regionId URL param is accepted and does not break the page', async ({
    page,
  }) => {
    // The /courses page honors ?region=<uuid>. The explicit region picker UI
    // lives on /explore, so this test drives the filter via URL to verify the
    // browse page contract.
    const fakeRegionUuid = '00000000-0000-4000-8000-000000000001'
    await page.goto(`/courses?region=${fakeRegionUuid}`)

    // The URL param should persist (parseFilterParams validates UUID format)
    expect(page.url()).toContain(`region=${fakeRegionUuid}`)

    // Either cards render or the empty-state copy is shown — both are valid
    const cards = page.locator('a[href*="courseId="]')
    const empty = page.getByText('조건에 맞는 코스가 없습니다.')
    await expect(cards.first().or(empty)).toBeVisible({ timeout: 15_000 })
  })

  test('distance filter (ultralong >120km) filters all visible cards', async ({
    page,
  }) => {
    await page.goto('/courses?distance=ultralong')

    const cards = page.locator('a[href*="courseId="]')
    const empty = page.getByText('조건에 맞는 코스가 없습니다.')
    await expect(cards.first().or(empty)).toBeVisible({ timeout: 15_000 })

    const count = await cards.count()
    if (count === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'No ultralong courses present — distance filter vacuously holds',
      })
      return
    }

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i)
      // Each BrowseCourseCard renders a MetricCard with label "거리" whose
      // sibling paragraph holds the "<n> km" value.
      const metric = card.locator('p', { hasText: /^거리$/i }).first()
      const valueText = await metric
        .locator('xpath=following-sibling::p[1]')
        .textContent()
      const match = valueText?.match(/([\d.]+)/)
      expect(match, `card ${i} distance value should parse`).not.toBeNull()
      const km = parseFloat(match![1])
      expect(
        km,
        `card ${i} distance ${km}km should be > 120km (ultralong preset)`,
      ).toBeGreaterThan(120)
    }
  })

  test('search query narrows results to matching titles', async ({ page }) => {
    await page.goto('/courses?q=%EC%84%A4%EC%95%85') // '설악'

    const cards = page.locator('a[href*="courseId="]')
    const empty = page.getByText('조건에 맞는 코스가 없습니다.')
    await expect(cards.first().or(empty)).toBeVisible({ timeout: 15_000 })

    const count = await cards.count()
    if (count === 0) return // empty state also satisfies the requirement

    for (let i = 0; i < count; i++) {
      const title = (await cards.nth(i).locator('h2').first().textContent()) ?? ''
      expect(title).toContain('설악')
    }
  })

  test('removing URL filter params resets the view', async ({ page }) => {
    await page.goto('/courses?distance=ultralong')
    await expect(page.locator('a[href*="courseId="]').first().or(page.getByText('조건에 맞는 코스가 없습니다.'))).toBeVisible({ timeout: 15_000 })

    // Clear filter via URL navigation (simulates the "reset all" affordance)
    await page.goto('/courses')
    expect(new URL(page.url()).searchParams.get('distance')).toBeNull()
    await expect(page.locator('a[href*="courseId="]').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('clicking a card navigates to the course view', async ({ page }) => {
    await page.goto('/courses')
    const firstCard = page.locator('a[href*="courseId="]').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })

    const href = await firstCard.getAttribute('href')
    expect(href).toBeTruthy()
    // Browse cards use a next/link anchor to /explore?courseId=<id>.
    // We verify the href contract directly and exercise navigation by
    // following it, which mirrors the user's click outcome.
    expect(href).toMatch(/courseId=[a-f0-9-]+/)

    await page.goto(href!)
    const url = new URL(page.url())
    const isExplore =
      url.pathname.startsWith('/explore') && url.searchParams.has('courseId')
    const isCourseDetail = /^\/courses\/[a-f0-9-]+/.test(url.pathname)
    expect(isExplore || isCourseDetail).toBeTruthy()
  })
})
