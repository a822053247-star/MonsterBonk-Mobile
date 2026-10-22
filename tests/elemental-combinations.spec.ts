import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { WATER_EVOLUTIONS, evolutionReady, prismSegment, type WaterEvolutionId } from '../src/water-evolution';
const point = { x: 0, z: 0 };
function fixture() {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset(['yanrong']);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset(); c.runBuild.attacks[0].cooldown = 10000; return c;
}
function enemy(c: Combat, x: number, z = 0) { const e = c.spawn('normal', x, z, 0)!; e.hp = 1000; return e; }
const tick = (c: Combat, dt: number) => c.waterEvolution.update(dt, {}, 1);

test('four recipes unlock, shared parents lock alternatives and walking still paints evolved footprints', () => {
  for (const id of ['undertow-pyre', 'deep-collapse', 'frost-prism', 'all-tides'] as WaterEvolutionId[]) {
    const c = fixture(), r = WATER_EVOLUTIONS[id]; expect(c.grantUpgrade(id)).toBe(false);
    for (let i = 0; i < 5; i++) c.grantUpgrade(r.main);
    for (let i = 0; i < 3; i++) c.grantUpgrade(r.support);
    expect(c.grantUpgrade(id)).toBe(true); expect(evolutionReady(id, c.progression.ranks)).toBe(false);
    c.update(.01, point); c.update(.25, { x: 1.3, z: 0 });
    expect(c.waterAoe.inspect().active).toHaveLength(0);
    if (id === 'undertow-pyre') expect(c.positionAoe.inspect().active.some(c => c.kind === 'spore-trail')).toBe(true);
    else expect(c.positionAoe.inspect().active).toHaveLength(0);
    expect(c.projectiles).toHaveLength(24);
    c.hitPlayer(10000); expect(c.waterEvolution.inspect().active).toHaveLength(0);
    expect(c.waterEvolution.ignitions.every(e => !e.active)).toBe(true);
  }
  expect(evolutionReady('deep-collapse', { 'azure-burst': 5, 'abyss-vortex': 3, 'tsunami-sanctuary': 1 })).toBe(false);
  expect(evolutionReady('all-tides', { 'star-tide': 5, 'tidal-recall': 3, 'undertow-pyre': 1 })).toBe(false);
});

test('undertow consumes at most eight patches, caps each target at two blasts and ignores full visual pools', () => {
  const c = fixture(), target = enemy(c, 2), outside = enemy(c, 12);
  for (let i = 0; i < 12; i++) c.positionAoe.cast('spore-trail', 5, 1, { x: 2, z: 0 });
  for (const effect of c.waterEvolution.ignitions) Object.assign(effect, { active: true, age: -10 });
  c.waterEvolution.cast('undertow-pyre', 1, point); tick(c, 1.1); expect(target.hp).toBe(972);
  tick(c, .9); expect(target.hp).toBe(800); // 28 outward + 28 return + two 72-damage ignitions.
  expect(outside.hp).toBe(1000); expect(c.positionAoe.inspect().active).toHaveLength(4);
  expect(c.waterEvolution.casts.find(c => c.active)!.triggers).toBe(8);
  tick(c, .1); expect(target.hp).toBe(800); expect(c.positionAoe.inspect().active).toHaveLength(4);
});

test('collapse pulls before its finisher, weakens elites, preserves boss position and never repeats its burst', () => {
  const c = fixture(), normal = enemy(c, 3), elite = enemy(c, 3), boss = enemy(c, 3), outside = enemy(c, 8);
  elite.rank = 'elite'; boss.rank = 'boss'; c.waterEvolution.cast('deep-collapse', 1, point); tick(c, .8);
  expect(normal.x).toBeCloseTo(1.8); expect(elite.x).toBeCloseTo(2.72); expect(boss.x).toBe(3);
  tick(c, .8); expect(normal.hp).toBe(810); expect(elite.hp).toBeCloseTo(867); expect(boss.hp).toBe(924);
  tick(c, .3); expect(normal.hp).toBe(810); expect(outside.hp).toBe(1000);
});

test('prism reflects each volley once across its interior with real gaps and bounded hit records', () => {
  const c = fixture(), aligned = enemy(c, 2), gap = enemy(c, 2 * Math.cos(Math.PI / 6), 2 * Math.sin(Math.PI / 6));
  const ray = prismSegment(point, 5.4, 0, 0, true);
  const reflected = enemy(c, ray.x + Math.cos(ray.angle) * 3, ray.z + Math.sin(ray.angle) * 3), outside = enemy(c, 7);
  c.waterEvolution.cast('frost-prism', 1, point); tick(c, .25);
  expect(aligned.hp).toBe(974); expect(gap.hp).toBe(1000);
  const before = reflected.hp; tick(c, .3); expect(reflected.hp).toBe(before - 12 - 32);
  const after = reflected.hp; tick(c, .2); expect(reflected.hp).toBe(after);
  tick(c, 3.85); expect(c.waterEvolution.inspect().rayRounds).toBe(8); expect(outside.hp).toBe(1000);
});

test('three tides deduplicate six passes, collect existing XP and finish only once even in a coarse step', () => {
  const c = fixture(), target = enemy(c, 2), outside = enemy(c, 10);
  Object.assign(c.orbs[0], { active: true, x: 2, z: 0, value: 13, magnetized: false });
  Object.assign(c.orbs[1], { active: true, x: 10, z: 0, value: 19, magnetized: false });
  c.waterEvolution.cast('all-tides', 1, point); tick(c, 2.7);
  expect(target.hp).toBe(730); expect(outside.hp).toBe(1000);
  expect(c.orbs[0].magnetized).toBe(true); expect(c.orbs[0].value).toBe(13); expect(c.orbs[1].magnetized).toBe(false);
  tick(c, .1); expect(target.hp).toBe(730);
  c.clearTransientEffects(); expect(c.waterEvolution.inspect().active).toHaveLength(0);
  c.reset(); expect(c.waterEvolution.inspect().casts).toBe(0);
});
