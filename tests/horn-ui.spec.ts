import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

const state = (page: Page) => page.evaluate(() => (window as unknown as { game: Game }).game.inspect());
test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/horn-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.arrange=(kind,x,z)=>{g.combat.enemies.forEach(e=>e.active=false);g.combat.projectiles.forEach(e=>e.active=false);g.combat.spawnClock=g.combat.fireClock=Infinity;g.combat.spawn(kind,x,z,0)};
    window.warning=()=>{g.sleep();window.arrange('fast',3,-3);g.combat.update(1/60,g.position);g.combatView.render(1,g.elapsed,g.position);g.renderer.render(g.scene,g.camera);return {lanes:g.combatView.pounceLanes.count,arrows:g.combatView.pounceArrows.count}};
    window.level=()=>{g.combat.progression.gainExperience(8);g.step(1/60)};
  </script></body></html>` }));
  await page.goto('/horn-harness');
  await expect(page.locator('#start-trial')).toBeVisible();
  await expect.poll(async () => (await state(page))?.creature.sprite?.loaded).toBe(true);
});

test('phone trial equips horns, touch dash damages and interrupts; restart and classic clear it', async ({ page }) => {
  await page.locator('#start-trial').tap();
  expect((await state(page)).ruleset).toBe('horn-trial');
  expect((await state(page)).creature.equipped.head).toBe('charge-horns');
  await expect(page.locator('#trial-status')).toBeVisible();
  // Point the joystick to screen-right, then use the real touch dash button.
  const joystick = (await page.locator('#joystick').boundingBox())!;
  await page.mouse.move(joystick.x + joystick.width / 2, joystick.y + joystick.height / 2);
  await page.mouse.down(); await page.mouse.move(joystick.x + joystick.width, joystick.y + joystick.height / 2);
  await expect.poll(async () => (await state(page)).position.x).toBeGreaterThan(.15);
  await page.mouse.up();
  await page.evaluate(() => {
    const w = window as unknown as { game: Game; arrange: (kind: string, x: number, z: number) => void };
    const p = w.game.inspect().position; w.arrange('fast', p.x + 1.5, p.z);
  });
  await expect.poll(async () => (await state(page)).combat.trial?.intents[0]?.state).toBe('windup');
  await page.locator('#dash').tap();
  await expect.poll(async () => (await state(page)).combat.trial?.hits).toBe(1);
  expect((await state(page)).combat.trial?.interrupts).toBe(1);
  await expect(page.locator('#trial-progress')).toContainText('打断 1');
  await page.locator('#pause').tap(); const frozen = await state(page);
  await page.waitForTimeout(200); expect(await state(page)).toEqual(frozen);
  await page.locator('#restart').tap();
  expect((await state(page)).combat.trial?.hits).toBe(0); expect((await state(page)).ruleset).toBe('horn-trial');
  await page.locator('#pause').tap(); await page.locator('#back-menu').tap(); await page.locator('#start').tap();
  expect((await state(page)).ruleset).toBe('classic'); expect((await state(page)).combat.trial).toBeUndefined();
  expect((await state(page)).creature.equipped.head).toBeUndefined(); await expect(page.locator('#trial-status')).toBeHidden();
});

test('telegraph has real instanced geometry, trial upgrades freeze and resume without losing horns', async ({ page }, info) => {
  await page.locator('#start-trial').tap();
  expect(await page.evaluate(() => (window as unknown as { warning: () => unknown }).warning())).toEqual({ lanes: 1, arrows: 1 });
  if (info.project.name === 'chromium') await page.screenshot({ path: 'artifacts/horn-trial-windup.png' });
  await page.evaluate(() => (window as unknown as { level: () => void }).level());
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  const frozen = await state(page); await page.waitForTimeout(220); expect(await state(page)).toEqual(frozen);
  await expect(page.locator('.skill-card')).toHaveCount(3); await page.locator('.skill-card').first().tap();
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect((await state(page)).creature.equipped.head).toBe('charge-horns');
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(frozen.elapsed);
});

test('trial entry and instructions fit small phone safe areas without covering joystick', async ({ page }, info) => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.addStyleTag({ content: ':root{--safe-left:44px;--safe-right:44px;--safe-bottom:21px}' });
    const entry = (await page.locator('#start-trial').boundingBox())!;
    expect(entry.x).toBeGreaterThanOrEqual(44); expect(entry.x + entry.width).toBeLessThanOrEqual(viewport.width - 44);
    expect(entry.y + entry.height).toBeLessThanOrEqual(viewport.height - 21);
    await page.locator('#start-trial').tap();
    const status = (await page.locator('#trial-status').boundingBox())!, joystick = (await page.locator('#joystick').boundingBox())!;
    expect(status.y + status.height).toBeLessThanOrEqual(joystick.y);
    expect(status.x + status.width).toBeLessThan(viewport.width / 2);
    if (info.project.name === 'chromium') await page.screenshot({ path: `artifacts/horn-trial-${viewport.width}.png` });
    await page.locator('#pause').tap(); await page.locator('#back-menu').tap();
  }
});
