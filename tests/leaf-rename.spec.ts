import { test, expect } from '@playwright/test';
import { ATTACKS, RunBuild } from '../src/run-build';
import { Progression, upgradePreview } from '../src/progression';

test('leaf weapon acquisition, strengthening and fusion previews use the projectile name', () => {
  const build = new RunBuild(); build.reset('yanrong');
  const progression = new Progression(); progression.reset(true); progression.build = build;
  expect(ATTACKS.leaf).toMatchObject({ title: '飞叶弹', kind: 'projectile', damage: 16, interval: .54 });
  const acquisition = progression.skills.find(skill => skill.id === 'leaf-weapon')!;
  expect(acquisition.title).toBe('获得飞叶弹');
  expect(acquisition.description).toContain('装备飞叶弹');
  expect(upgradePreview(acquisition, progression.ranks)).toContain('飞叶弹');
  build.acquire('leaf');
  const strengthening = progression.skills.find(skill => skill.id === 'leaf-weapon')!;
  expect(strengthening.title).toBe('飞叶弹强化');
  expect(strengthening.description).toContain('飞叶弹 3 级额外穿透');
  const split = progression.skills.find(skill => skill.id === 'split-on-hit')!;
  expect(split.description).toContain('飞叶弹形成荆棘散射');
  expect(upgradePreview(split, progression.ranks)).toContain('飞叶弹');
  expect(JSON.stringify(progression.skills)).not.toContain('叶刃');
});

test('grass selection and combat HUD show 飞叶弹 on both phone sizes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?world=fixed');
  await page.locator('#choose-creature').click();
  const grass = page.locator('[data-creature="sproutspike"]');
  await expect(grass).toContainText('飞叶弹 · 穿透连锁');
  await grass.click();
  await page.locator('#start-selected-creature').click();
  await expect(page.locator('#fusion-title')).toHaveText('飞叶弹');
  for (const width of [844, 568]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 320 });
    await expect(page.locator('#fusion-title')).toHaveText('飞叶弹');
    expect(await page.locator('#fusion-title').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await expect(page.locator('body')).not.toContainText('叶刃');
  expect(errors).toEqual([]);
});
