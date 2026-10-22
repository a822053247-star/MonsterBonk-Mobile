import { test, expect } from '@playwright/test';

test('treasure capture visibly grants a free real shop refresh, then normal prices resume', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.route('**/special-growth-ui-harness*', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
      import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
      createUI(document.getElementById('app'));window.game=new Game();
    </script></body></html>`,
  }));
  await page.goto('/special-growth-ui-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-fusion').click();
  await expect.poll(() => page.evaluate(() => (window as any).game.inspect().mode)).toBe('playing');
  await page.evaluate(() => {
    const g = (window as any).game;
    g.sleep();
    g.run.waveIndex = 4;
    g.run.prepare(g.combat, g.position);
    const runner = g.combat.spawn('draft-treasure-runner', g.position.x + 5, g.position.z, 0);
    g.combat.damageEnemy(runner, 100000, 0, 0);
    for (const orb of g.combat.orbs) if (orb.active) {
      g.combat.progression.gainExperience(orb.value);
      orb.active = false;
    }
    while (g.combat.progression.awaitingChoice) {
      g.combat.chooseUpgrade(g.combat.progression.offers[0]);
    }
    g.run.waveElapsed = g.run.definition.seconds - .001;
    g.step(1 / 60);
    g.run.updateRest(3.5, g.combat);
    g.syncRunPhase();
  });
  await expect(page.locator('#shop-screen')).toBeVisible();
  await expect(page.locator('#shop-message')).toContainText('携宝兽奖励免费刷新');
  await expect(page.locator('#shop-refresh')).toContainText('携宝兽奖励 · 免费刷新 1 次');
  await expect(page.locator('#shop-refresh')).toBeEnabled();
  const before = await page.locator('#shop-coins').textContent();
  await page.locator('#shop-refresh').click();
  await expect(page.locator('#shop-refresh')).toContainText('刷新商品 · 5 金币');
  await expect(page.locator('#shop-coins')).toHaveText(before!);
  await expect(page.locator('#shop-message')).toContainText('免费刷新成功');
  await page.locator('#shop-refresh').click();
  await expect(page.locator('#shop-refresh')).toContainText('刷新商品 · 10 金币');
  const after = await page.evaluate(() => (window as any).game.run.coins);
  expect(after).toBe(Number(before!.replace(/[^\d]/g, '')) - 5);
});
