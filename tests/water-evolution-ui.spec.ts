import { test, expect } from '@playwright/test';

test('evolution icons, distinct stages and shared GPU batches render in the real Game scene', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/evolution-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI,renderUpgradeCards} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();window.renderCards=renderUpgradeCards;
    </script></body></html>` }));
  await page.goto('/evolution-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat; g.sleep(); c.reset(); c.automaticSpawning = false;
    document.getElementById('welcome')!.hidden = true;
    for (const a of c.runBuild.attacks) a.cooldown = 10000;
    for (const id of ['azure-burst', 'star-tide', 'returning-ring']) for (let i = 0; i < 5; i++) c.grantUpgrade(id);
    for (const id of ['still-sea', 'ice-radiance', 'abyss-vortex']) for (let i = 0; i < 3; i++) c.grantUpgrade(id);
    const p = c.progression; p.currentOffers = ['tsunami-sanctuary', 'astral-wheel', 'abyss-crown']; p.pendingChoices = 1;
    (window as any).renderCards(p, 0); document.getElementById('upgrade-screen')!.hidden = false;
    g.placeCamera(true); g.partyView.render(1, g.visualTime);
  });
  for (const id of ['tsunami-sanctuary', 'astral-wheel', 'abyss-crown']) {
    const art = page.locator(`[data-skill="${id}"] .skill-illustration`);
    await expect(art).toHaveClass(/art-loaded/); await expect(art).toHaveAttribute('src', new RegExp(`/skills/${id}.png$`));
    expect(await art.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([512, 512]);
    await expect(page.locator(`[data-skill="${id}"]`)).toContainText('组合进化');
  }
  await page.screenshot({ path: 'artifacts/water-evolution-cards.png' });
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.progression.pendingChoices = 0; c.progression.currentOffers = [];
    for (const id of ['tsunami-sanctuary', 'astral-wheel', 'abyss-crown']) c.grantUpgrade(id);
    document.getElementById('upgrade-screen')!.hidden = true;
  });
  await page.waitForFunction(() => {
    const v = (window as any).game.combatView.inspect();
    return [...v.positionAoe.atlases, ...v.waterAoe.atlases].every((a: any) => a.loaded);
  });
  for (const kind of ['tsunami-sanctuary', 'astral-wheel', 'abyss-crown']) {
    const result = await page.evaluate(kind => {
      const g = (window as any).game, c = g.combat; c.clearTransientEffects();
      for (const e of c.enemies) e.active = false;
      for (let i = 0; i < 28; i++) {
        const a = i * 2.399963, r = 1.8 + i % 6;
        const e = c.spawn('normal', g.position.x + Math.cos(a) * r, g.position.z + Math.sin(a) * r, 0); e.hp = 10000;
      }
      c.waterEvolution.cast(kind, 1, { x: g.position.x, z: g.position.z });
      c.waterEvolution.update(kind === 'tsunami-sanctuary' ? 1.1 : kind === 'astral-wheel' ? .9 : 1.66, {}, 1);
      g.updateHUD(); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
      const v = g.combatView.inspect();
      return { active: v.waterEvolution.active, atlases: [...v.waterAoe.atlases, ...v.positionAoe.atlases], hits: c.waterEvolution.inspect().hits };
    }, kind);
    expect(result.active).toBe(1); expect(result.hits).toBeGreaterThan(0);
    for (const atlas of result.atlases) expect(atlas.count).toBeLessThanOrEqual(atlas.capacity);
    await page.screenshot({ path: `artifacts/evolution-${kind}.png` });
  }
  for (const name of ['海啸圣域', '星海天轮', '深海王冠']) await expect(page.locator(`#hud-extra-weapons img[alt="${name}"]`)).toBeVisible();
  await expect(page.locator('#hud-extra-weapons img[alt="苍蓝震爆"]')).toHaveCount(0);
  const lifecycle = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat, before = JSON.stringify(c.waterEvolution.inspect());
    g.combatView.detail = 2; g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    const unchanged = before === JSON.stringify(c.waterEvolution.inspect());
    const memory = JSON.stringify(g.renderer.info.memory);
    for (let i = 0; i < 30; i++) { g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera); }
    const stable = memory === JSON.stringify(g.renderer.info.memory);
    c.hitPlayer(10000); g.combatView.render(1, 0, g.position);
    const v = g.combatView.inspect();
    return { unchanged, stable, cleared: !c.waterEvolution.inspect().active.length && !v.waterEvolution.active && [...v.waterAoe.atlases, ...v.positionAoe.atlases].every((a: any) => !a.count) };
  });
  expect(lifecycle).toEqual({ unchanged: true, stable: true, cleared: true }); expect(errors).toEqual([]);
});
