import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { POSITION_IDS } from '../src/position-aoe';
const point = { x: 0, z: 0 };
function fixture(species: SpeciesId = 'yanrong') {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset([species]);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset(); c.runBuild.attacks[0].cooldown = 10000; return c;
}
function enemy(c: Combat, x: number, z = 0) { const e = c.spawn('normal', x, z, 0)!; e.hp = 1000; return e; }
const tick = (c: Combat, dt: number) => c.positionAoe.update(dt, {}, 1);

test('vortex pulls ordinary enemies, weakly pulls elites, never moves bosses or outside targets', () => {
  const c = fixture(), normal = enemy(c, 2), elite = enemy(c, 2), boss = enemy(c, 2), outside = enemy(c, 4);
  elite.rank = 'elite'; boss.rank = 'boss';
  c.positionAoe.cast('abyss-vortex', 1, 1, point); tick(c, .25);
  expect(normal.x).toBeCloseTo(1.6); expect(elite.x).toBeCloseTo(1.9125); expect(boss.x).toBe(2); expect(outside.x).toBe(4);
  tick(c, .25); expect(normal.hp).toBe(992); expect(elite.hp).toBeCloseTo(994.4); expect(boss.hp).toBeCloseTo(996.8);
});

test('radiance respects ray gaps, once-only hits, existing circle centers and alternating ring casts', () => {
  const c = fixture(), aligned = enemy(c, 3), gap = enemy(c, Math.cos(Math.PI / 8) * 3, Math.sin(Math.PI / 8) * 3);
  c.positionAoe.cast('ice-radiance', 1, 1, point);
  c.positionAoe.casts.find(c => c.active)!.angle = 0; // Fixed orientation; auto-aim may select either equally distant fixture enemy.
  tick(c, .23); expect(aligned.hp).toBe(1000);
  tick(c, .02); expect(aligned.hp).toBe(968); expect(gap.hp).toBe(1000);
  tick(c, .3); expect(aligned.hp).toBe(968);
  c.clearTransientEffects(); c.positionAoe.cast('ice-radiance', 1, 1, point); tick(c, .8);
  expect(c.positionAoe.inspect().active[0].mode).toBe('ring'); expect(aligned.hp).toBe(936); expect(gap.hp).toBe(968);
  c.clearTransientEffects(); c.waterAoe.cast('still-sea', 1, 1, { x: 5, z: 1 }); c.positionAoe.cast('ice-radiance');
  expect(c.positionAoe.inspect().active[0]).toMatchObject({ x: 5, z: 1 });
});

test('trails require movement, overlap damage is capped and full pools replace the oldest patch', () => {
  const c = fixture(), ranks = { 'spore-trail': 1 };
  c.positionAoe.update(.1, ranks, 1); c.positionAoe.update(.5, ranks, 1); expect(c.positionAoe.inspect().active).toHaveLength(0);
  c.anchorX = 1.3; c.positionAoe.update(.1, ranks, 1); expect(c.positionAoe.inspect().active).toHaveLength(1);
  expect(c.positionAoe.inspect().active[0].x).toBe(0);
  const target = enemy(c, 0); tick(c, .4); expect(target.hp).toBe(993);
  c.positionAoe.cast('spore-trail', 1, 1, point); tick(c, .5); expect(target.hp).toBe(986);
  c.clearTransientEffects();
  for (let i = 0; i < 16; i++) c.positionAoe.cast('spore-trail', 1, 1, point);
  const oldest = c.positionAoe.inspect().active[0].castId;
  c.positionAoe.cast('spore-trail', 1, 1, point);
  expect(c.positionAoe.inspect().active).toHaveLength(16);
  expect(c.positionAoe.inspect().active.some(c => c.castId === oldest)).toBe(false);
  expect(c.positionAoe.inspect().replacedTrails).toBe(1);
});

test('recall damages once per direction and attracts swept experience without creating or duplicating XP', () => {
  const c = fixture(), target = enemy(c, 2), outside = enemy(c, 6);
  Object.assign(c.orbs[0], { active: true, x: 2, z: 0, previousX: 2, previousZ: 0, value: 11, magnetized: false });
  Object.assign(c.orbs[1], { active: true, x: 8, z: 0, value: 19, magnetized: false });
  c.positionAoe.cast('tidal-recall', 1, 1, point); tick(c, .45);
  expect(target.hp).toBe(974); expect(c.orbs[0].magnetized).toBe(false);
  tick(c, .45); tick(c, .5); expect(target.hp).toBe(948); expect(outside.hp).toBe(1000);
  expect(c.orbs[0].magnetized).toBe(true); expect(c.orbs[1].magnetized).toBe(false); expect(c.xp).toBe(0);
  tick(c, .2); expect(target.hp).toBe(948);
  for (let i = 0; i < 60; i++) c.update(1 / 60, point);
  expect(c.xp).toBe(11); expect(c.orbs[0].active).toBe(false); expect(c.orbs[1].value).toBe(19);
  c.reset(); const e = enemy(c, 2); c.positionAoe.cast('tidal-recall', 1, 1, point); tick(c, 1.7);
  expect(e.hp).toBe(948); // A coarse step crossing the turnaround still resolves both phases once.
});

test('five-level cards work for all creatures, attack pools stay bounded and death/reset clear new state', () => {
  for (const species of ['yanrong', 'bubblesalamander', 'sproutspike'] as SpeciesId[]) {
    const c = fixture(species), base = c.baseAttack;
    for (const id of POSITION_IDS) { for (let i = 0; i < 5; i++) expect(c.grantUpgrade(id)).toBe(true); expect(c.grantUpgrade(id)).toBe(false); }
    c.spawn('tank', 5, 0, 0); c.update(1 / 60, point);
    expect(c.positionAoe.inspect().active).toHaveLength(3); expect(c.baseAttack).toBe(base); expect(c.projectiles).toHaveLength(24);
    expect(c.positionAoe.inspect().capacity).toBe(22);
    const before = JSON.stringify(c.positionAoe.inspect()); c.update(0, point); expect(JSON.stringify(c.positionAoe.inspect())).toBe(before);
    c.hitPlayer(10000); expect(c.positionAoe.inspect().active).toHaveLength(0);
    c.reset(); expect(c.positionAoe.inspect().casts).toBe(0);
  }
  const c = fixture(); c.positionAoe.cast('abyss-vortex', 1, 1, point); c.positionAoe.cast('abyss-vortex', 1, 1, point);
  expect(c.positionAoe.cast('abyss-vortex', 1, 1, point)).toBe(false);
  expect(new Combat().progression.skills.some(s => POSITION_IDS.includes(s.id as any))).toBe(false);
});
