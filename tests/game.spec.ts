import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Combat } from '../src/combat';

type Snapshot = { mode: string; position: { x: number; z: number }; movement: { x: number; y: number }; elapsed: number; cooldown: number; portrait: boolean; rendering: boolean; drawCalls: number; geometries: number; textures: number; distance: number; triangles: number; combat: ReturnType<Combat['inspect']> };
const inspect = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as unknown as { __monsterbonk: { inspect: () => Snapshot } }).__monsterbonk.inspect());

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start')).toBeVisible();
  await expect.poll(() => page.evaluate(() => '__monsterbonk' in window)).toBe(true);
});

test('main menu renders a real 3D world and starts exploration without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload();
  await expect.poll(async () => (await inspect(page)).drawCalls).toBeGreaterThan(15);
  await page.locator('#help').click();
  await expect(page.locator('#help-screen')).toBeVisible();
  await page.locator('#close-help').click();
  await expect(page.locator('#help-screen')).toBeHidden();
  if (testInfo.project.name === 'chromium') {
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/menu-desktop.png' });
  }
  await page.locator('#start').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.getByRole('progressbar', { name: '生命值', exact: true })).toHaveAttribute('aria-valuenow', '100');
  await expect.poll(async () => (await inspect(page)).elapsed).toBeGreaterThan(0.5);
  const state = await inspect(page);
  expect(state.drawCalls).toBeLessThan(100);
  // The GLB adds three material maps and GPU skinning data to the shared shadows.
  expect(state.textures).toBeLessThanOrEqual(8);
  expect(errors).toEqual([]);
  expect(await page.locator('#error-screen').isVisible()).toBe(false);
  console.log(`${testInfo.project.name} render budget:`, JSON.stringify(state));
});

test('keyboard moves, normalizes diagonals, dashes and stops after release', async ({ page }) => {
  await page.locator('#start').click();
  await page.keyboard.down('d');
  await expect.poll(async () => (await inspect(page)).position.x).toBeGreaterThan(1.5);
  await page.keyboard.down('w');
  await expect.poll(async () => Math.hypot(...Object.values((await inspect(page)).movement))).toBeCloseTo(1, 3);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await inspect(page)).cooldown).toBeGreaterThan(0.5);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  await expect.poll(async () => Math.hypot(...Object.values((await inspect(page)).movement))).toBe(0);
  await page.waitForTimeout(700);
  const stopped = (await inspect(page)).position;
  await page.waitForTimeout(250);
  const after = (await inspect(page)).position;
  expect(Math.hypot(after.x - stopped.x, after.z - stopped.z)).toBeLessThan(0.04);
});

test('joystick deadzone, drag outside, release and pointer cancellation', async ({ page }) => {
  await page.locator('#start').click();
  const box = (await page.locator('#joystick').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 2, y);
  await page.waitForTimeout(100);
  expect((await inspect(page)).movement.x).toBe(0);
  await page.mouse.move(x + 180, y - 40);
  await expect.poll(async () => (await inspect(page)).position.x).toBeGreaterThan(1);
  expect(Math.hypot(...Object.values((await inspect(page)).movement))).toBeCloseTo(1, 4);
  await page.mouse.up();
  await expect.poll(async () => (await inspect(page)).movement.x).toBe(0);
  await expect(page.locator('.joystick-knob')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  // A real pointerdown obtains capture, followed by the same ID's cancel event.
  await page.evaluate(() => document.querySelector('#joystick')!.addEventListener('pointerdown', (event) => {
    const id = (event as PointerEvent).pointerId;
    setTimeout(() => document.querySelector('#joystick')!.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id })), 250);
  }, { once: true }));
  await page.mouse.move(x + 30, y);
  await page.mouse.down();
  await expect.poll(async () => (await inspect(page)).movement.x).toBeGreaterThan(0.2);
  await expect.poll(async () => (await inspect(page)).movement.x).toBe(0);
  await page.mouse.up();
});

test('pause freezes simulation and resets held input; menu can restart cleanly', async ({ page }) => {
  await page.locator('#start').click();
  await page.keyboard.down('d');
  await expect.poll(async () => (await inspect(page)).position.x).toBeGreaterThan(1);
  await page.locator('#pause').click();
  const paused = await inspect(page);
  await page.waitForTimeout(350);
  expect((await inspect(page)).elapsed).toBe(paused.elapsed);
  expect((await inspect(page)).position).toEqual(paused.position);
  expect((await inspect(page)).combat).toEqual(paused.combat);
  expect(paused.rendering).toBe(false);
  await page.locator('#resume').click();
  await page.keyboard.up('d');
  expect((await inspect(page)).movement.x).toBe(0);
  await expect.poll(async () => (await inspect(page)).elapsed).toBeGreaterThan(paused.elapsed);
  const initialResources = await inspect(page);
  for (let i = 0; i < 3; i++) {
    await page.locator('#pause').click();
    await page.locator('#back-menu').click();
    await page.locator('#start').click();
  }
  expect((await inspect(page)).position).toEqual({ x: 0, z: 0 });
  expect((await inspect(page)).geometries).toBe(initialResources.geometries);
  expect((await inspect(page)).textures).toBe(initialResources.textures);
});

test('portrait prompts rotation, pauses play and resumes only on request', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#start').click();
  await page.keyboard.down('w');
  await expect.poll(async () => (await inspect(page)).position.z).toBeLessThan(-0.3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#rotate-screen')).toBeVisible();
  const paused = await inspect(page);
  expect(paused.mode).toBe('paused');
  expect(paused.rendering).toBe(false);
  await page.waitForTimeout(250);
  expect((await inspect(page)).elapsed).toBe(paused.elapsed);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate-screen')).toBeHidden();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.locator('#resume').click();
  await page.keyboard.up('w');
  expect((await inspect(page)).movement.y).toBe(0);
});

test('visibility and blur handlers freeze time and release controls', async ({ page }) => {
  await page.locator('#start').click();
  await page.keyboard.down('d');
  await expect.poll(async () => (await inspect(page)).position.x).toBeGreaterThan(0.5);
  // Deterministically exercise the visibility handler; real device backgrounding is a separate manual check.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const paused = await inspect(page);
  expect(paused.mode).toBe('paused');
  expect(paused.rendering).toBe(false);
  await page.waitForTimeout(300);
  expect((await inspect(page)).elapsed).toBe(paused.elapsed);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('#resume').click();
  await page.keyboard.up('d');
  expect((await inspect(page)).movement.x).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await inspect(page)).mode).toBe('paused');
});

test('real multitouch keeps joystick and dash independent on mobile', async ({ browser, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'CDP multitouch injection is Chromium-only.');
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.locator('#start').tap();
    const joystick = (await page.locator('#joystick').boundingBox())!;
    const dash = (await page.locator('#dash').boundingBox())!;
    const session = await context.newCDPSession(page);
    const first = { x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2, id: 1 };
    const second = { x: dash.x + dash.width / 2, y: dash.y + dash.height / 2, id: 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    first.x += joystick.width * 0.34;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first] });
    await expect.poll(async () => (await inspect(page)).position.x).toBeGreaterThan(0.6);
    await expect.poll(async () => (await inspect(page)).combat.shotsFired, { timeout: 20_000 }).toBeGreaterThan(0);
    expect((await inspect(page)).movement.x).toBeGreaterThan(0.9);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
    await expect.poll(async () => (await inspect(page)).cooldown).toBeGreaterThan(0.5);
    expect((await inspect(page)).movement.x).toBeGreaterThan(0.9);
    // For a partial CDP touchEnd, provide the changed (released) point.
    // Lift only the dash finger. The joystick finger must remain active.
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
    await page.waitForTimeout(100);
    expect((await inspect(page)).movement.x).toBeGreaterThan(0.9);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await inspect(page)).movement.x).toBe(0);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/game-mobile.png' });
    await testInfo.attach('mobile gameplay', { path: 'artifacts/game-mobile.png', contentType: 'image/png' });
  } finally { await context.close(); }
});

test('automatic combat updates HUD, collects XP and restart clears every combat entity', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#start').click();
  await expect.poll(async () => (await inspect(page)).combat.kills, { timeout: 18_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await inspect(page)).combat.orbs.length, { timeout: 8_000 }).toBeGreaterThan(0);
  const orb = (await inspect(page)).combat.orbs[0];
  const player = (await inspect(page)).position;
  const dx = orb.x - player.x, dz = orb.z - player.z, length = Math.hypot(dx, dz);
  const box = (await page.locator('#joystick').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / length * box.width * 0.34, y + dz / length * box.width * 0.34);
  await expect.poll(async () => (await inspect(page)).combat.xp, { timeout: 7_000 }).toBeGreaterThan(0);
  await page.mouse.up();
  if ((await inspect(page)).mode === 'upgrading') await page.locator('.skill-card').first().click();
  await expect.poll(async () => (await inspect(page)).combat.spawned, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  // Windows WebKit screenshot composition can omit the WebGL surface; use Chromium
  // for this automatic visual artifact. WebKit still runs every gameplay assertion.
  await mkdir('artifacts', { recursive: true });
  if (testInfo.project.name === 'chromium') await page.screenshot({ path: 'artifacts/combat-chromium.png' });
  await page.locator('#pause').click();
  const state = await inspect(page);
  await expect(page.locator('#kill-value')).toHaveText(String(state.combat.kills));
  await expect(page.locator('#xp-value')).toHaveText(String(state.combat.xp));
  await expect(page.locator('#health-value')).toHaveText(`${state.combat.hp} / ${state.combat.maxHp}`);
  await page.locator('#resume').click();
  // Verify that simulation advances again after closing the modal.
  await expect.poll(async () => (await inspect(page)).elapsed).toBeGreaterThan(state.elapsed + 0.12);
  await page.locator('#pause').click();
  await page.locator('#restart').click();
  const restarted = await inspect(page);
  expect(restarted.combat).toMatchObject({ hp: 100, kills: 0, xp: 0, spawned: 0, shotsFired: 0, enemies: [], projectiles: 0, orbs: [], effects: 0 });
  expect(restarted.position).toEqual({ x: 0, z: 0 });
  await expect(page.locator('#health-value')).toHaveText('100 / 100');
  expect(restarted.drawCalls).toBeLessThan(100);
});
