import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Game } from '../src/game';
import type { Combat } from '../src/combat';

type Harness = { testGame: { inspect: Game['inspect']; combat: Combat }; cameraCheck: () => { blockedZ: number; restoredZ: number; fraction: number }; visualCounts: () => { trails: number; fragments: number; enemiesInstanced: boolean } };
const state = (page: Page) => page.evaluate(() => (window as unknown as Harness).testGame.inspect());
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/presentation-harness', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';import {cameraFraction} from '/src/camera-collision.ts';
    createUI(document.getElementById('app'));const g=window.testGame=new Game();
    window.cameraCheck=()=>{g.world.cameraVolumes=[{x:0,y:5,z:7,rx:3,ry:3,rz:1}];g.placeCamera(true);const blockedZ=g.camera.position.z;
      const fraction=cameraFraction(g.cameraAnchor,g.camera.position,g.world.cameraVolumes);g.world.cameraVolumes=[];for(let i=0;i<180;i++)g.placeCamera(false,1/60);return {blockedZ,restoredZ:g.camera.position.z,fraction}};
    window.visualCounts=()=>({trails:g.combatView.boltTrails.count,fragments:g.combatView.dissolving.count,enemiesInstanced:g.combatView.body.isInstancedMesh});
  </script></body></html>` }));
  await page.goto('/presentation-harness');
  await page.waitForFunction(() => 'testGame' in window);
  await expect(page.locator('#start')).toBeVisible();
});

test('audio waits for a gesture; settings persist and gameplay remains paused on closing', async ({ page }) => {
  const supported = (await state(page)).audio.supported;
  expect((await state(page)).audio.state).toBe('locked');
  await page.locator('#start').tap();
  await expect.poll(async () => (await state(page)).audio.state).toBe(supported ? 'running' : 'unavailable');
  if (supported) {
    await page.locator('#jump').tap();
    await expect.poll(async () => (await state(page)).audio.played).toBeGreaterThan(0);
  }
  await page.locator('#settings').tap();
  await expect(page.locator('#settings-screen')).toBeVisible();
  const frozen = await state(page);
  await page.waitForTimeout(250);
  expect(await state(page)).toEqual(frozen);
  expect(frozen.audio.active).toBe(false);
  await page.getByRole('switch', { name: '背景音乐', exact: true }).uncheck();
  await page.getByRole('switch', { name: '游戏音效', exact: true }).uncheck();
  await page.locator('#quality').selectOption('battery');
  expect((await state(page)).graphics).toMatchObject({ mode: 'battery', targetFps: 30, particles: 2 });
  await page.locator('#save-settings').tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  expect((await state(page)).mode).toBe('paused');
  await page.locator('#resume').tap();
  await page.waitForTimeout(150);
  expect((await state(page)).audio).toMatchObject({ music: false, sound: false, state: supported ? 'suspended' : 'unavailable', voices: 0 });
  await page.reload();
  await page.waitForFunction(() => 'testGame' in window);
  expect((await state(page)).graphics.mode).toBe('battery');
  await page.locator('#menu-settings').tap();
  await expect(page.getByRole('switch', { name: '背景音乐', exact: true })).not.toBeChecked();
  await expect(page.locator('#quality')).toHaveValue('battery');
  await page.getByRole('switch', { name: '游戏音效', exact: true }).check();
  await page.locator('#save-settings').tap();
  await page.locator('#start').tap();
  await expect.poll(async () => (await state(page)).audio.state).toBe(supported ? 'running' : 'unavailable');
});

test('jump is cosmetic, freezes on pause/upgrade, lands, and restart clears it', async ({ page }) => {
  await page.locator('#start').tap();
  await page.locator('#jump').tap();
  await expect.poll(async () => (await state(page)).jumpHeight).toBeGreaterThan(0.1);
  await page.locator('#pause').tap();
  const frozen = await state(page);
  await page.waitForTimeout(250);
  expect((await state(page)).jumpHeight).toBe(frozen.jumpHeight);
  await page.locator('#resume').tap();
  await expect.poll(async () => (await state(page)).jumpHeight).toBe(0);
  await page.keyboard.press('j');
  await expect.poll(async () => (await state(page)).jumpHeight).toBeGreaterThan(0.1);
  await page.evaluate(() => {
    const g = (window as unknown as Harness).testGame, p = g.inspect().position;
    g.combat.spawn('tank', p.x + 0.5, p.z, 0);
  });
  await expect.poll(async () => (await state(page)).combat.hp).toBeLessThan(100);
  await page.evaluate(() => (window as unknown as Harness).testGame.combat.progression.gainExperience(8));
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  const upgrade = await state(page);
  await page.waitForTimeout(250);
  expect(await state(page)).toEqual(upgrade);
  await page.locator('.skill-card').first().tap();
  await page.locator('#pause').tap();
  await page.locator('#restart').tap();
  expect((await state(page)).jumpHeight).toBe(0);
  expect((await state(page)).combat.kills).toBe(0);
});

test('camera retracts before cover and smoothly restores its follow distance', async ({ page }) => {
  await page.locator('#start').tap();
  await page.locator('#pause').tap();
  const camera = await page.evaluate(() => (window as unknown as Harness).cameraCheck());
  expect(camera.blockedZ).toBeGreaterThan(1);
  expect(camera.blockedZ).toBeLessThan(7);
  expect(camera.fraction).toBe(1);
  expect(camera.restoredZ).toBeCloseTo(13.5, 2);
});

test('pooled trails, hit flash and dissolving corpses render through the real loop', async ({ page }, testInfo) => {
  await page.locator('#start').tap();
  await page.evaluate(() => (window as unknown as Harness).testGame.combat.spawn('normal', 0, 6, 0));
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).visualCounts().trails)).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).combat.enemies.some((enemy) => enemy.hp < 30)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).visualCounts().fragments), { intervals: [40, 40, 40] }).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as Harness).visualCounts().enemiesInstanced)).toBe(true);
  await page.locator('#pause').tap();
  if (testInfo.project.name === 'chromium') { await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/phase4-combat-mobile.png' }); }
  await page.locator('#restart').tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).visualCounts().fragments)).toBe(0);
  expect((await state(page)).combat.projectiles).toBe(0);
});

test('small landscape HUD and settings fit safe areas with thumb-size touch targets', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.addStyleTag({ content: ':root{--safe-left:44px;--safe-right:44px;--safe-bottom:21px}' });
  await page.locator('#start').tap();
  const bounds = await page.locator('#settings,#pause,#jump,#dash,#joystick').evaluateAll((elements) => elements.map((e) => { const b = e.getBoundingClientRect(); return { id: e.id, x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; }));
  for (const b of bounds) { expect(b.width, b.id).toBeGreaterThanOrEqual(44); expect(b.height, b.id).toBeGreaterThanOrEqual(44); expect(b.x, b.id).toBeGreaterThanOrEqual(44); expect(b.right, b.id).toBeLessThanOrEqual(524); expect(b.bottom, b.id).toBeLessThanOrEqual(299); }
  await page.locator('#settings').tap();
  for (const selector of ['.settings-card', '#save-settings', '#quality', '.setting-toggle']) {
    for (const b of await page.locator(selector).evaluateAll((elements) => elements.map(e => { const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom}; }))) { expect(b.x).toBeGreaterThanOrEqual(44); expect(b.right).toBeLessThanOrEqual(524); expect(b.y).toBeGreaterThanOrEqual(0); expect(b.bottom).toBeLessThanOrEqual(299); }
  }
  if (testInfo.project.name === 'chromium') await page.screenshot({ path: 'artifacts/phase4-settings-small.png' });
});

test('independent touch pointers keep moving while jumping and dashing', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Native multi-touch injection uses Chromium CDP.');
  await page.locator('#start').tap();
  const joy = (await page.locator('#joystick').boundingBox())!, jump = (await page.locator('#jump').boundingBox())!, dash = (await page.locator('#dash').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const a = { id: 1, x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 }, b = { id: 2, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 }, c = { id: 3, x: dash.x + dash.width / 2, y: dash.y + dash.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  a.x += 35; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await expect.poll(async () => (await state(page)).jumpHeight).toBeGreaterThan(0.1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b, c] });
  await expect.poll(async () => (await state(page)).cooldown).toBeGreaterThan(0.5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [b, c] });
  expect((await state(page)).movement.x).toBeGreaterThan(0.5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await state(page)).movement.x).toBe(0);
});


test('missing Web Audio fails gracefully and never blocks combat or settings', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitAudioContext', { value: undefined, configurable: true });
  });
  await page.locator('#start').tap();
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(0.1);
  expect((await state(page)).audio).toMatchObject({ supported: false, state: 'unavailable' });
  await page.locator('#settings').tap();
  await expect(page.locator('#audio-status')).toContainText('当前浏览器未提供音频');
  await page.getByRole('switch', { name: '背景音乐', exact: true }).uncheck();
  await page.locator('#save-settings').tap();
  await page.locator('#resume').tap();
  expect((await state(page)).mode).toBe('playing'); expect(errors).toEqual([]);
});
