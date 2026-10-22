import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { ICE_LIMITS, ICE_SKILL_IDS, iceSkillStats } from '../src/ice-skills';

function fixture() {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset(['yanrong']);
  c.fusionEnabled = true; c.reset(); c.automaticSpawning = false; c.invulnerability = 10000;
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  return c;
}
function enemy(c: Combat, x: number, z = 0) { const e = c.spawn('normal', x, z, 0)!; e.hp = 10000; return e; }

test('ice skill cards acquire five ranks without occupying a weapon slot or entering legacy pools', () => {
  const c = fixture(), slots = c.runBuild.attacks.length;
  for (const id of ICE_SKILL_IDS) {
    expect(c.progression.skills.some(s => s.id === id)).toBe(true);
    for (let i = 0; i < 5; i++) expect(c.grantUpgrade(id)).toBe(true);
    expect(c.grantUpgrade(id)).toBe(false); expect(c.progression.ranks[id]).toBe(5);
    expect(iceSkillStats(id, 5).damage).toBeGreaterThan(iceSkillStats(id, 1).damage);
  }
  expect(c.runBuild.attacks).toHaveLength(slots);
  c.fusionEnabled = false; c.reset();
  for (const id of ICE_SKILL_IDS) expect(c.progression.skills.some(s => s.id === id)).toBe(false);
});

test('ring sweeps outward once, rewards frozen targets and respects rank damage and spawn protection', () => {
  const c = fixture(), normal = enemy(c, 1), frozen = enemy(c, 2), elite = enemy(c, 0, 2), boss = enemy(c, -2), outside = enemy(c, 6), protectedEnemy = enemy(c, -1);
  frozen.freezeTime = frozen.freezeDuration = 1.25; frozen.freezeImmuneTime = 3.75;
  elite.rank = 'elite'; boss.rank = 'boss'; protectedEnemy.spawnTime = 2;
  c.iceSkills.castRing(1); c.iceSkills.update(.08, {}, 1);
  expect(normal.hp).toBeLessThan(10000); expect(frozen.hp).toBe(10000);
  c.iceSkills.update(.32, {}, 1);
  expect(normal.hp).toBe(9976); expect(frozen.hp).toBe(9964); expect(frozen.freezeTime).toBe(1.25);
  expect(elite.hp).toBeCloseTo(9983.2); expect(boss.hp).toBeCloseTo(9990.4);
  expect(outside.hp).toBe(10000); expect(protectedEnemy.hp).toBe(10000);
  c.iceSkills.update(.2, {}, 1); expect(normal.hp).toBe(9976);
  expect(c.iceSkills.inspect()).toMatchObject({ activeRings: 0, ringHits: 4, shatters: 1 });
});

test('ring cover blocks damage and ice skill hits combine with wet even without a frost weapon', () => {
  const c = fixture(), exposed = enemy(c, 0, 2), covered = enemy(c, 3);
  c.obstacles = [{ x: 1.5, z: 0, radius: .7 }]; exposed.wetTime = 2;
  c.iceSkills.castRing(1); c.iceSkills.update(.4, {}, 1);
  expect(exposed.freezeTime).toBe(1.25); expect(exposed.wetTime).toBe(0); expect(covered.hp).toBe(10000);
});

test('moving leaves distance-spaced trails, stationary and teleport steps do not paint ice, overlaps share one tick', () => {
  const c = fixture(), e = enemy(c, 2); e.wetTime = 2;
  const ranks = { 'glacier-trail': 1 };
  c.iceSkills.update(.1, ranks, 1);
  for (let i = 0; i < 3; i++) { c.anchorX++; c.iceSkills.update(.1, ranks, 1); }
  expect(c.iceSkills.inspect().activeTrails).toBe(3);
  c.iceSkills.update(.1, ranks, 1);
  expect(e.hp).toBe(9995); expect(e.freezeTime).toBe(1.25);
  expect(c.iceSkills.inspect().trailHits).toBe(1);
  c.iceSkills.update(.5, ranks, 1); expect(e.hp).toBe(9990);
  expect(c.iceSkills.inspect().trails).toBe(3);
  c.anchorX = 50; c.iceSkills.update(.01, ranks, 1); expect(c.iceSkills.inspect().trails).toBe(3);
  e.x = 20; c.iceSkills.update(4, ranks, 1); expect(e.hp).toBe(9990); expect(c.iceSkills.inspect().activeTrails).toBe(0);
});

test('trail pools replace the oldest, respect cover and release effects on clear and death', () => {
  const c = fixture(), e = enemy(c, 1);
  c.iceSkills.update(.001, { 'glacier-trail': 5 }, 1);
  for (let i = 0; i < 40; i++) { c.anchorX++; c.iceSkills.update(.001, { 'glacier-trail': 5 }, 1); }
  expect(c.iceSkills.inspect()).toMatchObject({ activeTrails: ICE_LIMITS.trails, replaced: 16 });
  c.clearTransientEffects(); expect(c.iceSkills.inspect()).toMatchObject({ activeTrails: 0, activeRings: 0 });
  c.anchorX = 0; c.iceSkills.update(.01, { 'glacier-trail': 1 }, 1);
  c.anchorX = 1; c.iceSkills.update(.01, { 'glacier-trail': 1 }, 1);
  e.x = 1.9; c.obstacles = [{ x: 1.45, z: 0, radius: .2 }];
  c.iceSkills.update(.5, {}, 1); expect(e.hp).toBe(10000);
  c.hp = 1; c.invulnerability = 0; c.obstacles = []; e.x = c.anchorX;
  c.update(.01, { x: c.anchorX, z: 0 }); expect(c.hp).toBe(0);
  expect(c.iceSkills.inspect()).toMatchObject({ activeTrails: 0, activeRings: 0 });
  c.reset(); expect(c.iceSkills.inspect().trails).toBe(0);
});
