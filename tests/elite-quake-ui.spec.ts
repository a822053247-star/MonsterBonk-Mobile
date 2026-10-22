import { test, expect } from '@playwright/test';

test('real quake preview can seek, pause, replay and reduce particles without shader errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|shader|WebGL/i.test(message.text())) errors.push(message.text()); });
  await page.setViewportSize({ width: 1200, height: 760 });
  await page.goto('/elite-quake-preview.html');
  await page.waitForFunction(() => (window as any).__eliteQuake?.inspect().ready);
  await page.locator('#mode-view').click();
  await page.locator('[data-time="1.05"]').click();
  await expect(page.locator('#phase')).toHaveText('蓄力预警');
  const warningPixels = await page.evaluate(() => (window as any).__eliteQuake.pixels());
  await page.screenshot({ path: 'artifacts/elite-quake-warning.png' });
  await page.locator('[data-time="1.44"]').click();
  await expect(page.locator('#phase')).toHaveText('落地冲击');
  expect(await page.evaluate(() => (window as any).__eliteQuake.pixels())).not.toBe(warningPixels);
  await page.screenshot({ path: 'artifacts/elite-quake-impact.png' });
  expect(await page.evaluate(() => (window as any).__eliteQuake.inspect().quake.rocks)).toBeGreaterThan(0);
  await page.selectOption('#detail', '2');
  expect(await page.evaluate(() => (window as any).__eliteQuake.inspect().quake.dust)).toBe(10);
  const frozen = await page.evaluate(() => (window as any).__eliteQuake.inspect().time);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).__eliteQuake.inspect().time)).toBe(frozen);
  await page.locator('[data-time="1.9"]').click();
  await expect(page.locator('#phase')).toHaveText('裂纹余波');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: 'artifacts/elite-quake-mobile.png' });
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
  await page.locator('#replay').click();
  await expect.poll(() => page.evaluate(() => (window as any).__eliteQuake.inspect().time)).toBeGreaterThan(.05);
  expect(errors).toEqual([]);
});

test('wave-four live combat triggers the same quake, freezes on pause and clears on restart', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/elite-live-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();</script></body></html>` }));
  await page.goto('/elite-live-harness?world=fixed');
  await page.locator('#start-fusion').click(); await expect(page.locator('#world-loading')).toBeHidden();
  const impact = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep();
    c.clearWave(); g.run.waveIndex = 3; g.run.waveElapsed = 12;
    c.obstacles = []; c.useNavigation = false;
    for (const attack of c.runBuild.attacks) attack.cooldown = 10000;
    g.run.prepare(c, g.position);
    const e = c.encounters.elite;
    Object.assign(e, { x: 3, z: 0, previousX: 3, previousZ: 0, spawnTime: 0 });
    c.encounters.elitePulsing = true; c.encounters.eliteTime = 1.29;
    c.update(.03, g.position);
    c.encounters.beforeTick(.14);
    g.placeCamera(true); g.partyView.render(1, 0); g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    return { event: { ...c.encounters.eliteQuake }, visual: g.combatView.inspect().encounters.quake, hp: c.hp };
  });
  expect(impact.event.active).toBe(true); expect(impact.hp).toBe(80);
  expect(impact.visual).toMatchObject({ visible: true, warning: false });
  await page.screenshot({ path: 'artifacts/elite-quake-live.png' });
  await page.locator('#pause').click();
  const frozen = await page.evaluate(() => (window as any).game.combat.encounters.eliteQuake.age);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).game.combat.encounters.eliteQuake.age)).toBe(frozen);
  await page.locator('#restart').click();
  expect(await page.evaluate(() => (window as any).game.combat.encounters.eliteQuake.active)).toBe(false);
});
