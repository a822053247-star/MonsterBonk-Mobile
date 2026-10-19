import { test, expect } from '@playwright/test';

test('stage A: pick bubble through the mobile upgrade screen, pause and restart', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/dual-weapon-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game = new Game();
  </script></body></html>` }));
  await page.goto('/dual-weapon-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    const p = g.combat.progression, candidates = p.skills.filter((s: any) => p.ranks[s.id] < s.maxRank);
    const index = candidates.findIndex((s: any) => s.id === 'bubble-weapon'), rolls: number[] = [];
    for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + .1) / (i + 1));
    p.random = () => rolls.shift() ?? .999;
    p.gainExperience(p.threshold - p.experience); g.step(1 / 60);
  });
  const card = page.locator('[data-skill="bubble-weapon"]');
  await expect(card).toBeEnabled(); await expect(card).toContainText('获得水泡弹'); await card.click();
  await expect(page.locator('#fusion-title')).toHaveText('火花弹 + 水泡弹');
  const shots = await page.evaluate(() => {
    const g = (window as any).game; g.sleep(); g.combat.spawnClock = 10000;
    g.position.set(0, 0, 0); g.party.syncLeader(g.position, 0);
    for (const e of g.combat.enemies) e.active = false;
    g.combat.spawn('tank', 9, 0, 0);
    const emitted = new Map();
    g.combat.runBuild.attacks[0].cooldown = 0;
    for (let i = 0; i < 24; i++) {
      g.step(1 / 60);
      for (const s of g.combat.projectiles) if (s.active) emitted.set(s.attackId, { attack: s.attackId, species: s.species });
    }
    g.updateHUD(); g.welcome.style.display = 'none'; g.placeCamera(true);
    g.partyView.render(1, g.visualTime); g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
    return [...emitted.values()];
  });
  expect(shots).toEqual(expect.arrayContaining([{ attack: 'spark', species: 'yanrong' }, { attack: 'bubble', species: 'yanrong' }]));
  await page.screenshot({ path: 'artifacts/v5.1-a-dual-weapon.png' });
  await page.locator('#pause').click();
  const frozen = await page.evaluate(() => {
    const g = (window as any).game, before = JSON.stringify(g.combat.inspect());
    for (let i = 0; i < 60; i++) g.step(1 / 60);
    return before === JSON.stringify(g.combat.inspect());
  });
  expect(frozen).toBe(true);
  await page.locator('#restart').click();
  await expect(page.locator('#fusion-title')).toHaveText('火花弹');
  expect(await page.evaluate(() => (window as any).game.combat.runBuild.attacks.map((a: any) => a.attackId))).toEqual(['spark']);
  expect(errors).toEqual([]);
});
