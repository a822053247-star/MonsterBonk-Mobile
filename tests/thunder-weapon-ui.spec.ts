import { test, expect } from '@playwright/test';

test('yellow lightning tiles on the ground, loads transparent art and preserves damage at low detail', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/thunder-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game=new Game();</script></body></html>` }));
  await page.goto('/thunder-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep(); g.wake = () => {};
    c.reset(); c.automaticSpawning = false; c.obstacles = []; c.invulnerability = 10000;
    g.position.set(0, 0, 0); g.previousPosition.copy(g.position); g.party.syncLeader(g.position, 0);
    document.getElementById('welcome')!.hidden = true;
    for (let i = 0; i < 5; i++) c.grantUpgrade('thunder-bud-weapon');
    c.grantUpgrade('thorn-wheel-weapon');
    const points = [[3, 0], [4.8, -1.5], [6.7, .3], [7.5, -2.5], [9.5, -.5], [10.4, -3]];
    for (const [x, z] of points) { const e = c.spawn('normal', x, z, 0); e.hp = 10000; }
    for (const a of c.runBuild.attacks) a.cooldown = a.attackId === 'spark' ? 10000 : 0;
    c.update(.01, g.position);
    for (const a of c.runBuild.attacks) a.cooldown = 10000;
    for (let i = 0; i < 39; i++) c.update(1 / 120, g.position);
    g.placeCamera(true); g.partyView.render(1, 0); g.updateHUD();
  });
  await page.waitForFunction(() => (window as any).game.combatView.inspect().thunder.atlases.every((a: any) => a.loaded));
  const state = await page.evaluate(() => {
    const g = (window as any).game; g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    const mesh = g.scene.getObjectByName('WaterAoe-lightning'), atlas = mesh.material.map.image;
    const canvas = document.createElement('canvas'); canvas.width = atlas.width; canvas.height = atlas.height;
    const context = canvas.getContext('2d')!; context.drawImage(atlas, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let yellow = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && pixels[i] > 180 && pixels[i + 1] > 80 && pixels[i] > pixels[i + 2]) yellow++;
    return { sim: g.combat.thunder.inspect(), view: g.combatView.inspect().thunder,
      normalY: mesh.instanceMatrix.array[9], normalZ: mesh.instanceMatrix.array[10], cornerAlpha: pixels[3], yellow };
  });
  expect(state.sim.hits).toBe(3); expect(state.view.plane).toBe('xz');
  expect(state.view.atlases[1].count).toBeGreaterThan(3);
  expect(Math.abs(state.normalY)).toBeGreaterThan(.9); expect(Math.abs(state.normalZ)).toBeLessThan(.001);
  expect(state.cornerAlpha).toBe(0); expect(state.yellow).toBeGreaterThan(100);
  for (const a of state.view.atlases) expect(a.count).toBeLessThanOrEqual(a.capacity);
  const icon = page.locator('#hud-extra-weapons img[alt="雷芽连锁"]');
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: 'artifacts/thunder-bud-topdown.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  const low = await page.evaluate(() => {
    const g = (window as any).game, before = JSON.stringify(g.combat.thunder.inspect());
    g.combatView.detail = 2; g.placeCamera(true); g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    return { unchanged: before === JSON.stringify(g.combat.thunder.inspect()), counts: g.combatView.inspect().thunder.atlases.map((a: any) => a.count) };
  });
  expect(low.unchanged).toBe(true); expect(low.counts[1]).toBeGreaterThan(0); expect(low.counts[3]).toBe(0);
  await page.screenshot({ path: 'artifacts/thunder-bud-mobile.png' });
  const counts = await page.evaluate(() => {
    const g = (window as any).game; g.combat.clearTransientEffects(); g.combatView.clear();
    return g.combatView.inspect().thunder.atlases.map((a: any) => a.count);
  });
  expect(counts.every((n: number) => n === 0)).toBe(true); expect(errors).toEqual([]);
});
