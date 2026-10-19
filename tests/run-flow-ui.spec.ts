import { test, expect, type Page } from '@playwright/test';

async function finishWave(page: Page) {
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    for (const e of g.combat.enemies) e.active = false;
    for (const o of g.combat.orbs) o.active = false;
    const seconds = [65, 70, 75, 75, 80, 90];
    const elapsed = seconds.slice(0, g.run.waveIndex + 1).reduce((a, b) => a + b, 0) - .001;
    if(g.run.wave===6) {
      g.run.prepare(g.combat,g.position); const boss=g.combat.encounters.boss;
      boss.active=true; boss.spawnTime=0; g.combat.damageEnemy(boss,boss.hp,0,0); g.combat.encounters.beforeTick(1);
    }
    g.run.waveElapsed = g.run.definition.seconds - .001;
    g.run.combatElapsed = elapsed; g.elapsed = elapsed;
    g.step(1 / 60);
  });
}

test('complete six-wave UI with shopping, healing, refresh, victory, clean restart, defeat and legacy return', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/run-flow-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
  </script></body></html>` }));
  await page.goto('/run-flow-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window); await page.locator('#start-fusion').click();
  await expect(page.locator('#run-wave')).toContainText('第 1 / 6 波');
  for (let wave = 1; wave <= 5; wave++) {
    if (wave === 2) await page.evaluate(() => { (window as any).game.combat.hp = 40; });
    await finishWave(page);
    await expect(page.locator('#shop-screen')).toBeVisible();
    await expect(page.locator('#shop-heading')).toContainText(`第 ${wave} 波完成`);
    expect(await page.locator('.shop-item').count()).toBe(4);
    expect(await page.evaluate(() => {
      const g = (window as any).game, before = JSON.stringify([g.combat.inspect(), g.visualTime]);
      g.step(1); return JSON.stringify([g.combat.inspect(), g.visualTime]) === before;
    })).toBe(true);
    if (wave === 1) {
      await expect(page.locator('#shop-coins')).toHaveText('35 金币');
      await page.screenshot({ path: 'artifacts/v5.2-d-shop.png' });
      await page.locator('[data-buy="0"]').click();
      await expect(page.locator('[data-buy="0"]')).toHaveText('已购买');
      await expect(page.locator('#shop-coins')).toHaveText('0 金币');
      expect(await page.evaluate(() => (window as any).game.combat.runBuild.attacks.length)).toBe(2);
    }
    if (wave === 2) {
      await page.setViewportSize({ width: 568, height: 320 });
      await page.locator('[data-buy="3"]').click();
      await expect(page.locator('#shop-health')).toHaveText('生命 75 / 100');
      await page.locator('#shop-refresh').click();
      await expect(page.locator('#shop-refresh')).toHaveText('刷新商品 · 10 金币');
      const panel = await page.locator('.shop-panel').boundingBox();
      expect(panel!.x).toBeGreaterThanOrEqual(0); expect(panel!.y).toBeGreaterThanOrEqual(0);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(568);
      expect(panel!.y + panel!.height).toBeLessThanOrEqual(320);
      await page.screenshot({ path: 'artifacts/v5.2-d-shop-small.png' });
      await page.setViewportSize({ width: 844, height: 390 });
    }
    await page.evaluate(() => { (window as any).game.run.restElapsed = (window as any).game.run.wave * 20; });
    await page.locator('#shop-next').click();
    await expect(page.locator('#shop-screen')).toBeHidden();
    await expect(page.locator('#run-wave')).toContainText(`第 ${wave + 1} / 6 波`);
  }
  await finishWave(page);
  await expect(page.locator('#result-heading')).toHaveText('六波挑战，通关！');
  await expect(page.locator('#result-run')).toContainText('完成 6 波');
  await expect(page.locator('#result-weapons')).toContainText('火花弹');
  await expect(page.locator('#result-time')).toHaveText('09:15');
  await page.screenshot({ path: 'artifacts/v5.2-d-victory.png' });
  await page.locator('#gameover-restart').click();
  expect(await page.evaluate(() => {
    const g = (window as any).game; return { coins: g.run.coins, wave: g.run.wave, weapons: g.combat.runBuild.attacks.length, hp: g.combat.hp };
  })).toEqual({ coins: 0, wave: 1, weapons: 1, hp: 100 });
  await page.evaluate(() => { const g = (window as any).game; g.sleep(); g.combat.hp = 0; g.step(1 / 60); });
  await expect(page.locator('#result-message')).toContainText('生命耗尽，止步第 1 波');
  await page.locator('#gameover-menu').click(); await page.locator('#start-legacy-party').click();
  expect(await page.evaluate(() => {
    const g = (window as any).game; return { formal: !!g.run, members: g.party.members.length, spawning: g.combat.automaticSpawning };
  })).toEqual({ formal: false, members: 3, spawning: true });
  expect(errors).toEqual([]);
});
