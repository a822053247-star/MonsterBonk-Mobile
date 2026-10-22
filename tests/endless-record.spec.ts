import { test, expect, type Page } from '@playwright/test';
import {
  ENDLESS_RECORD_STORAGE_KEY,
  recordEndlessRun,
  type EndlessRecord,
} from '../src/endless-record';

test('personal bests update independently and survive lower results', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  const first = recordEndlessRun({ wave: 12, cycle: 2, bossesDefeated: 1, survivalSeconds: 180 }, storage);
  expect(first.newRecords).toEqual(['最高波数', '最高轮次', '击败 Boss 数', '最长生存时间']);
  const second = recordEndlessRun({ wave: 8, cycle: 2, bossesDefeated: 3, survivalSeconds: 100 }, storage);
  expect(second.newRecords).toEqual(['击败 Boss 数']);
  expect(second.record).toEqual({
    bestWave: 12, bestCycle: 2, bestBossesDefeated: 3, bestSurvivalSeconds: 180, runsPlayed: 2,
  } satisfies EndlessRecord);
  expect(JSON.parse(data.get(ENDLESS_RECORD_STORAGE_KEY)!)).toEqual(second.record);
});

test('invalid persisted data safely falls back to an empty personal best', () => {
  const storage = {
    getItem: () => '{not json',
    setItem: () => {},
  };
  const update = recordEndlessRun({ wave: 1, cycle: 1, bossesDefeated: 0, survivalSeconds: 0 }, storage);
  expect(update.record.bestWave).toBe(1);
  expect(update.record.runsPlayed).toBe(1);
});

async function openHarness(page: Page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/endless-record-harness*', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
      import '/src/style.css'; import { createUI } from '/src/ui.ts'; import { Game } from '/src/game.ts';
      createUI(document.getElementById('app')); window.game = new Game();
    </script></body></html>`,
  }));
  await page.goto('/endless-record-harness');
  await page.waitForFunction(() => 'game' in window);
}

test('flag-wave countdown warns before wave five and changes to the battle announcement', async ({ page }) => {
  await openHarness(page);
  await page.locator('#start-infinite').click();
  await page.waitForFunction(() => !!(window as any).game?.run?.endless);
  const warning = await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    g.run.waveIndex = 3;
    g.run.waveElapsed = g.run.definition.seconds - 4.2;
    g.updateHUD();
    return {
      title: document.querySelector('#welcome h2')!.textContent,
      detail: document.querySelector('#welcome p')!.textContent,
      highlighted: document.getElementById('welcome')!.classList.contains('flag-wave-warning'),
    };
  });
  expect(warning.title).toContain('旗帜大波即将来袭');
  expect(warning.detail).toContain('5 秒');
  expect(warning.detail).toContain('快速怪、重甲、爆孢与晶屑混编');
  expect(warning.highlighted).toBe(true);

  const arrival = await page.evaluate(() => {
    const g = (window as any).game;
    g.run.waveIndex = 4; g.run.waveElapsed = 0; g.updateHUD();
    return {
      title: document.querySelector('#welcome h2')!.textContent,
      highlighted: document.getElementById('welcome')!.classList.contains('flag-wave-warning'),
    };
  });
  expect(arrival.title).toContain('旗帜大波');
  expect(arrival.highlighted).toBe(false);
});

test('Endless personal best is shown at game over and persists after reload', async ({ page }) => {
  await openHarness(page);
  await page.evaluate((key) => localStorage.removeItem(key), ENDLESS_RECORD_STORAGE_KEY);
  await page.reload();
  await page.waitForFunction(() => 'game' in window);
  await expect(page.locator('#endless-best-menu')).toContainText('首次挑战后记录');

  await page.locator('#start-infinite').click();
  await page.waitForFunction(() => !!(window as any).game?.run?.endless);
  const result = await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    g.run.waveIndex = 11;
    g.run.bossesDefeated = 2;
    g.run.combatElapsed = 900;
    g.run.restElapsed = 150;
    g.endRun('defeat');
    return {
      title: document.getElementById('endless-record-title')!.textContent,
      current: document.getElementById('endless-record-current')!.textContent,
      best: document.getElementById('endless-record-best')!.textContent,
      hidden: (document.getElementById('endless-record-result') as HTMLElement).hidden,
    };
  });
  expect(result.hidden).toBe(false);
  expect(result.title).toContain('新纪录');
  expect(result.current).toContain('第 12 波');
  expect(result.current).toContain('第 2 轮');
  expect(result.current).toContain('17:30');
  expect(result.best).toContain('击败 Boss 2 个');

  await page.reload();
  await page.waitForFunction(() => 'game' in window);
  await expect(page.locator('#endless-best-menu')).toContainText('第 12 波 / 第 2 轮');
  await expect(page.locator('#endless-best-menu')).toContainText('Boss 2');
  await expect(page.locator('#endless-best-menu')).toContainText('17:30');
});
