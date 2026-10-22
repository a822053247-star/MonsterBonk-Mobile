import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 844, height: 390 } });

test.beforeEach(async ({ page }) => {
  await page.route('**/loading-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
    <div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game = new Game();</script></body></html>` }));
});

for (const [query, layout] of [['', 'random-pixel-meadow'], ['?world=fixed', 'fixed-pixel-meadow'], ['?world=legacy', 'legacy']] as const) {
  test(`default map ${query || 'without parameters'} remains selected after returning to the menu`, async ({ page }) => {
    await page.goto('/loading-harness' + query);
    await expect.poll(() => page.evaluate(() => (window as any).game.inspect().world.status)).toBe('ready');
    const selected = () => page.evaluate(() => (window as any).game.inspect().world.layout);
    expect(await selected()).toBe(layout);
    await page.locator('#start-fusion').click();
    await expect(page.locator('#world-loading')).toBeHidden();
    expect(await selected()).toBe(layout);
    await page.locator('#pause').click();
    await page.locator('#back-menu').click();
    expect(await selected()).toBe(layout);
  });
}

for (const mode of ['fusion', 'infinite'] as const) {
  test(`${mode} waits for its map without exposing the legacy world or advancing combat`, async ({ page }, info) => {
    let release!: () => void;
    const textures = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/assets/world/**', async route => { await textures; await route.continue(); });
    try {
      await page.goto('/loading-harness?world=fixed', { waitUntil: 'domcontentloaded' });
      await page.locator(`#start-${mode}`).click();
      const pending = await page.evaluate(async () => {
        const g = (window as any).game;
        for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame);
        return { status: g.inspect().world.status, elapsed: g.combat.elapsed,
          legacyVisible: g.world.group.children[0].visible };
      });
      expect(pending.status).toBe('loading');
      expect(pending.legacyVisible).toBe(false);
      expect(pending.elapsed).toBe(0);
      await expect(page.locator('#world-loading')).toBeVisible();
      // WebKit waits for pending image requests before taking a screenshot.
      if (info.project.name === 'chromium') await page.screenshot({ path: `artifacts/world-loading-${mode}-${info.project.name}.png` });
      release();
      await expect(page.locator('#world-loading')).toBeHidden();
      await expect.poll(() => page.evaluate(() => (window as any).game.inspect().world.layout))
        .toBe(mode === 'fusion' ? 'fixed-pixel-meadow' : 'infinite-pixel-meadow');
      await expect.poll(() => page.evaluate(() => (window as any).game.combat.elapsed)).toBeGreaterThan(0);
    } finally { release(); }
  });
}

test('leaving a loading run cancels the cover and asset failure retains the existing fallback', async ({ page }) => {
  let release!: () => void;
  const textures = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/world/**', async route => { await textures; await route.abort(); });
  try {
    await page.goto('/loading-harness?world=fixed', { waitUntil: 'domcontentloaded' });
    await page.locator('#start-fusion').click();
    await expect(page.locator('#world-loading')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-screen')).toBeVisible();
    await page.locator('#back-menu').click();
    await expect(page.locator('#world-loading')).toBeHidden();
    release();
    await expect.poll(() => page.evaluate(() => (window as any).game.inspect().world.status)).toBe('fallback');
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#start-fusion').click();
    await expect(page.locator('#world-loading')).toBeHidden();
    await expect.poll(() => page.evaluate(() => (window as any).game.combat.elapsed)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).game.world.group.children[0].visible)).toBe(true);
  } finally { release(); }
});
