import { test, expect } from '@playwright/test';

test('four supplied icons and real combination attacks render with bounded batches', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/combination-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI,renderUpgradeCards} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();window.renderCards=renderUpgradeCards;
    </script></body></html>` }));
  await page.goto('/combination-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep(); c.reset(); c.automaticSpawning = false;
    document.getElementById('welcome')!.hidden = true;
    for (const id of ['spore-trail', 'azure-burst', 'still-sea', 'star-tide']) for (let i = 0; i < 5; i++) c.grantUpgrade(id);
    for (const id of ['tidal-recall', 'abyss-vortex', 'ice-radiance']) for (let i = 0; i < 3; i++) c.grantUpgrade(id);
    g.placeCamera(true); g.partyView.render(1, g.visualTime);
  });
  for (const [index, ids] of [['undertow-pyre', 'deep-collapse', 'frost-prism'], ['all-tides', 'undertow-pyre', 'deep-collapse']].entries()) {
    await page.evaluate(ids => {
      const c = (window as any).game.combat; c.progression.currentOffers = ids; c.progression.pendingChoices = 1;
      (window as any).renderCards(c.progression, 0); document.getElementById('upgrade-screen')!.hidden = false;
    }, ids);
    for (const id of ids) {
      const image = page.locator(`[data-skill="${id}"] .skill-illustration`); await expect(image).toHaveClass(/art-loaded/);
      expect(await image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([512, 512]);
      await expect(page.locator(`[data-skill="${id}"]`)).toContainText('组合进化');
    }
    await page.screenshot({ path: `artifacts/elemental-combination-cards-${index + 1}.png` });
  }
  await page.waitForFunction(() => {
    const v = (window as any).game.combatView.inspect();
    return [...v.positionAoe.atlases, ...v.waterAoe.atlases].every((a: any) => a.loaded);
  });
  for (const kind of ['undertow-pyre', 'deep-collapse', 'frost-prism', 'all-tides']) {
    const result = await page.evaluate(async kind => {
      const { WATER_EVOLUTIONS } = await import('/src/water-evolution.ts' as string);
      const g = (window as any).game, c = g.combat, recipe = WATER_EVOLUTIONS[kind]; c.reset(); c.automaticSpawning = false;
      document.getElementById('upgrade-screen')!.hidden = true;
      for (let i = 0; i < 5; i++) c.grantUpgrade(recipe.main);
      for (let i = 0; i < 3; i++) c.grantUpgrade(recipe.support);
      const granted = c.grantUpgrade(kind), point = { x: g.position.x, z: g.position.z };
      for (let i = 0; i < 26; i++) {
        const a = i * 2.399963, r = 1.8 + i % 6;
        const e = c.spawn('normal', point.x + Math.cos(a) * r, point.z + Math.sin(a) * r, 0); e.hp = 10000;
      }
      if (kind === 'undertow-pyre') for (let i = 0; i < 8; i++) c.positionAoe.cast('spore-trail', 5, 1,
        { x: point.x - 5 + i * .8, z: point.z + 1.3 + Math.sin(i * .8) * .6 });
      c.waterEvolution.cast(kind, 1, point);
      c.waterEvolution.update(kind === 'undertow-pyre' ? 1.8 : kind === 'deep-collapse' ? 1.83 : kind === 'frost-prism' ? .68 : 1.45, {}, 1);
      g.updateHUD(); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
      const v = g.combatView.inspect(), before = JSON.stringify(c.waterEvolution.inspect());
      g.combatView.detail = 2; g.combatView.render(1, 0, g.position);
      const unchanged = before === JSON.stringify(c.waterEvolution.inspect());
      g.combatView.detail = 4; g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
      return { granted, unchanged, active: v.waterEvolution.active, hits: c.waterEvolution.inspect().hits,
        atlases: [...v.waterAoe.atlases, ...v.positionAoe.atlases], title: recipe.title };
    }, kind);
    expect(result.granted && result.unchanged).toBe(true); expect(result.active).toBe(1); expect(result.hits).toBeGreaterThan(0);
    for (const atlas of result.atlases) expect(atlas.count).toBeLessThanOrEqual(atlas.capacity);
    await expect(page.locator(`#hud-extra-weapons img[alt="${result.title}"]`)).toBeVisible();
    await page.screenshot({ path: `artifacts/combination-${kind}.png` });
  }
  const cleared = await page.evaluate(() => {
    const g = (window as any).game; g.combat.hitPlayer(10000); g.combatView.render(1, 0, g.position);
    const v = g.combatView.inspect();
    return !v.waterEvolution.active && [...v.waterAoe.atlases, ...v.positionAoe.atlases].every((a: any) => a.count === 0);
  });
  expect(cleared).toBe(true); expect(errors).toEqual([]);
});
