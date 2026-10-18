import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

const state = (page: Page) => page.evaluate(() => (window as unknown as { game: Game }).game.inspect());
type Fixture = { game: Game; lose: () => void; level: () => void; preview: () => void };
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/party-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.preview=()=>{g.combat.spawn('tank',0,6,0);g.combat.spawn('tank',-4,5,0);g.combat.spawn('tank',4,5,0)};
    window.lose=()=>{g.sleep();g.combat.hp=1;g.combat.invulnerability=0;g.combat.spawn('tank',g.position.x,g.position.z,0);g.step(1/60)};
    window.level=()=>{g.combat.progression.gainExperience(8)};
  </script></body></html>` })) ;
  await page.goto('/party-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-party').tap();
});

test('single joystick moves Yanrong alone and automatic attacks continue', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.dash-control')).toBeHidden();
  expect((await state(page)).party).toHaveLength(1);
  await expect(page.locator('#party-status')).toBeHidden();
  await page.keyboard.press('Space'); await page.keyboard.press('Shift'); await page.keyboard.press('j');
  expect(await state(page)).toMatchObject({ cooldown: 0, jumpHeight: 0 });
  const first = await state(page);
  const box = (await page.locator('#joystick').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 32, y);
  await expect.poll(async () => (await state(page)).position.x).toBeGreaterThan(first.position.x + 1.5);
  await page.mouse.up();
  expect((await state(page)).party).toHaveLength(1);
  await page.evaluate(() => (window as unknown as Fixture).preview());
  await expect.poll(async () => (await state(page)).party.every(m => m.shotsFired > 0)).toBe(true);
  await expect.poll(async () => (await state(page)).combat.hits).toBeGreaterThan(0);
  expect((await state(page)).drawCalls).toBeLessThan(110);
  expect(errors).toEqual([]);
  await page.locator('#pause').tap();
  if (info.project.name === 'chromium') await page.screenshot({ path: 'artifacts/v4-party-paused.png' });
  await page.locator('#resume').tap();
  if (info.project.name === 'chromium') await page.screenshot({ path: 'artifacts/v4-party-gameplay.png' });
});

test('pause, upgrade and background freeze the entire party; death and restart reset shared combat', async ({ page }) => {
  await page.evaluate(() => (window as unknown as Fixture).preview());
  await expect.poll(async () => (await state(page)).combat.shotsFired).toBeGreaterThan(0);
  await page.locator('#pause').tap();
  const paused = await state(page); await page.waitForTimeout(180); expect(await state(page)).toEqual(paused);
  await page.locator('#resume').tap();
  await page.evaluate(() => (window as unknown as Fixture).level());
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  const upgrade = await state(page); await page.waitForTimeout(200); expect(await state(page)).toEqual(upgrade);
  await page.locator('.skill-card').first().tap();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const background = await state(page); expect(background.mode).toBe('paused');
  await page.waitForTimeout(150); expect(await state(page)).toEqual(background);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('#resume').tap();
  await page.evaluate(() => (window as unknown as Fixture).lose());
  await expect(page.locator('#gameover-screen')).toBeVisible();
  const dead = await state(page); expect(dead.combat.hp).toBe(0);
  await page.waitForTimeout(150); expect(await state(page)).toEqual(dead);
  await page.locator('#gameover-restart').tap();
  const fresh = await state(page);
  expect(fresh.party).toHaveLength(1);
  expect(fresh.party.every(m => m.attackCooldown === 0 && m.shotsFired === 0)).toBe(true);
  expect(fresh.combat).toMatchObject({ hp: 100, projectiles: 0, kills: 0, xp: 0, enemies: [] });
  await expect(page.locator('.dash-control')).toBeHidden();
  await page.locator('#pause').tap(); await page.locator('#back-menu').tap(); await page.locator('#start').tap();
  await expect(page.locator('.dash-control')).toBeVisible();
  expect((await state(page)).partyPrototype).toBe(false);
});

test('prototype entry and party HUD fit short phones and safe areas', async ({ page }, info) => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.locator('#pause').tap(); await page.locator('#back-menu').tap();
    await page.setViewportSize(viewport);
    await page.addStyleTag({ content: ':root{--safe-left:44px;--safe-right:44px;--safe-bottom:21px}' });
    for (const id of ['start-party', 'start', 'start-trial', 'start-challenge']) {
      const box = (await page.locator('#' + id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 44);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 21);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#start-party').tap();
    await expect(page.locator('#party-status')).toBeHidden();
    await expect(page.locator('#joystick')).toBeVisible();
    if (info.project.name === 'chromium') await page.screenshot({ path: 'artifacts/v4-party-' + viewport.width + '.png' });
  }
});
