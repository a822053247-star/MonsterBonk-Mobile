import { test, expect } from '@playwright/test';

test('browser renders first-wave groups and the dense fifth wave, and pause/restart freeze and clear them', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/swarm-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game = new Game();
    window.arrange = wave => {
      const g=window.game; g.sleep(); g.combat.clearWave(); g.run.waveIndex=wave-1; g.run.waveElapsed=0;
      g.position.set(0,0,0); g.combat.invulnerability=10000;
      document.getElementById('welcome').hidden=true;
      for(const a of g.combat.runBuild.attacks) a.cooldown=10000;
      for(let i=0;i<(wave===1?135:60*16);i++) g.step(1/60);
      g.sleep();
      g.monster.root.position.copy(g.position); g.partyView.render(1,g.visualTime); g.placeCamera(true);
      g.combatView.render(1,g.visualTime,g.position); g.updateHUD(); g.renderer.render(g.scene,g.camera);
      return {active:g.combat.enemies.filter(e=>e.active).length, spawned:g.combat.spawned, visual:g.combatView.inspect()};
    };
  </script></body></html>` }));
  await page.goto('/swarm-harness?world=fixed'); await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-fusion').click(); await page.evaluate(() => (window as any).game.sleep());
  await expect.poll(() => page.evaluate(() => (window as any).game.combatView.inspect().batches.filter((b: any) => b.loaded).length)).toBe(6);
  const first = await page.evaluate(() => (window as any).arrange(1));
  expect(first.active).toBeGreaterThanOrEqual(6); expect(first.active).toBeLessThanOrEqual(60);
  if (browserName === 'chromium') await page.screenshot({ path: 'artifacts/v6-1-a-wave-1.png' });
  const fifth = await page.evaluate(() => (window as any).arrange(5));
  expect(fifth.active).toBeGreaterThanOrEqual(60); expect(fifth.active).toBeLessThanOrEqual(200);
  expect(fifth.visual.batches.reduce((s: number, b: any) => s+b.count, 0)).toBeGreaterThan(0);
  if (browserName === 'chromium') await page.screenshot({ path: 'artifacts/v6-1-a-wave-5.png' });
  await page.locator('#pause').click();
  const freeze = () => page.evaluate(() => JSON.stringify([(window as any).game.combat.inspect(), (window as any).game.run.inspect()]));
  const before = await freeze();
  await page.evaluate(() => { for (let i=0;i<120;i++) (window as any).game.step(1/60); });
  expect(await freeze()).toBe(before);
  await page.locator('#restart').click(); await page.evaluate(() => (window as any).game.sleep());
  expect(await page.evaluate(() => (window as any).game.run.wave)).toBe(1);
  expect(await page.evaluate(() => (window as any).game.combat.spawned)).toBe(0);
  expect(errors).toEqual([]);
});
