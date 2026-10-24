import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, WAVE_INTERMISSION_SECONDS } from '../src/run-flow';
import { ATTACKS } from '../src/run-build';
import { WEAPON_CARDS, type SkillId } from '../src/progression';
import type { BaseAttackId } from '../src/fusion';
import { RunShop } from '../src/shop';

const origin = { x: 0, z: 0 };
const weapons = Object.keys(ATTACKS) as BaseAttackId[];
function fixture(mode: 'campaign' | 'endless' = 'endless', wave = 1) {
  const combat = new Combat([], 32, () => .999);
  combat.party = new PartySystem(); combat.fusionEnabled = true; combat.reset();
  combat.automaticSpawning = false;
  const run = new RunFlow(() => .5, mode);
  run.waveIndex = wave - 1; run.prepare(combat, origin);
  return { combat, run, build: combat.runBuild, progression: combat.progression };
}
function fill(combat: Combat, limit: number) {
  for (const id of weapons) {
    if (combat.runBuild.attacks.length === limit) break;
    if (!combat.runBuild.hasOrigin(id)) expect(combat.grantUpgrade(`${id}-weapon` as SkillId)).toBe(true);
  }
}

for (const [wave, limit] of [[1, 4], [6, 4], [7, 6], [12, 6], [13, 8], [60, 8]]) {
  test(`Endless wave ${wave} enforces ${limit} slots and filters acquisition without hiding upgrades`, () => {
    const { combat, build, progression } = fixture('endless', wave);
    expect(build.weaponLimit).toBe(limit);
    fill(combat, limit);
    expect(new Set(build.attacks.map(a => a.slot)).size).toBe(limit);
    const missing = weapons.find(id => !build.hasOrigin(id))!;
    expect(build.acquire(missing)).toBe(false);
    expect(progression.canGrant(`${missing}-weapon` as SkillId)).toBe(false);
    expect(progression.skills.filter(s => WEAPON_CARDS[s.id]).every(s => build.hasOrigin(WEAPON_CARDS[s.id]!))).toBe(true);
    expect(combat.grantUpgrade('spark-weapon')).toBe(true);
    expect(build.attacks[0].level).toBe(2);
  });
}

for (const [wave, nextLimit] of [[6, 6], [12, 8]]) {
  test(`Boss intermission ${wave} unlocks capacity and restores weapon growth budget immediately`, () => {
    const { combat, run, build, progression } = fixture('endless', wave);
    fill(combat, build.weaponLimit);
    const missing = weapons.find(id => !build.hasOrigin(id))!;
    const maxLevel = progression.maxLevel;
    run.phase = 'intermission'; run.intermissionRemaining = WAVE_INTERMISSION_SECONDS;
    run.updateRest(WAVE_INTERMISSION_SECONDS, combat);
    expect(run.wave).toBe(wave + 1);
    expect(build.weaponLimit).toBe(nextLimit);
    expect(progression.maxLevel).toBeGreaterThan(maxLevel);
    expect(progression.canGrant(`${missing}-weapon` as SkillId)).toBe(true);
    const shop = new RunShop(combat, 1, () => 0, 0, run.cycleIndex);
    const index = shop.items.findIndex(s => s.skill && WEAPON_CARDS[s.skill] && !build.hasOrigin(WEAPON_CARDS[s.skill]!));
    expect(index).toBeGreaterThanOrEqual(0);
    const purchased = WEAPON_CARDS[shop.items[index].skill!]!;
    expect(shop.buy(index, shop.token, 10000)).toBeLessThan(10000);
    expect(build.has(purchased)).toBe(true);
  });
}

test('campaign continuation preserves weapons and opens six slots; restart restores campaign limit', () => {
  const { combat, run, build } = fixture('campaign', 6);
  fill(combat, 3);
  expect(build.weaponLimit).toBe(3);
  expect(build.acquire('flame-sweep')).toBe(false);
  const previous = [...build.attacks];
  run.phase = 'won'; run.completedWaves = 6; run.bossDefeated = true;
  expect(run.continueEndless(combat, origin)).toBe(true);
  expect(run.wave).toBe(7); expect(build.weaponLimit).toBe(6);
  expect(build.attacks).toEqual(previous);
  fill(combat, 6);
  combat.reset();
  expect(build.weaponLimit).toBe(3); expect(build.attacks).toHaveLength(1);
  new RunFlow(() => .5, 'endless').prepare(combat, origin);
  expect(build.weaponLimit).toBe(4);
});

test('fusion at eight slots frees a reusable slot and keeps consumed sources unavailable', () => {
  const { combat, build, progression } = fixture('endless', 13);
  fill(combat, 8);
  for (const attack of build.attacks) attack.level = 3;
  expect(build.fusePair('bramble-tide')).toBe(true);
  expect(build.attacks).toHaveLength(7);
  expect(build.acquire('bubble')).toBe(false); expect(build.acquire('leaf')).toBe(false);
  expect(progression.skills.some(s => s.id === 'bubble-weapon')).toBe(false);
  expect(combat.grantUpgrade('dream-dart-weapon')).toBe(true);
  expect(build.attacks).toHaveLength(8);
  expect(build.attacks.find(a => a.attackId === 'dream-dart')!.slot).toBe(2);
  expect(new Set(build.attacks.map(a => a.slot)).size).toBe(8);
});

test('eight equipped weapons actually cast within the existing projectile pool', () => {
  const { combat, build } = fixture('endless', 13);
  fill(combat, 8);
  combat.encounters.enabled = false; combat.endlessRoster = undefined; combat.invulnerability = 10000;
  const target = combat.spawn('tank', 2, 0, 0)!;
  target.hp = target.maxHp = 1000000; target.spawnTime = 0; target.stagger = 10000;
  for (let i = 0; i < 1200; i++) combat.update(1 / 120, origin);
  expect(build.attacks.every(a => a.shotsFired > 0)).toBe(true);
  expect(target.hp).toBeLessThan(target.maxHp);
  expect(combat.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);
});

test('small-screen build panel renders eight weapons and refreshes the capacity label across waves', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { RunBuild, ATTACKS } = await import('/src/run-build.ts');
    const { renderBuildSummary } = await import('/src/ui.ts');
    const b = new RunBuild(); b.reset('yanrong'); b.configureWeaponSlots(true, 7);
    renderBuildSummary(b, []);
    b.configureWeaponSlots(true, 13); renderBuildSummary(b, []);
    for (const id of Object.keys(ATTACKS)) if (b.attacks.length < 8 && !b.has(id)) b.acquire(id);
    renderBuildSummary(b, []);
    document.getElementById('pause-screen')!.hidden = false;
  });
  await expect(page.locator('#build-weapons .build-weapon-capacity')).toHaveText('武器槽 8 / 8');
  await expect(page.locator('#build-weapons > .build-weapon')).toHaveCount(8);
  await page.locator('#build-weapons > .build-weapon').last().scrollIntoViewIfNeeded();
  await expect(page.locator('#build-weapons > .build-weapon').last()).toBeInViewport();
  await page.screenshot({ path: 'artifacts/endless-weapon-slots-phone.png' });
});
