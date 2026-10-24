import { test, expect } from '@playwright/test';

test('wood thrust preview switches levels and displays the corresponding upgrade rules', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/wood-thrust-preview.html');

  await expect(page.getByRole('heading', { name: '灵木枝刺' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1级', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-stat="range"]')).toContainText('7.2');
  await expect(page.locator('[data-stat="pierce"]')).toContainText('3');

  await page.getByRole('button', { name: '3级', exact: true }).click();
  await expect(page.getByRole('button', { name: '3级', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-stat="range"]')).toContainText('8.2');
  await expect(page.locator('[data-stat="pierce"]')).toContainText('4');
  await expect(page.locator('#wood-level-detail')).toContainText('贯穿4个敌人');

  await page.getByRole('button', { name: '5级', exact: true }).click();
  await expect(page.locator('#wood-current-level')).toHaveText('5级');
  await expect(page.locator('#wood-level-detail')).toContainText('40%');
  await expect(page.locator('[data-stat="damage"]')).toContainText('37.4');
  expect(errors).toEqual([]);
});

test('wood thrust preview remains usable in a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/wood-thrust-preview.html');
  await expect(page.getByRole('button', { name: '5级', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '5级', exact: true }).click();
  await expect(page.locator('#wood-current-level')).toHaveText('5级');
  await expect(page.locator('#wood-canvas')).toBeVisible();
});
