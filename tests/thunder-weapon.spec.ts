import { test, expect } from '@playwright/test';
import { Combat, type WeaponSnapshot } from '../src/combat';
import { PartySystem } from '../src/party';
import { thunderStats } from '../src/thunder-weapon';
import { weaponCapabilities } from '../src/content/weapon-traits';
import { matchesTarget } from '../src/content/relic-effects';
import { SKILL_SOUNDS } from '../src/sound-design';

function fixture() {
  const c = new Combat([], 100, () => .5);
  c.party = new PartySystem(); c.party.reset(['yanrong']); c.fusionEnabled = true; c.reset();
  c.automaticSpawning = false; c.invulnerability = 10000;
  for (const attack of c.runBuild.attacks) attack.cooldown = 10000;
  return c;
}
function target(c: Combat, x: number, z = 0) { const e = c.spawn('normal', x, z, 0)!; e.hp = 10000; return e; }
function snapshot(c: Combat, level = 1): WeaponSnapshot {
  return { attackId: 'thunder-bud', damage: 22, range: 9, rules: c.runBuild.rules('thunder-bud'), fusions: [], lightning: { level } };
}

test('chain waits for charge, visits three unique targets and decays each hop', () => {
  const c = fixture(), a = target(c, 3), b = target(c, 4), d = target(c, 5), extra = target(c, 6);
  expect(c.thunder.cast(snapshot(c), a)).toBe(true);
  c.thunder.update(.11); expect(c.thunder.telemetry.hits).toBe(0);
  c.thunder.update(.01); expect(a.hp).toBe(9978); expect(b.hp).toBe(10000);
  expect(c.soundEvents & SKILL_SOUNDS.lightning).toBeGreaterThan(0);
  c.thunder.update(.09); expect(b.hp).toBeCloseTo(10000 - 22 * .82);
  c.thunder.update(.09); expect(d.hp).toBeCloseTo(10000 - 22 * .82 ** 2);
  c.thunder.update(1); expect(a.hp).toBe(9978); expect(extra.hp).toBe(10000);
  expect(c.thunder.telemetry.hits).toBe(3); expect(c.thunder.inspect().active).toHaveLength(0);
});

test('a single boss is struck once, even at max level', () => {
  const c = fixture(), boss = target(c, 3); boss.rank = 'boss';
  c.thunder.cast(snapshot(c, 5), boss); c.thunder.update(1);
  expect(boss.hp).toBe(9978); expect(c.thunder.telemetry.hits).toBe(1);
});

test('echo rune becomes available for intrinsic lightning chains and applies its distance and damage tradeoff', () => {
  const c = fixture(); c.grantUpgrade('thunder-bud-weapon');
  expect(c.grantUpgrade('echo-rune')).toBe(true);
  const a = target(c, 3), b = target(c, 7);
  c.thunder.cast(snapshot(c), a); c.thunder.update(.25);
  expect(a.hp).toBe(9978); expect(b.hp).toBeCloseTo(10000 - 22 * .82 * .7);
});

test('max level resolves six targets identically with coarse or fine time steps', () => {
  const results: number[][] = [];
  for (const fine of [false, true]) {
    const c = fixture(), enemies = Array.from({ length: 7 }, (_, i) => target(c, 3 + i));
    c.thunder.cast(snapshot(c, 5), enemies[0]);
    if (fine) for (let i = 0; i < 120; i++) c.thunder.update(1 / 120); else c.thunder.update(1);
    expect(c.thunder.telemetry.hits).toBe(6); expect(enemies[6].hp).toBe(10000);
    results.push(enemies.map(e => e.hp));
  }
  expect(results[0]).toEqual(results[1]);
});

test('cover, spawn immunity, dead targets and jump distance constrain the chain', () => {
  const c = fixture(), first = target(c, 3), behind = target(c, 5), spawning = target(c, 3.5), far = target(c, 9);
  spawning.spawnTime = 1; c.obstacles = [{ x: 4, z: 0, radius: .4 }];
  c.thunder.cast(snapshot(c), first); c.thunder.update(1);
  expect(first.hp).toBe(9978); expect(behind.hp).toBe(10000); expect(spawning.hp).toBe(10000); expect(far.hp).toBe(10000);
  c.thunder.clear(); c.obstacles = [];
  c.thunder.cast(snapshot(c), first); first.active = false;
  c.thunder.update(.12); expect(behind.hp).toBe(9978);
});

test('weapon acquisition, levels, electric identity and full projectile pools work through normal combat', () => {
  const c = fixture(); expect(c.grantUpgrade('thunder-bud-weapon')).toBe(true);
  for (let i = 1; i < 5; i++) expect(c.grantUpgrade('thunder-bud-weapon')).toBe(true);
  expect(c.grantUpgrade('thunder-bud-weapon')).toBe(false);
  expect(thunderStats(5).targets).toBe(6);
  expect(weaponCapabilities('thunder-bud').tags).toEqual(['electric', 'chain']);
  for (const element of ['fire-weapon', 'grass-weapon', 'water-weapon'] as const)
    expect(matchesTarget(element, 'thunder-bud', c.runBuild.relicContext)).toBe(false);
  for (const p of c.projectiles) Object.assign(p, { active: true, life: 100, x: -30, z: -30, damage: 0 });
  target(c, 3); c.runBuild.attacks.find(a => a.attackId === 'thunder-bud')!.cooldown = 0;
  c.update(.01, { x: 0, z: 0 }); expect(c.thunder.telemetry.casts).toBe(1);
  c.grantUpgrade('thorn-wheel-weapon'); expect(c.grantUpgrade('tidal-blade-weapon')).toBe(false);
});

test('bounded pools and copied chains release all state on death and reset', () => {
  const c = fixture(), enemy = target(c, 3);
  for (let i = 0; i < 4; i++) expect(c.thunder.cast(snapshot(c), enemy, true)).toBe(true);
  expect(c.thunder.cast(snapshot(c), enemy, true)).toBe(false);
  c.thunder.update(.15); expect(c.thunder.links.some(l => l.active)).toBe(true);
  c.invulnerability = 0; c.hitPlayer(10000);
  expect(c.thunder.inspect()).toMatchObject({ links: 0, impacts: 0, active: [] });
  c.reset(); expect(c.thunder.telemetry.casts).toBe(0);
});

test('real casts can echo without recursively increasing the primary cast counter', () => {
  const c = fixture(); c.grantUpgrade('thunder-bud-weapon'); c.grantUpgrade('draft-echo-bone-dice');
  const enemy = target(c, 3); enemy.hp = 1000000;
  for (let i = 0; i < 120 * 9; i++) {
    enemy.x = enemy.previousX = 3; enemy.z = enemy.previousZ = 0;
    c.update(1 / 120, { x: 0, z: 0 });
  }
  expect(c.relicTelemetry.echoes).toBeGreaterThan(0);
  const casts = c.runBuild.attacks.find(a => a.attackId === 'thunder-bud')!.shotsFired;
  expect(c.thunder.telemetry.casts).toBe(casts + c.relicTelemetry.echoes);
});
