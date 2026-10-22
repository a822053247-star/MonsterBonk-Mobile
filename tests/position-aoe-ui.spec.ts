import { test, expect } from '@playwright/test';

test('movement skills render supplied art, show icons and clear bounded resources', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/position-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
    </script></body></html>` }));
  await page.goto('/position-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep(); c.reset(); c.automaticSpawning = false;
    document.getElementById('welcome')!.hidden = true;
    for (const attack of c.runBuild.attacks) attack.cooldown = 10000;
    for (const id of ['abyss-vortex', 'ice-radiance', 'spore-trail', 'tidal-recall']) c.grantUpgrade(id);
    g.placeCamera(true); g.partyView.render(1, g.visualTime);
  });
  await page.waitForFunction(() => {
    const v = (window as any).game.combatView.inspect();
    return [...v.positionAoe.atlases, ...v.waterAoe.atlases].every((a: any) => a.loaded);
  });
  for (const kind of ['abyss-vortex', 'ice-radiance', 'spore-trail', 'tidal-recall']) {
    const result = await page.evaluate(kind => {
      const g = (window as any).game, c = g.combat; c.clearTransientEffects();
      for (const e of c.enemies) e.active = false;
      for (let i = 0; i < 32; i++) {
        const angle = i * 2.399963, r = 1.5 + i % 6;
        const e = c.spawn('normal', g.position.x + Math.cos(angle) * r, g.position.z + Math.sin(angle) * r, 0); e.hp = 10000;
      }
      const point = { x: g.position.x, z: g.position.z };
      if (kind === 'spore-trail') {
        for (let i = 0; i < 5; i++) c.positionAoe.cast(kind, 5, 1, { x: point.x - i * 1.8, z: point.z + 1.5 });
      } else c.positionAoe.cast(kind, 5, 1, point);
      c.positionAoe.update(kind === 'tidal-recall' ? 1.25 : kind === 'ice-radiance' ? .38 : .8, {}, 1);
      g.combatView.detail = 4; g.updateHUD(); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
      return g.combatView.inspect().positionAoe;
    }, kind);
    expect(result.atlases.some((a: any) => a.count > 0) || result.sharedRings > 0).toBe(true);
    for (const atlas of result.atlases) expect(atlas.count).toBeLessThanOrEqual(atlas.capacity);
    await page.screenshot({ path: `artifacts/position-${kind}.png` });
  }
  for (const name of ['深渊漩涡', '冰棱放射', '孢火足迹', '潮汐回收']) {
    await expect(page.locator(`#hud-extra-weapons img[alt="${name}"]`)).toBeVisible();
  }
  const result = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat, before = JSON.stringify(c.positionAoe.inspect());
    g.combatView.detail = 2; g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    const unchanged = before === JSON.stringify(c.positionAoe.inspect());
    c.clearTransientEffects(); g.combatView.clear();
    return { unchanged, active: c.positionAoe.inspect().active.length, view: g.combatView.inspect().positionAoe };
  });
  expect(result.unchanged).toBe(true); expect(result.active).toBe(0);
  expect(result.view.atlases.every((a: any) => a.count === 0)).toBe(true);
  expect(errors).toEqual([]);
});
