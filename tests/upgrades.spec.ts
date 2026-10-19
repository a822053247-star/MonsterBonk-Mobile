import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Combat } from '../src/combat';
import type { Game } from '../src/game';
import type { SkillId } from '../src/progression';

type Harness = { testGame: { combat: Combat; inspect: Game['inspect'] }; offerSkill: (id: SkillId, amount?: number) => void };
const state = (page: Page) => page.evaluate(() => (window as unknown as Harness).testGame.inspect());
const offer = (page: Page, id: SkillId, amount?: number) => page.evaluate(({ id, amount }) => (window as unknown as Harness).offerSkill(id, amount), { id, amount });
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  // Fixture-only setup: the production app keeps its read-only diagnostic boundary.
  await page.route('**/upgrade-harness', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/></head><body><div id="app"></div><script type="module">
    import '/src/style.css';
    import {createUI} from '/src/ui.ts';
    import {Game} from '/src/game.ts';
    import {SKILLS} from '/src/progression.ts';
    createUI(document.getElementById('app'));
    window.testGame=new Game();
    window.offerSkill=(id,amount)=>{
      const p=window.testGame.combat.progression;
      const eligible=SKILLS.filter(s=>p.ranks[s.id]<s.maxRank);
      const index=eligible.findIndex(s=>s.id===id);let step=eligible.length-1;
      p.random=()=>{if(step<1)return .999;const i=step--;return((i===index?0:i)+.1)/(i+1)};
      p.gainExperience(amount??p.threshold-p.experience);
    };
  </script></body></html>` }));
  await page.goto('/upgrade-harness');
  await page.waitForFunction(() => 'testGame' in window);
  await page.locator('#start').tap();
});

test('XP opens three valid cards, freezes the entire simulation and touch picks once', async ({ page }) => {
  await page.keyboard.down('d');
  await expect.poll(async () => (await state(page)).position.x).toBeGreaterThan(0.3);
  await page.evaluate(() => {
    const game = (window as unknown as Harness).testGame;
    const player = game.inspect().position;
    game.combat.spawn('tank', player.x + 0.6, player.z, 0);
    (window as unknown as Harness).offerSkill('damage');
  });
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  await expect(page.locator('.skill-card')).toHaveCount(3);
  const paused = await state(page);
  expect(paused.mode).toBe('upgrading');
  expect(paused.rendering).toBe(false);
  expect(paused.movement).toEqual({ x: 0, y: 0 });
  expect(paused.combat.progression.level).toBe(2);
  expect(new Set(paused.combat.progression.offers).size).toBe(3);
  await page.waitForTimeout(350);
  expect(await state(page)).toEqual(paused);
  // A key held from gameplay, or Enter on the panel itself, cannot pick a card.
  await page.keyboard.press('Enter');
  expect((await state(page)).mode).toBe('upgrading');
  await page.keyboard.up('d');
  await page.locator('[data-skill="damage"]').tap();
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect((await state(page)).combat.progression.ranks.damage).toBe(1);
  expect((await state(page)).combat.progression.stats.damageMultiplier).toBe(1.2);
  expect((await state(page)).movement).toEqual({ x: 0, y: 0 });
  await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(paused.elapsed);
});

test('XP overflow queues separate choices; duplicate old clicks cannot spend the next reward', async ({ page }) => {
  await offer(page, 'damage', 8 + 12 + 16 + 2);
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  const initial = await state(page);
  expect(initial.combat.progression).toMatchObject({ level: 4, experience: 2, pendingChoices: 3 });
  const old = await page.locator('[data-skill="damage"]').elementHandle();
  await page.locator('[data-skill="damage"]').tap();
  await expect.poll(async () => (await state(page)).combat.progression.pendingChoices).toBe(2);
  // A delayed click on a detached previous offer is never an active choice.
  await old!.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect((await state(page)).combat.progression.pendingChoices).toBe(2);
  await page.locator('[data-skill="damage"]').tap();
  await expect.poll(async () => (await state(page)).combat.progression.pendingChoices).toBe(1);
  expect((await state(page)).elapsed).toBe(initial.elapsed);
  await page.locator('[data-skill="damage"]').tap();
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect((await state(page)).combat.progression.ranks.damage).toBe(3);
  expect((await state(page)).combat.progression.experience).toBe(2);
});

test('cards fit short landscape phones and safe areas; rotation/background keeps choices frozen', async ({ page }, testInfo) => {
  await offer(page, 'orbit');
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  await mkdir('artifacts', { recursive: true });
  await expect(page.locator('.skill-card').first()).toBeEnabled();
  await page.screenshot({ path: `artifacts/upgrade-${testInfo.project.name}.png` });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-bottom', '21px');
    document.documentElement.style.setProperty('--safe-left', '44px');
    document.documentElement.style.setProperty('--safe-right', '44px');
  });
  for (const card of await page.locator('.skill-card').all()) {
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(524);
    expect(box.y + box.height).toBeLessThanOrEqual(299);
  }
  await page.screenshot({ path: `artifacts/upgrade-small-${testInfo.project.name}.png` });
  const paused = await state(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#rotate-screen')).toBeVisible();
  await page.waitForTimeout(200);
  expect((await state(page)).combat).toEqual(paused.combat);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  expect((await state(page)).combat).toEqual(paused.combat);
  await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')); });
  expect((await state(page)).mode).toBe('upgrading');
  await page.locator('[data-skill="orbit"]').tap();
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect((await state(page)).combat.progression.stats.orbitCount).toBe(1);
});

test('new spells coexist, max HP updates HUD and a fresh run clears all skills', async ({ page }, testInfo) => {
  for (const id of ['orbit', 'shockwave', 'vitality', 'movement'] as const) {
    await offer(page, id);
    await expect(page.locator('#upgrade-screen')).toBeVisible();
    await page.locator(`[data-skill="${id}"]`).tap();
    await expect(page.locator('#upgrade-screen')).toBeHidden();
  }
  const upgraded = await state(page);
  expect(upgraded.combat.progression.stats).toMatchObject({ orbitCount: 1, shockDamage: 24, maxHp: 120, moveMultiplier: 1.1 });
  await expect(page.locator('#health-value')).toHaveText('120 / 120');
  await expect(page.getByRole('progressbar', { name: '生命值', exact: true })).toHaveAttribute('aria-valuemax', '120');
  await expect.poll(async () => (await state(page)).combat.orbitAngle).toBeGreaterThan(0);
  if (testInfo.project.name === 'chromium') {
    await expect.poll(async () => (await state(page)).combat.shockwaves.some((wave) => wave.radius > 1.5), { timeout: 7_000, intervals: [50] }).toBe(true);
    await page.screenshot({ path: 'artifacts/learned-spells.png' });
  }
  await page.locator('#pause').tap();
  await page.locator('#restart').tap();
  expect((await state(page)).combat.progression).toMatchObject({ level: 1, experience: 0, totalExperience: 0, pendingChoices: 0, offers: [], stats: { orbitCount: 0, shockDamage: 0, maxHp: 100, moveMultiplier: 1 } });
  expect((await state(page)).combat.shockwaves).toEqual([]);
  await expect(page.locator('#health-value')).toHaveText('100 / 100');
});

test('the last remaining skill is valid and full mastery stops creating empty dialogs', async ({ page }) => {
  await page.evaluate(() => {
    const combat = (window as unknown as Harness).testGame.combat;
    combat.progression.gainExperience(1_000_000);
    while (combat.progression.pendingChoices > 1) combat.chooseUpgrade(combat.progression.offers[0]);
  });
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  await expect(page.locator('.skill-card')).toHaveCount(1);
  await page.locator('.skill-card').tap();
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  await expect(page.locator('#xp-progress')).toHaveText('满级');
  await page.evaluate(() => (window as unknown as Harness).testGame.combat.progression.gainExperience(500));
  await page.waitForTimeout(200);
  expect((await state(page)).mode).toBe('playing');
  expect((await state(page)).combat.progression.pendingChoices).toBe(0);
});

test('an existing joystick finger cannot pick a card or leave movement stuck', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP multitouch injection is Chromium-only.');
  const session = await page.context().newCDPSession(page);
  const box = (await page.locator('#joystick').boundingBox())!;
  const finger = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  finger.x += box.width * 0.34;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  await expect.poll(async () => (await state(page)).position.x).toBeGreaterThan(0.3);
  await offer(page, 'damage');
  await expect(page.locator('#upgrade-screen')).toBeVisible();
  await expect(page.locator('[data-skill="damage"]')).toBeEnabled();
  const card = (await page.locator('[data-skill="damage"]').boundingBox())!;
  finger.x = card.x + card.width / 2; finger.y = card.y + card.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  expect((await state(page)).mode).toBe('upgrading');
  expect((await state(page)).combat.progression.ranks.damage).toBe(0);
  expect((await state(page)).movement).toEqual({ x: 0, y: 0 });
  await page.locator('[data-skill="damage"]').tap();
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect((await state(page)).movement).toEqual({ x: 0, y: 0 });
});
