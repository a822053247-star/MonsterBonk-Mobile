import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';
import { mkdir } from 'node:fs/promises';

type Harness = { testGame: Game; sceneCheck: () => { rootY: number; foliage: number[]; regions: string[]; enemyFeet: number[] }; equipPreview: () => void; spawnPreviewEnemies: () => void };
const state = (page: Page) => page.evaluate(() => (window as unknown as Harness).testGame.inspect());
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/25d-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.testGame=new Game();
    window.sceneCheck=()=>{const enemyFeet=[];const matrix=g.monster.body.matrix.clone(),pos=g.position.clone(),scale=g.position.clone(),rot=g.monster.body.quaternion.clone();for(let i=0;i<g.combatView.body.count;i++){g.combatView.body.getMatrixAt(i,matrix);matrix.decompose(pos,rot,scale);enemyFeet.push(pos.y-scale.y);}return {rootY:g.position.y,foliage:['leaf','leafLight'].map(name=>g.world.group.getObjectByName('scenery-'+name).material.opacity),regions:['中央草场','风语林地','岩晶遗迹'].filter(name=>g.world.group.getObjectByName(name)),enemyFeet}};
    window.equipPreview=()=>{g.monster.equipOrgan('charge-horns');g.monster.equipOrgan('hardened-shell');};
    window.spawnPreviewEnemies=()=>{g.combat.spawn('tank',0,6,0);g.combat.spawn('normal',-3,4,0);g.combat.spawn('fast',4,6,0);};
  </script></body></html>` })) ;
  // Keep validating the original procedural fallback and its existing socket props.
  await page.goto('/25d-harness?character=3d'); await page.waitForFunction(() => 'testGame' in window);
});

test('mobile touches follow all screen directions with fixed orientation and ground height', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chromium', 'Actual touch drags injected using Chromium CDP.');
  await page.locator('#start').tap();
  const initial = await state(page), box = (await page.locator('#joystick').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1]]) {
    const before = (await state(page)).position;
    const point = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    point.x += dx * box.width * 0.34; point.y += dy * box.width * 0.34;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await expect.poll(async () => { const p = (await state(page)).position; return (p.x - before.x) * dx + (p.z - before.z) * dy; }).toBeGreaterThan(0.5);
    const after = await state(page);
    if (dx) expect(Math.sign(after.position.x - before.x)).toBe(dx);
    if (dy) expect(Math.sign(after.position.z - before.z)).toBe(dy);
    if (dx && dy) expect(Math.abs((after.position.z - before.z) * Math.SQRT1_2 / (after.position.x - before.x))).toBeCloseTo(1, 1);
    expect(after.camera.type).toBe('OrthographicCamera'); expect(after.camera.pitch).toBe(45);
    after.camera.quaternion.forEach((value, i) => expect(value).toBeCloseTo(initial.camera.quaternion[i], 8));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await state(page)).movement).toEqual({ x: 0, y: 0 });
    await page.waitForTimeout(400);
  }
  expect((await page.evaluate(() => (window as unknown as Harness).sceneCheck())).rootY).toBe(0);
  await expect(page.locator('#jump')).toHaveCount(0);
});

test('Yanrong and two socket props render with clear low scenery, combat and responsive frustum', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await mkdir('artifacts', { recursive: true });
  if (info.project.name === 'chromium') await page.screenshot({ path: 'artifacts/25d-menu-mobile.png' });
  await page.evaluate(() => (window as unknown as Harness).equipPreview());
  await page.locator('#start').tap();
  const start = await state(page);
  expect(start.creature).toMatchObject({ name: '焰绒', legs: 4, equipped: { head: 'charge-horns', back: 'hardened-shell' } });
  expect(start.camera.width).toBeGreaterThanOrEqual(28);
  await page.evaluate(() => (window as unknown as Harness).spawnPreviewEnemies());
  await expect.poll(async () => (await state(page)).combat.hits, { timeout: 18_000 }).toBeGreaterThan(0);
  const scene = await page.evaluate(() => (window as unknown as Harness).sceneCheck());
  expect(scene.regions).toEqual(['中央草场', '风语林地', '岩晶遗迹']);
  expect(scene.foliage.every(opacity => opacity <= 0.45)).toBe(true); expect(scene.rootY).toBe(0);
  expect(scene.enemyFeet.length).toBeGreaterThan(0);
  for (const height of scene.enemyFeet) { expect(height).toBeGreaterThanOrEqual(-0.001); expect(height).toBeLessThanOrEqual(0.071); }
  if (info.project.name === 'chromium') await page.screenshot({ path: 'artifacts/25d-game-mobile.png' });
  await page.locator('#pause').tap();
  for (const viewport of [{ width: 568, height: 320 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await state(page)).camera.width / (await state(page)).camera.height).toBeCloseTo(viewport.width / viewport.height, 6);
    expect((await state(page)).camera.width).toBeGreaterThanOrEqual(28);
  }
  expect(errors).toEqual([]);
  await page.locator('#restart').tap();
  const restarted = await state(page);
  expect(restarted.combat.projectiles).toBe(0); expect(restarted.combat.spawned).toBe(0);
  expect(restarted.creature.equipped).toEqual(start.creature.equipped);
});
