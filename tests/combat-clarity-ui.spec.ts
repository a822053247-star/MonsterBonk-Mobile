import { test, expect } from '@playwright/test';

test('fully fused three-weapon build stays readable with CD indicators and pooled impact visuals', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/clarity-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';import {readableEffects} from '/src/combat-clarity.ts';
    createUI(document.getElementById('app'));window.game=new Game();window.readableEffects=readableEffects;
  </script></body></html>` }));
  await page.goto('/clarity-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window); await page.locator('#start-fusion').click();
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).game; return g.combatView.firePixels?.loaded && g.combatView.fusionPixels?.loaded;
  })).toBe(true);
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep(); const c = g.combat;
    c.reset(); c.automaticSpawning = false; c.obstacles = [];
    for (const id of ['bubble-weapon', 'leaf-weapon', 'split-on-hit', 'area', 'chain', 'multishot', 'multishot', 'multishot', 'haste', 'haste', 'haste', 'haste', 'haste', 'overload-core', 'shattered-core', 'hunter-eye']) if (!c.grantUpgrade(id)) throw new Error('Invalid reward: ' + id);
    for (const [x, z] of [[6, 0], [7, 1.4], [8, -1.4], [9, 0]]) c.spawn('tank', x, z, 0).hp = 10000;
    g.welcome.style.display = 'none';
  });
  for (const [index, steps] of [48, 84].entries()) {
    const state = await page.evaluate(steps => {
      const g = (window as any).game, c = g.combat;
      for (let i = 0; i < steps; i++) c.update(1 / 60, g.position);
      g.visualTime = c.elapsed; g.updateHUD(); g.placeCamera(true);
      const before = JSON.stringify(c.inspect());
      g.partyView.render(1, g.visualTime); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
      const selected = (window as any).readableEffects(c.effects).filter((e: any) => ['burst', 'water', 'thorn', 'hit'].includes(e.kind));
      let largest = 0;
      for (const view of [g.combatView.firePixels, g.combatView.fusionPixels]) {
        const a = view.mesh.instanceMatrix.array;
        for (let i = 0; i < view.mesh.count; i++) largest = Math.max(largest, Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]));
      }
      return { unchanged: before === JSON.stringify(c.inspect()), impacts: selected.length, largest,
        noDepthWrite: !g.combatView.firePixels.mesh.material.depthWrite,
        maxHurt: Math.max(0, ...[...g.combatView.pixelEnemies.batches.values()].flatMap((batch: any) => [...batch.hurt.array].slice(0, batch.mesh.count))),
        shots: c.runBuild.attacks.map((a: any) => a.shotsFired), limits: c.projectiles.length };
    }, steps);
    expect(state.unchanged).toBe(true); expect(state.impacts).toBeLessThanOrEqual(6);
    expect(state.largest).toBeLessThanOrEqual(1.551); expect(state.noDepthWrite).toBe(true); expect(state.maxHurt).toBeLessThanOrEqual(.301); expect(state.limits).toBe(24);
    if (index === 1) expect(state.shots.every((count: number) => count > 0)).toBe(true);
    await expect(page.locator('.weapon-charge')).toHaveCount(3);
    await page.screenshot({ path: `artifacts/combat-clarity-${index === 0 ? 'volleys' : 'impacts'}.png` });
  }
  await page.locator('#pause').click();
  expect(await page.evaluate(() => { const g = (window as any).game, before = JSON.stringify(g.combat.inspect()); g.step(1); return before === JSON.stringify(g.combat.inspect()); })).toBe(true);
  expect(errors).toEqual([]);
});
