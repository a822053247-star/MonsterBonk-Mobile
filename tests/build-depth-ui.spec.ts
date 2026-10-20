import { test, expect } from '@playwright/test';

test('rare choices expose costs, and pause shows levels, all six relics and the exclusive route', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/build-depth-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
  </script></body></html>` }));
  await page.goto('/build-depth-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window); await page.locator('#start-fusion').click();
  for (const id of ['spark-weapon', 'split-on-hit', 'overload-core', 'pursuit-route', 'shattered-core', 'hunter-eye', 'specialist-badge', 'bubble-weapon', 'area', 'tidal-pearl', 'leaf-weapon', 'chain', 'echo-rune']) {
    await page.evaluate(id => {
      const g = (window as any).game; g.sleep();
      const p = g.combat.progression, candidates = p.skills.filter((s: any) => p.ranks[s.id] < s.maxRank);
      const index = candidates.findIndex((s: any) => s.id === id), rolls: number[] = [];
      if (index < 0) throw new Error('Missing card: ' + id);
      for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + .1) / (i + 1));
      // This UI fixture selects each declared rare card; pity-draw behavior is
      // covered separately and must not replace the fixture's requested offer.
      p.rollsWithoutCore = 0;
      rolls.push(.01); p.random = () => rolls.shift() ?? .999;
      p.gainExperience(p.threshold - p.experience); g.step(1 / 60);
    }, id);
    const card = page.locator(`[data-skill="${id}"]`); await expect(card).toBeEnabled();
    if (id === 'overload-core') {
      await expect(card).toContainText('代价：所有武器攻击间隔 +20%');
      await page.screenshot({ path: 'artifacts/v5.1-c-relic-choice.png' });
    }
    if (id === 'pursuit-route') await expect(card).toContainText('放弃狂暴路线');
    await card.click();
  }
  await expect(page.locator('#fusion-title')).toContainText('火花弹 2级');
  await expect(page.locator('#build-status')).toHaveText('6 件稀有道具 · 追猎火种 · 暂停查看构筑');
  await page.locator('#pause').click();
  await expect(page.locator('#build-weapons')).toContainText('主武器火花弹 2级');
  await expect(page.locator('#build-fusions')).toContainText('连环水爆');
  await expect(page.locator('#build-relics')).toContainText('专精徽记（副武器已装备，加成失效）');
  await expect(page.locator('#build-relics')).toContainText('回声符石');
  await expect(page.locator('#build-evolution')).toContainText('追猎火种');
  await page.screenshot({ path: 'artifacts/v5.1-c-build-summary.png' });
  await page.setViewportSize({ width: 568, height: 320 });
  const bounds = await page.locator('.pause-card').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(568);
  expect(await page.locator('.pause-card').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#build-summary').focus(); await page.keyboard.press('End');
  await expect(page.locator('#resume')).toBeVisible();
  expect(await page.evaluate(() => {
    const g = (window as any).game, snapshot = JSON.stringify(g.combat.inspect()); g.step(1);
    return JSON.stringify(g.combat.inspect()) === snapshot;
  })).toBe(true);
  await page.locator('#restart').click();
  await expect(page.locator('#build-status')).toBeHidden();
  expect(await page.evaluate(() => {
    const g = (window as any).game; return { relics: g.combat.runBuild.relics, route: g.combat.runBuild.evolution ?? null, levels: g.combat.runBuild.attacks.map((a: any) => a.level) };
  })).toEqual({ relics: [], route: null, levels: [1] });
  expect(errors).toEqual([]);
});
