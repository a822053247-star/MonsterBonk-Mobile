import { test, expect } from '@playwright/test';

test('supplied ice ring and three static trail variants render on the ground and clean up on phones', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /shader|WebGL|THREE/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/ice-skills-harness*', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><meta charset="utf-8"><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
    window.draw=()=>{const g=window.game;g.placeCamera(true);g.party.syncLeader(g.position,0);g.partyView.render(1,g.combat.elapsed);g.monster.root.visible=!g.partyView.hasPixelLeader;g.updateHUD();g.combatView.render(1,g.combat.elapsed,g.position);g.renderer.render(g.scene,g.camera)};
    </script></html>` }));
  await page.goto('/ice-skills-harness?world=fixed', { waitUntil: 'domcontentloaded' }); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep(); g.wake = () => {};
    c.reset(); c.automaticSpawning = false; c.obstacles = []; c.invulnerability = 10000;
    for (const a of c.runBuild.attacks) a.cooldown = 10000;
    c.grantUpgrade('glacier-trail');
    g.position.set(-5, 0, 2); g.previousPosition.copy(g.position); c.update(1 / 60, g.position);
    for (let i = 1; i <= 80; i++) {
      g.previousPosition.copy(g.position); g.position.x = -5 + i * .1; g.position.z = 2 - Math.min(2, i * .04);
      c.update(1 / 60, g.position);
    }
    document.getElementById('welcome')!.hidden = true;
  });
  await expect.poll(() => page.evaluate(() => (window as any).game.combatView.inspect().frost.atlases.map((a: any) => ({ name: a.name, loaded: a.loaded, failed: a.failed }))), { timeout: 30000 })
    .toEqual(['crystal', 'freeze-shell', 'crystal', 'shatter-ring', 'glacier-trail'].map(name => ({ name: 'WaterAoe-' + name, loaded: true, failed: false })));
  const trail = await page.evaluate(() => {
    const w = window as any, g = w.game; w.draw();
    const mesh = g.scene.getObjectByName('WaterAoe-glacier-trail');
    return { view: g.combatView.inspect().frost.atlases[4], normalY: mesh.instanceMatrix.array[9] };
  });
  expect(trail.normalY).toBeCloseTo(1); expect(trail.view.count).toBeGreaterThan(5);
  expect(new Set(trail.view.frames).size).toBe(3);
  await expect(page.locator('#hud-extra-weapons img[alt="冰川滑痕"]')).toBeVisible();
  await page.screenshot({ path: 'artifacts/frost/glacier-trail-topdown.png' });
  const ring = await page.evaluate(() => {
    const w = window as any, g = w.game, c = g.combat, p = g.position;
    for (const [dx, dz] of [[-2, -2], [0, -2.8], [2, -2], [3, 0], [-1.8, 1.8]]) {
      const e = c.spawn('normal', p.x + dx, p.z + dz, 0); e.hp = 1000; e.wetTime = 2;
    }
    c.grantUpgrade('shatter-ring');
    for (let i = 0; i < 19; i++) c.update(1 / 60, p);
    w.draw(); const view = g.combatView.inspect(), mesh = g.scene.getObjectByName('WaterAoe-shatter-ring');
    return { view: view.frost.atlases[3], normalY: mesh.instanceMatrix.array[9], state: c.iceSkills.inspect(), frozen: c.frost.inspect().frozen.length };
  });
  expect(ring.view.count).toBe(1); expect(ring.normalY).toBeCloseTo(1);
  expect(ring.state.ringHits).toBeGreaterThan(0); expect(ring.frozen).toBeGreaterThan(0);
  await expect(page.locator('#hud-extra-weapons img[alt="碎冰震环"]')).toBeVisible();
  await page.screenshot({ path: 'artifacts/frost/shatter-ring-topdown.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  const low = await page.evaluate(() => {
    const w = window as any, g = w.game, before = JSON.stringify(g.combat.inspect());
    g.combatView.detail = 2; w.draw();
    return { same: before === JSON.stringify(g.combat.inspect()), view: g.combatView.inspect().frost };
  });
  expect(low.same).toBe(true); expect(low.view.atlases[3].count).toBe(1);
  for (const a of low.view.atlases) expect(a.count).toBeLessThanOrEqual(a.capacity);
  await page.screenshot({ path: 'artifacts/frost/ice-skills-mobile.png' });
  const clear = await page.evaluate(() => {
    const w = window as any, g = w.game; g.combat.clearTransientEffects(); w.draw();
    return g.combatView.inspect().frost.atlases.map((a: any) => a.count);
  });
  expect(clear.every((n: number) => n === 0)).toBe(true); expect(errors).toEqual([]);
});
