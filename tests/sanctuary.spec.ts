import { test, expect, type Page } from '@playwright/test';
import {
  SANCTUARY_STORAGE_KEY, newSanctuary, readSanctuary, recordSanctuaryRun, upgradeSanctuary,
} from '../src/sanctuary';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

test('new players can restore one area, and every upgrade uses a persistent capped cost', () => {
  const storage = memoryStorage();
  expect(readSanctuary(storage)).toEqual(newSanctuary());
  const first = upgradeSanctuary('ember', storage);
  expect(first.ok).toBe(true);
  expect(first.save.light).toBe(0);
  expect(readSanctuary(storage).buildings.ember).toBe(1);
  expect(upgradeSanctuary('spring', storage).ok).toBe(false);
  recordSanctuaryRun({ id: 'first', mode: 'campaign', completedWaves: 6 }, storage);
  const second = upgradeSanctuary('ember', storage);
  expect(second.ok).toBe(true);
  expect(second.save.buildings.ember).toBe(2);
  const third = upgradeSanctuary('ember', storage);
  expect(third.ok).toBe(true);
  expect(third.save.buildings.ember).toBe(3);
  expect(upgradeSanctuary('ember', storage).ok).toBe(false);
});

test('run rewards are deduplicated and milestones stay separate across modes', () => {
  const storage = memoryStorage();
  const first = recordSanctuaryRun({ id: 'campaign-1', mode: 'campaign', completedWaves: 2 }, storage);
  expect(first).toMatchObject({ earned: 5, newWaves: 2, persisted: true });
  expect(recordSanctuaryRun({ id: 'campaign-1', mode: 'campaign', completedWaves: 6 }, storage).earned).toBe(0);
  const repeat = recordSanctuaryRun({ id: 'campaign-2', mode: 'campaign', completedWaves: 2 }, storage);
  expect(repeat).toMatchObject({ earned: 1, newWaves: 0 });
  const endless = recordSanctuaryRun({ id: 'endless-1', mode: 'endless', completedWaves: 4 }, storage);
  expect(endless).toMatchObject({ earned: 10, newWaves: 4 });
  expect(endless.save.bestCampaignWaves).toBe(2);
  expect(endless.save.bestEndlessWaves).toBe(4);
  expect(recordSanctuaryRun({ id: 'zero', mode: 'campaign', completedWaves: 0 }, storage).earned).toBe(0);
});

test('corrupted saves, invalid levels and blocked storage fail safely', () => {
  const storage = memoryStorage();
  storage.setItem(SANCTUARY_STORAGE_KEY, '{nope');
  expect(readSanctuary(storage).light).toBe(3);
  storage.setItem(SANCTUARY_STORAGE_KEY, JSON.stringify({
    version: 1, light: -999, buildings: { ember: 200, spring: -4, grove: 'broken' },
    bestCampaignWaves: 99, recentRuns: ['valid', 'valid', 12],
  }));
  expect(readSanctuary(storage)).toMatchObject({
    light: 0, buildings: { ember: 3, spring: 0, grove: 0 }, bestCampaignWaves: 6, recentRuns: ['valid'],
  });
  const denied = { getItem: () => null, setItem: () => { throw new Error('Denied'); } };
  expect(upgradeSanctuary('ember', denied)).toMatchObject({ ok: false, reason: '存档不可用，建设未保存' });
  expect(recordSanctuaryRun({ id: 'blocked', mode: 'campaign', completedWaves: 5 }, denied))
    .toMatchObject({ earned: 0, persisted: false });
});

async function openHarness(page: Page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/sanctuary-harness', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body><div id="app"></div><script type="module">
        import '/src/style.css'; import { createUI } from '/src/ui.ts'; import { Game } from '/src/game.ts';
        createUI(document.getElementById('app')); window.game = new Game();
      </script></body></html>`,
  }));
  await page.goto('/sanctuary-harness');
  await page.waitForFunction(() => 'game' in window);
}

test('habitat opens from main menu, restores a landmark, and persists after reload', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(key => localStorage.removeItem(key), SANCTUARY_STORAGE_KEY);
  await page.reload();
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#open-sanctuary').click();
  await expect(page.locator('#sanctuary-screen')).toBeVisible();
  await expect(page.locator('#sanctuary-light')).toHaveText('3');
  await page.locator('[data-sanctuary-region="ember"]').click();
  await expect(page.locator('#sanctuary-region-ember')).toHaveAttribute('data-level', '1');
  await expect(page.locator('[data-landmark="ember"]')).toHaveAttribute('data-level', '1');
  await expect(page.locator('#sanctuary-light')).toHaveText('0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sanctuary-screen')).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#open-sanctuary').click();
  await expect(page.locator('#sanctuary-region-ember')).toHaveAttribute('data-level', '1');
  await expect(page.locator('[data-sanctuary-region="spring"]')).toBeDisabled();
});

test('formal result grants habitat currency, historical trial does not', async ({ page }) => {
  await openHarness(page);
  await page.evaluate(key => localStorage.removeItem(key), SANCTUARY_STORAGE_KEY);
  await page.locator('#start-fusion').click();
  const result = await page.evaluate(() => {
    const game = (window as any).game;
    game.sleep();
    game.run.completedWaves = 3;
    game.endRun('defeat');
    return document.getElementById('sanctuary-result')!.textContent;
  });
  expect(result).toContain('+7 光屑');
  await page.locator('#gameover-menu').click();
  await page.locator('#open-sanctuary').click();
  await expect(page.locator('#sanctuary-light')).toHaveText('10');
  await page.locator('#close-sanctuary').click();
  await page.locator('#open-legacy').click();
  await page.locator('#start-trial').click();
  const oldResult = await page.evaluate(() => {
    const game = (window as any).game;
    game.sleep(); game.endRun('defeat');
    return { hidden: document.getElementById('sanctuary-result')!.hidden,
      balance: JSON.parse(localStorage.getItem('monsterbonk:sanctuary:v1')!).light };
  });
  expect(oldResult).toEqual({ hidden: true, balance: 10 });
});
