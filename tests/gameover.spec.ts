import { test, expect } from '@playwright/test';
import type { Combat } from '../src/combat';
import type { Game } from '../src/game';

type Harness = { combat: Combat; inspect: Game['inspect'] };

test('lethal contact ends the real game loop and both restart routes clear combat', async ({ page }) => {
  // An isolated fixture uses the real Game/UI modules, with no testing hooks in the shipped app.
  await page.route('**/combat-harness', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
      import '/src/style.css';
      import { createUI } from '/src/ui.ts';
      import { Game } from '/src/game.ts';
      createUI(document.getElementById('app'));
      window.testGame = new Game();
    </script></body></html>`,
  }));
  await page.goto('/combat-harness');
  await page.waitForFunction(() => 'testGame' in window);
  await page.locator('#start').click();
  await page.evaluate(() => {
    const game = (window as unknown as { testGame: Harness }).testGame;
    game.combat.hp = 1;
    game.combat.spawn('tank', 0.6, 0, 0);
  });
  await expect(page.locator('#gameover-screen')).toBeVisible();
  await expect(page.locator('#health-value')).toHaveText('0 / 100');
  const ended = await page.evaluate(() => (window as unknown as { testGame: Harness }).testGame.inspect());
  expect(ended.mode).toBe('gameover');
  expect(ended.rendering).toBe(false);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as unknown as { testGame: Harness }).testGame.inspect())).toEqual(ended);
  // Compact phones with a home indicator must still expose the whole result card.
  await page.setViewportSize({ width: 568, height: 320 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-bottom', '21px');
    document.documentElement.style.setProperty('--safe-left', '44px');
    document.documentElement.style.setProperty('--safe-right', '44px');
  });
  const resultBox = (await page.locator('.result-card').boundingBox())!;
  expect(resultBox.y).toBeGreaterThanOrEqual(0);
  expect(resultBox.y + resultBox.height).toBeLessThanOrEqual(299);
  await page.screenshot({ path: `artifacts/gameover-small-${test.info().project.name}.png` });
  await page.locator('#gameover-restart').click();
  await expect(page.locator('#gameover-screen')).toBeHidden();
  const restarted = await page.evaluate(() => (window as unknown as { testGame: Harness }).testGame.inspect());
  expect(restarted.mode).toBe('playing');
  expect(restarted.combat).toMatchObject({ hp: 100, kills: 0, xp: 0, spawned: 0, enemies: [], projectiles: 0, orbs: [], effects: 0 });
  await expect(page.locator('#health-value')).toHaveText('100 / 100');
  await page.locator('#pause').click();
  await page.locator('#back-menu').click();
  await expect(page.locator('#menu')).toBeVisible();
  const menu = await page.evaluate(() => (window as unknown as { testGame: Harness }).testGame.inspect());
  expect(menu.combat.enemies).toEqual([]);
  expect(menu.combat.projectiles).toBe(0);
});
