import { test, expect } from '@playwright/test';

test('endless meadow starts while other regions are still downloading', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/scenery\/(ruins-props-atlas|snowfield-props-atlas|volcano\/volcano-atlas)\.png/, async route => {
    await held;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('#start-infinite').click();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#world-loading')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#timer')).not.toHaveText('00:00');
    expect(await page.evaluate(() => (window as any).__monsterbonk.inspect().world.layout)).toBe('infinite-pixel-meadow');
  } finally { release(); }
});

test('a stalled volcano atlas falls back and late art restores the selected map', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/scenery/volcano/volcano-atlas.png', async route => {
    await held;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('#endless-start-region').selectOption('volcano');
    await page.locator('#start-infinite').click();
    await expect(page.locator('#world-loading')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#timer')).not.toHaveText('00:00');
    const world = () => page.evaluate(() => (window as any).__monsterbonk.inspect().world);
    expect((await world()).layout).toBe('infinite-pixel-volcano');
    expect((await world()).status).toBe('fallback');
    release();
    await expect.poll(async () => (await world()).status).toBe('ready');
    await expect(page.locator('#world-loading')).toBeHidden();
  } finally { release(); }
});
