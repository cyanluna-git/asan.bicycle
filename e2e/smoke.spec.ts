import { test, expect } from '@playwright/test';

test('smoke: app responds at baseURL', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'navigation response should not be null').not.toBeNull();
  expect(response!.status(), 'baseURL should respond with HTTP 200').toBeLessThan(400);
});
