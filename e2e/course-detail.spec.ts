import { test, expect, type Page } from '@playwright/test'

// 설악그란폰도 — known hard course with famous uphills and populated
// elevation/gradient profile. Chosen because it exercises the new gradient
// ("경사도") field introduced this sprint.
const SEORAK_COURSE_ID = 'a3c49cb0-c25d-4437-8b41-c167b800e00d'

test.use({ storageState: { cookies: [], origins: [] } })

async function hoverAcrossChart(page: Page): Promise<boolean> {
  const chart = page.locator('.recharts-wrapper').first()
  await expect(chart).toBeVisible({ timeout: 20_000 })
  const box = await chart.boundingBox()
  if (!box) return false

  // Sweep from the left third to the right third to reliably land on a
  // gradient-bearing point (recharts Tooltip activates on mouseMove).
  for (let step = 0; step <= 10; step++) {
    const x = box.x + box.width * (0.2 + step * 0.05)
    const y = box.y + box.height * 0.5
    await page.mouse.move(x, y, { steps: 5 })
    const tooltip = page.locator('.recharts-tooltip-wrapper').first()
    if ((await tooltip.count()) > 0) {
      const visible = await tooltip.isVisible().catch(() => false)
      const text = (await tooltip.textContent().catch(() => '')) ?? ''
      if (visible && text.includes('km') && text.includes('고도')) {
        return true
      }
    }
  }
  return false
}

test.describe('Course detail — elevation chart and uphill labels', () => {
  test('elevation chart renders and hover tooltip shows km/고도/경사도', async ({
    page,
  }) => {
    await page.goto(`/courses/${SEORAK_COURSE_ID}`)

    // Recharts SVG container should mount client-side
    const chart = page.locator('.recharts-wrapper').first()
    await expect(chart).toBeVisible({ timeout: 20_000 })
    await expect(chart.locator('svg').first()).toBeVisible()

    const gotTooltip = await hoverAcrossChart(page)
    expect(gotTooltip, 'tooltip should appear on chart mousemove').toBeTruthy()

    const tooltip = page.locator('.recharts-tooltip-wrapper').first()
    const tooltipText = (await tooltip.textContent()) ?? ''

    expect(tooltipText).toContain('km')
    expect(tooltipText).toContain('고도:')
    // New sprint feature: gradient readout
    expect(tooltipText).toContain('경사도:')
    expect(tooltipText).toMatch(/%/)
  })

  test('famous uphill peak labels render on the chart', async ({ page }) => {
    await page.goto(`/courses/${SEORAK_COURSE_ID}`)
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible({
      timeout: 20_000,
    })

    // Uphill labels are rendered as <text> children of the recharts SVG with
    // red fill (see ElevationChart#UphillPeakLabel). Any non-empty text node
    // inside the reference-line label group satisfies the requirement.
    const labels = page.locator('.recharts-wrapper svg text[fill="#ef4444"]')
    await expect(labels.first()).toBeVisible({ timeout: 15_000 })

    const labelTexts = await labels.allTextContents()
    const nonEmpty = labelTexts
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    expect(
      nonEmpty.length,
      'at least one famous uphill peak label must render',
    ).toBeGreaterThan(0)
  })

  test('SlopeLegend is not rendered over the map on the detail view', async ({
    page,
  }) => {
    await page.goto(`/courses/${SEORAK_COURSE_ID}`)
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible({
      timeout: 20_000,
    })

    // The previous SlopeLegend overlay (map-based gradient key) has been
    // removed in favor of chart-side gradient. Use the aria-label we would
    // expect ("경사도 범례") as well as a textual guard.
    const legendByLabel = page.getByRole('group', { name: '경사도 범례' })
    await expect(legendByLabel).toHaveCount(0)

    // Also check that no standalone "경사도 범례" legend container exists in
    // the DOM (guards against renamed wrappers).
    const legendByText = page.locator('[class*="SlopeLegend"], [data-slot="slope-legend"]')
    await expect(legendByText).toHaveCount(0)
  })
})
