import { test, expect } from '@playwright/test';

test('natural water and ice attacks show supplied overhead crystals, freeze shells and thaw cleanly', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/frost-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();</script></body></html>` }));
  await page.goto('/frost-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep(); g.wake = () => {};
    c.reset(); c.automaticSpawning = false; c.obstacles = []; c.invulnerability = 10000;
    g.position.set(0, 0, 0); g.previousPosition.copy(g.position); g.party.syncLeader(g.position, 0);
    c.grantUpgrade('bubble-weapon'); for (let i = 0; i < 5; i++) c.grantUpgrade('frost-crystal-weapon');
    c.grantUpgrade('area');
    for (const [x, z] of [[4.5, 0], [5.8, .1], [7.1, .2], [5.2, 2.5], [6.7, 2.8], [4, -3], [6, -3], [8, -2]]) {
      const e = c.spawn('normal', x, z, 0); e.hp = 500;
    }
    for (const attack of c.runBuild.attacks) attack.cooldown = attack.attackId === 'spark' ? 10000 : 0;
    document.getElementById('welcome')!.hidden = true;
  });
  await page.waitForFunction(() => {
    const v = (window as any).game.combatView.inspect();
    return v.frost.atlases.every((a: any) => a.loaded);
  });
  const projectile = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    for (let i = 0; i < 120; i++) {
      c.update(1 / 120, g.position);
      if (c.projectiles.some((p: any) => p.active && p.attackId === 'frost-crystal' && p.distance > 1.6)) break;
    }
    g.placeCamera(true); g.partyView.render(1, c.elapsed); g.updateHUD();
    g.combatView.render(1, c.elapsed, g.position); g.renderer.render(g.scene, g.camera);
    const mesh = g.scene.getObjectByName('WaterAoe-crystal');
    return { count: g.combatView.inspect().frost.atlases[0].count, normalY: mesh.instanceMatrix.array[9],
      fireCount: g.combatView.firePixels.mesh.count, frozen: c.frost.telemetry.freezes };
  });
  expect(projectile.count).toBeGreaterThan(0); expect(projectile.normalY).toBeCloseTo(1);
  expect(projectile.fireCount).toBe(0); expect(projectile.frozen).toBe(0);
  await page.screenshot({ path: 'artifacts/frost/frost-crystal-projectile.png' });
  const freeze = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    for (let i = 0; i < 480 && c.frost.inspect().frozen.length < 2; i++) c.update(1 / 120, g.position);
    for (const attack of c.runBuild.attacks) attack.cooldown = 10000;
    for (let i = 0; i < 36; i++) c.update(1 / 120, g.position);
    g.elapsed = c.elapsed; g.run.waveElapsed = c.elapsed;
    g.partyView.render(1, c.elapsed); g.updateHUD(); g.combatView.render(1, c.elapsed, g.position); g.renderer.render(g.scene, g.camera);
    const mesh = g.scene.getObjectByName('WaterAoe-freeze-shell'), image = mesh.material.map.image;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return { state: c.frost.inspect(), view: g.combatView.inspect().frost,
      frozenSprites: g.combatView.inspect().batches.flatMap((b: any) => b.frozen).filter((n: number) => n === 1).length,
      centerAlpha: ctx.getImageData(64, 64, 1, 1).data[3], normalY: mesh.instanceMatrix.array[9] };
  });
  expect(freeze.state.frozen.length).toBeGreaterThanOrEqual(2);
  expect(freeze.view.atlases[1].count).toBe(freeze.state.frozen.length);
  expect(freeze.frozenSprites).toBe(freeze.state.frozen.length);
  expect(freeze.centerAlpha).toBe(0); expect(freeze.normalY).toBeCloseTo(1);
  await expect(page.locator('#hud-extra-weapons img[alt="霜晶弹"]')).toBeVisible();
  await page.screenshot({ path: 'artifacts/frost/frost-water-freeze.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  const low = await page.evaluate(() => {
    const g = (window as any).game, before = JSON.stringify(g.combat.inspect());
    g.combatView.detail = 2; g.placeCamera(true); g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    return { unchanged: before === JSON.stringify(g.combat.inspect()), view: g.combatView.inspect().frost };
  });
  expect(low.unchanged).toBe(true); expect(low.view.atlases[1].count).toBeGreaterThanOrEqual(2);
  for (const a of low.view.atlases) expect(a.count).toBeLessThanOrEqual(a.capacity);
  await page.screenshot({ path: 'artifacts/frost/frost-water-freeze-mobile.png' });
  const thaw = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    for (let i = 0; i < 240; i++) c.update(1 / 120, g.position);
    g.combatView.render(1, c.elapsed, g.position);
    const expired = { frozen: c.frost.inspect().frozen.length, shells: g.combatView.inspect().frost.atlases[1].count,
      tint: g.combatView.inspect().batches.flatMap((b: any) => b.frozen).some((n: number) => n === 1) };
    c.clearTransientEffects(); g.combatView.clear();
    return { expired, counts: g.combatView.inspect().frost.atlases.map((a: any) => a.count) };
  });
  expect(thaw.expired).toEqual({ frozen: 0, shells: 0, tint: false }); expect(thaw.counts.every((n: number) => n === 0)).toBe(true);
  expect(errors).toEqual([]);
});
