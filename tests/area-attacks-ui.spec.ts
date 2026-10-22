import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('large attacks render from simulation, lower decoration only in battery mode, and clear', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('**/area-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game = new Game();
    </script></body></html>` }));
  await page.goto('/area-harness?world=fixed');
  await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    document.getElementById('welcome')!.hidden = true;
    const c = g.combat; c.reset(); c.automaticSpawning = false;
    for (const a of c.runBuild.attacks) a.cooldown = 10000;
    g.placeCamera(true); c.attackViewport = { ...c.spawnViewport };
    for (let i = 0; i < 60; i++) {
      const angle = i * 2.399963, r = 3 + i % 9;
      c.spawn(i % 5 === 0 ? 'tank' : 'normal', g.position.x + Math.sin(angle) * r, g.position.z + Math.cos(angle) * r, 0);
    }
    c.areaAttacks.castNova(); c.areaAttacks.update(.3, 0, 1);
    g.updateHUD(); g.partyView.render(1, g.visualTime); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
  });
  await page.screenshot({ path: 'artifacts/screen-nova-warning.png' });
  const result = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.areaAttacks.update(.24, 0, 1);
    const before = JSON.stringify(c.areaAttacks.inspect());
    g.combatView.detail = 4;
    g.combatView.render(1, g.visualTime, g.position);
    const full = g.combatView.inspect().nova;
    g.combatView.detail = 2; g.combatView.render(1, g.visualTime, g.position);
    const low = g.combatView.inspect().nova;
    g.combatView.detail = 4; g.combatView.render(1, g.visualTime, g.position); g.updateHUD(); g.renderer.render(g.scene, g.camera);
    return { full, low, unchanged: before === JSON.stringify(c.areaAttacks.inspect()), kills: c.kills };
  });
  expect(result.full.active).toBe(1); expect(result.full.shards).toBe(32);
  expect(result.low.shards).toBe(8); expect(result.unchanged).toBe(true); expect(result.kills).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/screen-nova-burst.png' });
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.clearTransientEffects(); c.areaAttacks.castBarrage('ring', 24, 1);
    c.areaAttacks.castBarrage('cross', 24, 1); c.areaAttacks.castBarrage('fan', 24, 1);
    c.areaAttacks.update(.23, 0, 1);
    g.updateHUD(); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
  });
  const barrage = await page.evaluate(() => (window as any).game.combatView.inspect().barrage);
  expect(barrage.cores).toBeGreaterThan(24); expect(barrage.cores).toBeLessThanOrEqual(96);
  await page.screenshot({ path: 'artifacts/screen-barrage-patterns.png' });
  const metrics = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.reset(); c.automaticSpawning = false;
    for (let i = 0; i < 256; i++) {
      const e = c.spawn('tank', 25 + i % 8 * .1, 25 + Math.floor(i / 8) * .1, 0); if (e) e.hp = 1e6;
    }
    for (let i = 0; i < 4; i++) c.areaAttacks.castBarrage('ring', 24, 1);
    c.areaAttacks.update(.01, 0, 1);
    const memoryBefore = { ...g.renderer.info.memory }, times: number[] = [];
    // Full 96-lane / 256-enemy broad-phase load; use simulation only for CPU timings.
    for (let i = 0; i < 50; i++) {
      const start = performance.now(); c.areaAttacks.update(1 / 60, 0, 1); times.push(performance.now() - start);
    }
    g.combatView.detail = 4; g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
    const high = g.combatView.inspect().barrage, fullCalls = g.renderer.info.render.calls;
    const combatBefore = JSON.stringify(c.inspect());
    g.combatView.detail = 2; g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
    const low = g.combatView.inspect().barrage;
    const unchanged = combatBefore === JSON.stringify(c.inspect());
    const memoryAfter = { ...g.renderer.info.memory };
    g.pause('测试暂停'); const paused = JSON.stringify(c.areaAttacks.inspect());
    g.frame(1000); g.sleep(); const freeze = paused === JSON.stringify(c.areaAttacks.inspect());
    c.clearTransientEffects(); g.combatView.clear();
    return { high, low, unchanged, freeze, memoryBefore, memoryAfter, fullCalls,
      cpuAverageMs: times.reduce((n, t) => n + t, 0) / times.length, cpuMaxMs: Math.max(...times),
      cleared: g.combatView.inspect().barrage.cores === 0 && c.areaAttacks.inspect().reservedLanes === 0 };
  });
  expect(metrics.high.cores).toBe(96); expect(metrics.low.cores).toBe(96); expect(metrics.low.trails).toBe(0);
  expect(metrics.unchanged).toBe(true); expect(metrics.freeze).toBe(true); expect(metrics.cleared).toBe(true);
  expect(metrics.memoryAfter).toEqual(metrics.memoryBefore);
  const saturated = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.reset(); c.automaticSpawning = false; g.placeCamera(true); c.attackViewport = { ...c.spawnViewport };
    const target = c.spawn('tank', c.attackViewport.x, c.attackViewport.z, 0); target.hp = 1000;
    c.areaAttacks.castNova(50); c.areaAttacks.castNova(50); c.areaAttacks.update(.5, 0, 1);
    g.combatView.render(1, g.visualTime, g.position);
    const result = { hp: target.hp, visuals: g.combatView.inspect().nova.active, casts: c.areaAttacks.inspect().novas.length };
    c.clearTransientEffects(); g.combatView.clear(); return result;
  });
  expect(saturated).toEqual({ hp: 900, visuals: 1, casts: 2 });
  await test.info().attach('large-attack-pressure', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  writeFileSync(`artifacts/large-attack-pressure-${test.info().project.name}.json`, JSON.stringify(metrics, null, 2));
  expect(await page.evaluate(() => {
    const g = (window as any).game; g.combat.clearTransientEffects(); g.combatView.clear();
    return g.combatView.inspect().nova.active;
  })).toBe(0);
  expect(errors).toEqual([]);
});
