import { test, expect } from '@playwright/test';
import { Combat, type Enemy } from '../src/combat';
import { PartySystem } from '../src/party';
import { ATTACKS } from '../src/run-build';
import { FROST_RULES } from '../src/frost-combat';
import { matchesTarget } from '../src/content/relic-effects';
import { SKILL_SOUNDS } from '../src/sound-design';

function fixture(level = 1) {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset(['yanrong']);
  c.fusionEnabled = true; c.reset(); c.automaticSpawning = false; c.invulnerability = 10000;
  c.grantUpgrade('bubble-weapon'); for (let i = 0; i < level; i++) expect(c.grantUpgrade('frost-crystal-weapon')).toBe(true);
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  return c;
}
function target(c: Combat, x = 3, z = 0) { const e = c.spawn('normal', x, z, 0)!; e.hp = 10000; return e; }
function emit(c: Combat, enemy: Enemy, attack: 'bubble' | 'frost-crystal') {
  const rules = c.runBuild.rules(attack);
  expect((c as any).fireBolts({ x: 0, z: 0 }, enemy, ATTACKS[attack].damage * rules.damageMultiplier, 1, 10.5, 0, 'yanrong', attack)).toBe(true);
  const shot = c.projectiles.find(p => p.active && p.attackId === attack)!;
  for (let i = 0; i < 150 && shot.active; i++) c.update(1 / 120, { x: 0, z: 0 });
}

for (const order of [['bubble', 'frost-crystal'], ['frost-crystal', 'bubble']] as const) {
  test(`${order.join(' then ')} freezes only after real projectile collisions`, () => {
    const c = fixture(), enemy = target(c);
    emit(c, enemy, order[0]); expect(enemy.freezeTime ?? 0).toBe(0);
    emit(c, enemy, order[1]);
    expect(enemy.freezeTime).toBeGreaterThan(1); expect(enemy.wetTime).toBe(0);
    expect(c.frost.telemetry.freezes).toBe(1); expect(c.soundEvents & SKILL_SOUNDS.frost).toBeGreaterThan(0);
    const position = { x: enemy.x, z: enemy.z };
    c.update(.25, { x: 0, z: 0 }); expect({ x: enemy.x, z: enemy.z }).toEqual(position);
  });
}

test('ice alone chills, and expired wet/chill cannot freeze', () => {
  const c = fixture(), enemy = target(c);
  emit(c, enemy, 'frost-crystal'); expect(c.frost.slowFactor(enemy)).toBe(.65); expect(enemy.freezeTime).toBe(0);
  c.update(1.7, { x: 0, z: 0 });
  emit(c, enemy, 'bubble'); expect(enemy.freezeTime).toBe(0);
});

test('repeated water and ice hits cannot refresh freeze or bypass post-thaw immunity', () => {
  const c = fixture(), enemy = target(c);
  emit(c, enemy, 'bubble'); emit(c, enemy, 'frost-crystal');
  const oldTime = enemy.freezeTime!;
  emit(c, enemy, 'bubble'); emit(c, enemy, 'frost-crystal');
  expect(enemy.freezeTime).toBeLessThan(oldTime); expect(c.frost.telemetry.freezes).toBe(1);
  c.update(1.4, { x: 0, z: 0 }); expect(enemy.freezeTime).toBe(0); expect(enemy.freezeImmuneTime).toBeGreaterThan(0);
  emit(c, enemy, 'bubble'); emit(c, enemy, 'frost-crystal');
  expect(c.frost.telemetry.freezes).toBe(1);
  c.update(2.6, { x: 0, z: 0 }); emit(c, enemy, 'bubble'); emit(c, enemy, 'frost-crystal');
  expect(c.frost.telemetry.freezes).toBe(2);
});

test('elites freeze briefly and bosses only receive slow', () => {
  const c = fixture(), elite = target(c), boss = target(c, 3, 3);
  elite.rank = 'elite'; boss.rank = 'boss';
  emit(c, elite, 'bubble'); emit(c, elite, 'frost-crystal');
  expect(elite.freezeTime).toBeCloseTo(FROST_RULES.eliteFreeze, 1);
  emit(c, boss, 'bubble'); emit(c, boss, 'frost-crystal');
  expect(boss.freezeTime).toBe(0); expect(c.frost.slowFactor(boss)).toBe(.85); expect(c.frost.telemetry.bossResists).toBe(1);
});

test('frozen melee cannot damage the player and an elite warning is interrupted', () => {
  const c = fixture(); c.encounters.beginWave(4);
  const elite = c.encounters.spawnElite(c, { x: 0, z: 0 })!;
  Object.assign(elite, { x: 1.5, z: 0, previousX: 1.5, previousZ: 0, spawnTime: 0, hp: 10000 });
  c.encounters.elitePulsing = true; c.encounters.eliteTime = .5;
  emit(c, elite, 'bubble'); emit(c, elite, 'frost-crystal');
  expect(c.encounters.elitePulsing).toBe(false); expect(elite.freezeTime).toBeGreaterThan(0);
  c.invulnerability = 0; const hp = c.hp;
  c.update(.1, { x: elite.x, z: elite.z }); expect(c.hp).toBe(hp);
});

test('cover and spawn protection block ice collisions, and reused enemy slots lose all frost state', () => {
  const c = fixture(), enemy = target(c); enemy.wetTime = 2.4;
  c.obstacles = [{ x: 1.5, z: 0, radius: .5 }]; emit(c, enemy, 'frost-crystal');
  expect(enemy.hp).toBe(10000); expect(c.frost.telemetry.freezes).toBe(0);
  c.obstacles = []; enemy.spawnTime = 3; emit(c, enemy, 'frost-crystal');
  expect(c.frost.telemetry.iceHits).toBe(0);
  enemy.freezeTime = 1; enemy.chillTime = 1; enemy.freezeImmuneTime = 3; enemy.active = false;
  const reused = target(c, 4); expect(reused).toBe(enemy);
  expect(reused.freezeTime).toBe(0); expect(reused.chillTime).toBe(0); expect(reused.freezeImmuneTime).toBe(0);
});

test('five-level ice pierces at most three enemies with correct elemental identity and bounded resources', () => {
  const c = fixture(5), enemies = [target(c, 3), target(c, 4), target(c, 5), target(c, 6)];
  for (const e of enemies) e.wetTime = 2.4;
  emit(c, enemies[0], 'frost-crystal');
  expect(enemies.filter(e => e.hp < 10000)).toHaveLength(3); expect(c.frost.telemetry.freezes).toBe(3);
  expect(c.grantUpgrade('frost-crystal-weapon')).toBe(false);
  for (const element of ['fire-weapon', 'water-weapon', 'grass-weapon'] as const)
    expect(matchesTarget(element, 'frost-crystal', c.runBuild.relicContext)).toBe(false);
  c.clearTransientEffects(); expect(c.frost.inspect()).toMatchObject({ effects: 0, frozen: [] });
  c.reset(); expect(c.frost.telemetry.iceHits).toBe(0);
});
