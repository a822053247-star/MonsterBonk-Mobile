import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import type { SkillId } from '../src/progression';
import { BURST_SEED, resolveFusion } from '../src/fusion';

const STEP = 1 / 60, origin = { x: 0, z: 0 };
function fixture(fusion = true) {
  const rolls: number[] = [], combat = new Combat([], 32.3, () => rolls.shift() ?? .999);
  combat.party = new PartySystem(); combat.fusionEnabled = fusion; combat.reset();
  const learn = (id: SkillId) => {
    const p = combat.progression, candidates = p.skills.filter(s => p.ranks[s.id] < s.maxRank), index = candidates.findIndex(s => s.id === id);
    for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + .1) / (i + 1));
    p.gainExperience(p.threshold - p.experience);
    expect(p.offers).toContain(id); expect(combat.chooseUpgrade(id)).toBe(true);
  };
  return { combat, learn };
}
function encounter(combat: Combat) {
  const target = combat.spawn('tank', 5, 0, 0)!;
  combat.update(STEP, origin);
  const main = combat.projectiles.find(s => s.active)!;
  Object.assign(main, { x: 3.7, previousX: 3.7, z: 0, previousZ: 0, vx: 18, vz: 0 });
  const upper = combat.spawn('tank', 4.2, 1.4, 0)!, lower = combat.spawn('tank', 4.2, -1.4, 0)!;
  return { target, main, upper, lower };
}

test('ordinary spark uses existing automatic attacks and never splits without its card', () => {
  const { combat } = fixture(); const e = encounter(combat); combat.update(.05, origin);
  expect(e.target.hp).toBe(82); expect(e.upper.hp).toBe(100); expect(e.lower.hp).toBe(100);
  expect(combat.bursts).toBe(0); expect(combat.childShots).toBe(0);
});

test('real split card resolves the matching spark and leaf recipes; historical card pools stay unchanged', () => {
  const { combat, learn } = fixture(); expect(combat.fusion).toBeUndefined(); learn('split-on-hit');
  expect(combat.fusion?.id).toBe('burst-seed'); expect(combat.stats.splitOnHit).toBe(1);
  expect(resolveFusion('bubble', combat.progression.ranks)).toBeUndefined();
  expect(resolveFusion('leaf', combat.progression.ranks)?.id).toBe('thorn-scatter');
  expect(fixture(false).combat.progression.skills.some(s => s.id === 'split-on-hit')).toBe(false);
});

test('one main hit damages its target once, explodes once over multiple other targets, and defers two children', () => {
  const { combat, learn } = fixture(); learn('split-on-hit'); const e = encounter(combat);
  combat.update(.05, origin);
  expect(e.target.hp).toBe(82); expect(e.upper.hp).toBeCloseTo(94.6); expect(e.lower.hp).toBeCloseTo(94.6);
  expect(combat.bursts).toBe(1); expect(combat.hits).toBe(3);
  const children = combat.projectiles.filter(s => s.active && s.generation === 1);
  expect(children).toHaveLength(2);
  for (const s of children) { expect(s.distance).toBe(0); expect(s.age).toBe(0); expect(s.burst).toBe(false); expect(s.ignoreEnemyId).toBe(e.target.id); expect(s.damage).toBeCloseTo(6.3); }
  const hp = e.upper.hp; combat.update(.001, origin);
  expect(e.upper.hp).toBe(hp); expect(e.target.hp).toBe(82); expect(combat.bursts).toBe(1);
});

test('children can damage other enemies, never hit the original and never generate another explosion or generation', () => {
  const { combat, learn } = fixture(); learn('split-on-hit'); const e = encounter(combat); combat.update(.05, origin);
  const children = combat.projectiles.filter(s => s.active && s.generation === 1);
  for (const [i, child] of children.entries()) {
    const victim = i ? e.lower : e.upper;
    Object.assign(child, { x: victim.x, z: victim.z, previousX: victim.x, previousZ: victim.z });
  }
  combat.update(STEP, origin);
  expect(e.upper.hp).toBeCloseTo(88.3); expect(e.lower.hp).toBeCloseTo(88.3); expect(e.target.hp).toBe(82);
  expect(combat.bursts).toBe(1); expect(combat.childShots).toBe(2);
  expect(combat.projectiles.filter(s => s.active)).toHaveLength(0);
});

test('multishot and hit splitting coexist without replacing each other', () => {
  const { combat, learn } = fixture(); learn('multishot'); learn('split-on-hit');
  combat.spawn('tank', 5, 0, 0); combat.update(STEP, origin);
  // Formal volleys fire their extra shots in sequence, not in the same tick.
  combat.update(.08,origin);
  const shots = combat.projectiles.filter(s => s.active);
  expect(shots).toHaveLength(2); expect(shots.every(s => s.generation === 0 && s.burst)).toBe(true);
  expect(combat.stats.projectileCount).toBe(2); expect(combat.stats.splitOnHit).toBe(1);
});

test('full projectile and effect pools preserve direct/AoE damage and degrade to available child slots', () => {
  const { combat, learn } = fixture(); learn('split-on-hit'); const e = encounter(combat);
  for (const s of combat.projectiles) if (s !== e.main) Object.assign(s, { active: true, x: 20, z: 20, vx: 0, vz: 0, life: 10, damage: 0, burst: false, generation: 0 });
  for (const effect of combat.effects) Object.assign(effect, { active: true, time: 10, duration: 10, kind: 'hit' });
  expect(() => combat.update(.05, origin)).not.toThrow();
  expect(e.target.hp).toBe(82); expect(e.upper.hp).toBeCloseTo(94.6); expect(combat.childShots).toBe(1);
  expect(combat.projectiles.filter(s => s.active)).toHaveLength(COMBAT_LIMITS.projectiles);
  expect(combat.effects.filter(e => e.active)).toHaveLength(COMBAT_LIMITS.effects);
});

test('kill credit and experience use the shared damage path exactly once for blast victims', () => {
  const { combat, learn } = fixture(); learn('split-on-hit'); const e = encounter(combat);
  e.target.hp = 1; e.upper.hp = e.lower.hp = 5;
  combat.update(.05, origin);
  expect(combat.kills).toBe(3); expect(combat.orbs.filter(o => o.active).reduce((sum, o) => sum + o.value, 0)).toBe(24);
  combat.update(STEP, origin); expect(combat.kills).toBe(3);
});

test('choice and death freeze all damage, children and effect ages; restart clears the run', () => {
  const { combat, learn } = fixture(); learn('split-on-hit'); encounter(combat); combat.update(.05, origin);
  combat.progression.gainExperience(combat.progression.threshold);
  const frozen = JSON.stringify([combat.inspect(), combat.projectiles, combat.effects]);
  for (let i = 0; i < 60; i++) combat.update(STEP, origin);
  expect(JSON.stringify([combat.inspect(), combat.projectiles, combat.effects])).toBe(frozen);
  combat.chooseUpgrade(combat.progression.offers[0]); combat.hp = 0;
  const dead = JSON.stringify([combat.inspect(), combat.projectiles, combat.effects]); combat.update(1, origin);
  expect(JSON.stringify([combat.inspect(), combat.projectiles, combat.effects])).toBe(dead);
  combat.reset(); expect(combat.fusion).toBeUndefined(); expect(combat.childShots + combat.bursts).toBe(0);
  expect(combat.projectiles.some(s => s.active) || combat.effects.some(e => e.active)).toBe(false);
  expect(combat.progression.ranks['split-on-hit']).toBe(0);
});

test('hundreds of fused hits stay inside original pools with generation capped at one', () => {
  const { combat, learn } = fixture(); learn('split-on-hit'); learn('multishot');
  for (let i = 0; i < 1200; i++) {
    if (i % 30 === 0) { combat.spawn('tank', 5, 0, 0); combat.spawn('tank', 5, 1.3, 0); }
    combat.hp = 100; combat.update(STEP, origin);
    if (combat.progression.awaitingChoice) combat.chooseUpgrade(combat.progression.offers[0]);
    expect(combat.projectiles.length).toBe(24);
    expect(combat.projectiles.every(s => !s.active || (s.generation ?? 0) <= BURST_SEED.maxGeneration)).toBe(true);
  }
  expect(combat.bursts).toBeGreaterThan(10); expect(combat.effects.length).toBe(48);
});
