import { test, expect } from '@playwright/test';

test('grass creature acquires fire/water through upgrade cards, shows all five fusions and restarts cleanly', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/three-weapon-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
  </script></body></html>` }));
  await page.goto('/three-weapon-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#choose-creature').click();
  await page.locator('[data-creature="sproutspike"]').click();
  await page.locator('#start-selected-creature').click();
  for (const id of ['spark-weapon', 'bubble-weapon', 'split-on-hit', 'area', 'chain']) {
    await page.evaluate(id => {
      const g = (window as any).game; g.sleep();
      const p = g.combat.progression, candidates = p.skills.filter((s: any) => p.ranks[s.id] < s.maxRank);
      const index = candidates.findIndex((s: any) => s.id === id), rolls: number[] = [];
      if (index < 0) throw new Error('Missing upgrade: ' + id);
      for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + .1) / (i + 1));
      p.random = () => rolls.shift() ?? .999;
      p.gainExperience(p.threshold - p.experience); g.step(1 / 60);
    }, id);
    const card = page.locator(`[data-skill="${id}"]`);
    await expect(card).toBeEnabled(); await card.click();
  }
  await expect(page.locator('#fusion-title')).toHaveText('叶刃 + 火花弹 + 水泡弹 · 5 融合');
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).game;
    return !!g.combatView.firePixels?.loaded && !!g.combatView.fusionPixels?.loaded;
  })).toBe(true);
  const fired = await page.evaluate(() => {
    const g = (window as any).game; g.sleep(); g.combat.spawnClock = 10000;
    g.position.set(0, 0, 0); g.party.syncLeader(g.position, 0);
    for (const e of g.combat.enemies) e.active = false;
    for (const a of g.combat.runBuild.attacks) a.cooldown = 0;
    g.combat.clearTransientEffects();g.combat.spawn('tank', 9, 0, 0);
    // All three attacks share the launch gap; observe a full staggered sequence.
    const observed=new Map();
    for(let tick=0;tick<30;tick++){
      g.step(1/60);
      for(const s of g.combat.projectiles)if(s.active&&!s.generation)observed.set(s.attackId,{id:s.attackId,recipes:s.fusionIds.length});
    }
    g.welcome.style.display = 'none'; g.fusionNoticeUntil = 0; g.updateHUD(); g.placeCamera(true);
    g.partyView.render(1, g.visualTime); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
    return [...observed.values()];
  });
  expect(fired).toEqual(expect.arrayContaining([{ id: 'leaf', recipes: 2 }, { id: 'spark', recipes: 1 }, { id: 'bubble', recipes: 2 }]));
  await expect(page.locator('#fusion-hint')).toContainText('融合协同');
  await expect(page.locator('#fusion-burst-icon')).toBeVisible();
  await page.screenshot({ path: 'artifacts/v5.1-b-three-weapon.png' });
  await page.setViewportSize({ width: 568, height: 320 });
  const bounds = await page.locator('#fusion-status').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(568);
  expect(await page.locator('#fusion-title').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#pause').click();
  expect(await page.evaluate(() => {
    const g = (window as any).game, snapshot = JSON.stringify(g.combat.inspect());
    g.step(1); return JSON.stringify(g.combat.inspect()) === snapshot;
  })).toBe(true);
  await page.locator('#restart').click();
  expect(await page.evaluate(() => (window as any).game.combat.runBuild.attacks.map((a: any) => a.attackId))).toEqual(['leaf']);
  expect(errors).toEqual([]);
});
