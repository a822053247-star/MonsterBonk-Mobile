import { test, expect } from '@playwright/test';

test('supplied blades render on the ground, keep atlas aspect, show HUD art and release resources', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/blade-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game=new Game();</script></body></html>` }));
  await page.goto('/blade-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep(); g.wake = () => {};
    c.reset(); c.automaticSpawning = false; c.obstacles = []; c.invulnerability = 10000;
    g.position.set(0, 0, 0); g.previousPosition.copy(g.position); g.party.syncLeader(g.position, 0);
    document.getElementById('welcome')!.hidden = true;
    c.grantUpgrade('thorn-wheel-weapon'); c.grantUpgrade('tidal-blade-weapon');
    for (let i = 0; i < 8; i++) { const e = c.spawn('normal', 5 + i % 3 * 2, (Math.floor(i / 3) - 1) * 3, 0); e.hp = 10000; }
    for (const a of c.runBuild.attacks) a.cooldown = a.attackId === 'spark' ? 10000 : 0;
    c.update(.01, g.position); c.blades.update(.28);
    g.placeCamera(true); g.partyView.render(1, 0); g.updateHUD();
  });
  await page.waitForFunction(() => (window as any).game.combatView.inspect().blades.atlases.every((a: any) => a.loaded));
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    const batch = g.scene.getObjectByName('WaterAoe-thorn-wheel');
    const matrix = batch.instanceMatrix.array;
    // Local plane Z normal is world Y after the -90deg rotation around X.
    return { state: g.combatView.inspect().blades, normalY: matrix[9], normalZ: matrix[10],
      weaponCount: g.combat.runBuild.attacks.length };
  });
  expect(result.weaponCount).toBe(3); expect(result.state.plane).toBe('xz');
  expect(Math.abs(result.normalY)).toBeGreaterThan(.9); expect(Math.abs(result.normalZ)).toBeLessThan(.001);
  expect(result.state.atlases[0].count).toBe(2); expect(result.state.atlases[1].count).toBeGreaterThan(0);
  for (const a of result.state.atlases) expect(a.count).toBeLessThanOrEqual(a.capacity);
  for (const id of ['thorn-wheel', 'tidal-blade']) {
    const icon = page.locator(`#hud-extra-weapons img[src$="${id}-weapon.png"]`);
    await expect(icon).toBeVisible();
    expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await page.screenshot({ path: 'artifacts/blade-weapons-topdown.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  const returning = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.anchorZ = 2; g.position.z = 2; g.party.syncLeader(g.position, 0);
    c.blades.update(.6); g.placeCamera(true); g.partyView.render(1, 0);
    g.combatView.detail = 2; g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    return c.blades.inspect().active.find((a: any) => a.id === 'tidal-blade');
  });
  expect(returning?.returning).toBe(true); expect(returning!.z).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/blade-weapons-return-mobile.png' });
  const cleanup = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat, before = JSON.stringify(c.blades.inspect());
    g.combatView.detail = 2; g.combatView.render(1, 0, g.position);
    const unchanged = before === JSON.stringify(c.blades.inspect());
    c.clearTransientEffects(); g.combatView.clear();
    return { unchanged, counts: g.combatView.inspect().blades.atlases.map((a: any) => a.count) };
  });
  expect(cleanup.unchanged).toBe(true); expect(cleanup.counts.every((n: number) => n === 0)).toBe(true);
  expect(errors).toEqual([]);
});
