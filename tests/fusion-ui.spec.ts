import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

type Fixture = { game: Game; offer: () => void; impact: () => void; lose: () => void; frozen: () => string; redraw: () => void };
const state = (page: Page) => page.evaluate(() => (window as unknown as Fixture).game.inspect());
test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/fusion-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.offer=()=>{g.sleep();const p=g.combat.progression,candidates=p.skills.filter(s=>p.ranks[s.id]<s.maxRank),index=candidates.findIndex(s=>s.id==='split-on-hit'),rolls=[];
      for(let i=candidates.length-1;i>0;i--)rolls.push(((i===index?0:i)+.1)/(i+1));p.random=()=>rolls.shift()??.999;p.gainExperience(p.threshold-p.experience);g.step(1/60)};
    window.redraw=()=>{g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
    window.impact=()=>{g.sleep();for(const pool of [g.combat.enemies,g.combat.projectiles,g.combat.effects])for(const item of pool)item.active=false;
      g.position.set(0,0,0);g.previousPosition.copy(g.position);g.monster.root.position.copy(g.position);g.party.syncLeader(g.position,0);g.party.leader.attackCooldown=0;
      g.combat.spawn('tank',5,0,0);g.combat.update(1/60,g.position);const main=g.combat.projectiles.find(s=>s.active);Object.assign(main,{x:3.7,previousX:3.7,z:0,previousZ:0,vx:18,vz:0});
      g.combat.spawn('tank',4.2,1.4,0);g.combat.spawn('tank',4.2,-1.4,0);g.combat.update(.05,g.position);g.welcome.style.display='none';window.redraw()};
    window.frozen=()=>JSON.stringify({c:g.combat.inspect(),shots:g.combat.projectiles,effects:g.combat.effects,frames:Array.from(g.combatView.firePixels?.frames.array??[]),time:g.visualTime});
    window.lose=()=>{g.sleep();g.combat.hp=0;g.step(1/60)};
  </script></body></html>` }));
});
async function open(page: Page) {
  await page.goto('/fusion-harness?world=fixed'); await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-fusion').tap();
  await expect.poll(async () => (await state(page)).fusionVisual?.loaded).toBe(true);
  await expect.poll(async () => (await state(page)).partyVisual.members.filter(m => m?.loaded).length).toBe(1);
}
async function learn(page: Page) {
  await page.evaluate(() => (window as unknown as Fixture).offer());
  const card = page.locator('[data-skill="split-on-hit"]'); await expect(card).toBeEnabled(); await card.tap();
  await expect(page.locator('#fusion-title')).toHaveText('爆裂火种 · 已融合');
}

test('new menu starts one pixel Yanrong with joystick only and automatically fires ordinary sparks', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await open(page);
  expect((await state(page)).party).toHaveLength(1); await expect(page.locator('.dash-control')).toBeHidden();
  await page.keyboard.press('Space'); await page.keyboard.press('j');
  expect(await state(page)).toMatchObject({ cooldown: 0, jumpHeight: 0 });
  const before = await state(page), box = (await page.locator('#joystick').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 32, box.y + box.height / 2);
  await expect.poll(async () => (await state(page)).position.x).toBeGreaterThan(before.position.x + 1); await page.mouse.up();
  await page.evaluate(() => (window as unknown as Fixture).impact());
  expect((await state(page)).combat.fusion).toMatchObject({ active: null, bursts: 0, childShots: 0 });
  expect((await state(page)).combat.shotsFired).toBeGreaterThan(0); expect((await state(page)).combat.hits).toBeGreaterThan(0);
  expect((await state(page)).fusionVisual).toMatchObject({ loaded: true, failed: false, nearest: true });
  expect(errors).toEqual([]);
});

test('real card selection fuses and real impacts render four atlas rows on both short phone layouts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await open(page);
  await page.evaluate(() => (window as unknown as Fixture).offer());
  const card = page.locator('[data-skill="split-on-hit"]'); await expect(card).toBeEnabled();
  await expect(card.locator('.fire-icon')).toHaveClass(/ready/);
  await page.screenshot({ path: 'artifacts/v5-fusion-card-844.png' });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.screenshot({ path: 'artifacts/v5-fusion-card-568.png' });
  await page.setViewportSize({ width: 844, height: 390 }); await card.tap();
  // Resize can wake rendering after the fixture sleeps. Keep this arranged frame
  // paused while manually advancing Combat, so screenshots cannot race live ticks.
  await page.evaluate(() => { const g = (window as any).game; g.sleep(); g.mode = 'paused'; });
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport); await page.evaluate(() => (window as unknown as Fixture).impact());
    expect((await state(page)).combat.fusion).toMatchObject({ active: 'burst-seed', bursts: viewport.width === 844 ? 1 : 2, children: 2 });
    expect((await state(page)).fusionVisual!.count).toBe(4);
    expect(await page.evaluate(() => { const v = (window as any).game.combatView.firePixels; return Array.from(v.frames.array).slice(0, v.mesh.count); })).toEqual([4, 4, 8, 12]);
    const box = (await page.locator('#fusion-status').boundingBox())!;
    expect(box.x).toBeGreaterThan(140); expect(box.x + box.width).toBeLessThan(viewport.width - 100);
    // Both seeded children move on the next simulation tick; the effect advances frames.
    await page.evaluate(() => { const g = (window as any).game; g.combat.update(.21,g.position); (window as unknown as Fixture).redraw(); });
    const frames = await page.evaluate(() => { const v = (window as any).game.combatView.firePixels; return Array.from(v.frames.array).slice(0,v.mesh.count) as number[]; });
    expect(frames).toContain(10); expect(frames).toContain(14);
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'artifacts/v5-fusion-combat-' + viewport.width + '.png' });
  }
  expect(errors).toEqual([]);
});

test('pause, background, death and restart freeze animations/damage and clear learned fusion', async ({ page }) => {
  await open(page); await learn(page); await page.evaluate(() => (window as unknown as Fixture).impact());
  await page.locator('#pause').tap(); let frozen = await page.evaluate(() => (window as unknown as Fixture).frozen());
  await page.waitForTimeout(200); expect(await page.evaluate(() => (window as unknown as Fixture).frozen())).toBe(frozen);
  await page.locator('#resume').tap();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  frozen = await page.evaluate(() => (window as unknown as Fixture).frozen()); await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as unknown as Fixture).frozen())).toBe(frozen);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('#resume').tap(); await page.evaluate(() => (window as unknown as Fixture).lose());
  frozen = await page.evaluate(() => (window as unknown as Fixture).frozen()); await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as unknown as Fixture).frozen())).toBe(frozen);
  await page.locator('#gameover-restart').tap();
  expect((await state(page)).combat.fusion).toMatchObject({ active: null, bursts: 0, childShots: 0, children: 0 });
  expect((await state(page)).combat.progression.ranks['split-on-hit']).toBe(0);
  expect((await state(page)).party).toHaveLength(1); expect((await state(page)).fusionVisual!.count).toBe(0);
});

test('missing atlas and icons keep procedural attack/explosion and readable cards', async ({ page }) => {
  await page.route('**/skills/yanrong/*.normalized.png', route => route.abort());
  await page.goto('/fusion-harness?world=fixed'); await page.waitForFunction(() => 'game' in window); await page.locator('#start-fusion').tap();
  await expect.poll(async () => (await state(page)).fusionVisual?.failed).toBe(true); await learn(page);
  await page.evaluate(() => (window as unknown as Fixture).impact());
  expect((await state(page)).combat.fusion.bursts).toBe(1); expect((await state(page)).combat.fusion.children).toBe(2);
  expect(await page.evaluate(() => { const v=(window as any).game.combatView;return {bolts:v.bolts.count,rings:v.burstRings.count}; })).toEqual({bolts:2,rings:1});
  expect((await state(page)).fusionVisual!.count).toBe(0);
});

test('legacy three-creature entry retains following/automatic attacks and does not learn fusion', async ({ page }) => {
  await page.goto('/fusion-harness?world=fixed'); await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-legacy-party').tap(); expect((await state(page)).party).toHaveLength(3);
  const before = (await state(page)).party;
  await page.keyboard.down('d'); await expect.poll(async () => (await state(page)).distance).toBeGreaterThan(2); await page.keyboard.up('d');
  const after = (await state(page)).party; expect(after[1].x).not.toBe(before[1].x);
  expect((await state(page)).combat.fusion.enabled).toBe(false); await expect(page.locator('#fusion-status')).toBeHidden();
  await page.evaluate(() => { const g=(window as any).game;g.combat.spawn('tank',g.position.x,g.position.z+6,0); });
  await expect.poll(async () => (await state(page)).party.every(m => m.shotsFired > 0)).toBe(true);
});

test('new and preserved menu entries fit both phone safe areas with unobstructed touch targets', async ({ page }) => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport); await page.goto('/fusion-harness?world=fixed'); await page.waitForFunction(() => 'game' in window);
    await page.addStyleTag({ content: ':root{--safe-left:44px;--safe-right:44px;--safe-bottom:21px}' });
    for (const id of ['start-fusion', 'start-party', 'start-legacy-party', 'start', 'start-trial', 'start-challenge']) {
      const box = (await page.locator('#' + id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(44); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 44);
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 21); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.closest('button')?.id, {x:box.x+box.width/2,y:box.y+box.height/2})).toBe(id);
    }
    await page.screenshot({ path: 'artifacts/v5-fusion-menu-' + viewport.width + '.png' });
    await page.locator('#start-fusion').tap(); expect((await state(page)).prototypeVariant).toBe('fusion');
  }
});

test('fusion restarts reuse GPU resources and disposal releases the atlas batch', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await state(page)).enemyVisual.batches?.filter(b => b.loaded).length).toBe(3);
  let baseline: { geometries: number; textures: number } | undefined;
  for (let i=0;i<4;i++) {
    await learn(page); await page.evaluate(() => (window as unknown as Fixture).impact());
    const current = await state(page), memory = { geometries: current.geometries, textures: current.textures };
    if (baseline) expect(memory).toEqual(baseline); else baseline = memory;
    await page.locator('#pause').tap(); await page.locator('#restart').tap();
    expect((await state(page)).fusionVisual!.count).toBe(0);
  }
  expect(await page.evaluate(() => {const g=(window as any).game,v=g.combatView.firePixels;g.dispose();return {loaded:v.loaded,count:v.mesh.count,attached:!!v.mesh.parent};})).toEqual({loaded:false,count:0,attached:false});
});

test('late fire atlas completion cannot attach resources after disposal', async ({ page }) => {
  await page.route('**/fire-effects-sheet.normalized.png', async route => { await new Promise(resolve => setTimeout(resolve,350));await route.continue().catch(()=>{}); });
  await page.goto('/fusion-harness?world=fixed'); await page.waitForFunction(() => 'game' in window); await page.locator('#start-fusion').tap();
  await page.evaluate(() => {const g=(window as any).game;(window as any).oldFire=g.combatView.firePixels;g.dispose();});
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => {const v=(window as any).oldFire;return {loaded:v.loaded,count:v.mesh.count,attached:!!v.mesh.parent};})).toEqual({loaded:false,count:0,attached:false});
});

