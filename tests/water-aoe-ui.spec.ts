import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, failTextures = false) {
  await page.setViewportSize({ width: 1280, height: 720 });
  if (failTextures) await page.route('**/assets/water-aoe/*.png', route => route.abort());
  await page.route('**/water-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
    </script></body></html>` }));
  await page.goto('/water-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep(); g.combat.reset(); g.combat.automaticSpawning = false;
    document.getElementById('welcome')!.hidden = true;
    for (const attack of g.combat.runBuild.attacks) attack.cooldown = 10000;
    for (const id of ['azure-burst', 'star-tide', 'still-sea', 'returning-ring']) g.combat.grantUpgrade(id);
    g.placeCamera(true); g.partyView.render(1, g.visualTime);
  });
  await page.waitForFunction(failed => (window as any).game.combatView.inspect().waterAoe.atlases.every((a: any) => failed ? a.failed : a.loaded), failTextures);
}

test('supplied water atlases animate four real attacks, preserve low-quality damage and display icons', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await open(page);
  for (const kind of ['azure-burst', 'star-tide', 'still-sea', 'returning-ring']) {
    const result = await page.evaluate(kind => {
      const g = (window as any).game, c = g.combat; c.clearTransientEffects();
      for (const e of c.enemies) e.active = false;
      for (let i = 0; i < 28; i++) {
        const angle = i * 2.399963, r = 3 + i % 6;
        const e = c.spawn(i % 6 === 0 ? 'tank' : 'normal', g.position.x + Math.cos(angle) * r, g.position.z + Math.sin(angle) * r, 0); e.hp = 10000;
      }
      const point = { x: g.position.x + (kind === 'azure-burst' || kind === 'still-sea' ? 4 : 0), z: g.position.z };
      c.waterAoe.cast(kind, 5, 1, point);
      c.waterAoe.update(kind === 'azure-burst' ? .38 : kind === 'still-sea' ? 1.2 : .64, {}, 1);
      g.combatView.detail = 4; g.updateHUD(); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
      return { hits: c.waterAoe.inspect().hits, view: g.combatView.inspect().waterAoe };
    }, kind);
    expect(result.view.atlases.some((a: any) => a.count > 0)).toBe(true);
    expect(result.hits).toBeGreaterThan(0);
    await page.screenshot({ path: `artifacts/water-${kind}.png` });
  }
  for (const id of ['azure-burst', 'star-tide', 'still-sea', 'returning-ring']) {
    await expect(page.locator(`#hud-extra-weapons img[alt="${{ 'azure-burst': '苍蓝震爆', 'star-tide': '星潮脉冲', 'still-sea': '静海法阵', 'returning-ring': '回流水环' }[id]}"]`)).toBeVisible();
  }
  const result = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.clearTransientEffects();
    c.waterAoe.cast('still-sea', 5, 1, { x: g.position.x + 4, z: g.position.z }); c.waterAoe.update(.7, {}, 1);
    g.combatView.detail = 4; g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
    const high = g.combatView.inspect().waterAoe, before = JSON.stringify(c.waterAoe.inspect()), memory = { ...g.renderer.info.memory };
    g.combatView.detail = 2;
    for (let i = 0; i < 60; i++) g.combatView.render(1, g.visualTime, g.position);
    g.renderer.render(g.scene, g.camera);
    const low = g.combatView.inspect().waterAoe, after = JSON.stringify(c.waterAoe.inspect());
    g.pause('水系暂停测试'); const paused = JSON.stringify(c.waterAoe.inspect()); g.frame(1000); g.sleep();
    const frozen = paused === JSON.stringify(c.waterAoe.inspect());
    c.clearTransientEffects(); g.combatView.clear();
    return { high, low, unchanged: before === after, frozen, stableMemory: JSON.stringify(memory) === JSON.stringify(g.renderer.info.memory),
      cleared: c.waterAoe.inspect().active.length === 0 && g.combatView.inspect().waterAoe.atlases.every((a: any) => a.count === 0) };
  });
  expect(result.high.atlases[3].count).toBe(3); expect(result.low.atlases[3].count).toBe(1);
  expect(result.low.atlases[2].count).toBe(result.high.atlases[2].count);
  expect(result.unchanged && result.frozen && result.stableMemory && result.cleared).toBe(true);
  expect(errors).toEqual([]);
});

test('missing water textures retain all damage and cleanup', async ({ page }) => {
  await open(page, true);
  const result = await page.evaluate(() => {
    const g = (window as any).game, c = g.combat, point = { x: g.position.x, z: g.position.z };
    const target = c.spawn('tank', point.x, point.z, 0); target.hp = 1000;
    for (const kind of ['azure-burst', 'star-tide', 'still-sea', 'returning-ring']) c.waterAoe.cast(kind, 5, 1, point);
    c.waterAoe.update(.6, {}, 1); g.combatView.render(1, 0, g.position); g.renderer.render(g.scene, g.camera);
    const view = g.combatView.inspect().waterAoe;
    c.hitPlayer(10000); g.combatView.render(1, 0, g.position);
    return { hp: target.hp, view, deathCleared: c.waterAoe.inspect().active.length === 0 && g.combatView.inspect().waterAoe.atlases.every((a: any) => a.count === 0) };
  });
  expect(result.hp).toBeLessThan(1000);
  expect(result.view.atlases.every((a: any) => a.failed && a.count === 0)).toBe(true);
  expect(result.deathCleared).toBe(true);
});
