import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { WATER_AOE_IDS, waterStats } from '../src/water-aoe';
function fixture(species: SpeciesId = 'yanrong') {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset([species]);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  return c;
}
const origin = { x: 0, z: 0 };
const advance = (c: Combat, dt: number) => c.waterAoe.update(dt, {}, 1);
const enemy = (c: Combat, x: number, z = 0) => { const e = c.spawn('normal', x, z, 0)!; e.hp = 1000; return e; };

test('water burst has real disk damage, warning, rank multipliers, wet status and once-only hits', () => {
  const c = fixture(), inside = enemy(c, 3.49), outside = enemy(c, 3.51), elite = enemy(c, 1), boss = enemy(c, -1);
  elite.rank = 'elite'; boss.rank = 'boss';
  const unborn = enemy(c, 0, 1); unborn.spawnTime = 1;
  c.waterAoe.cast('azure-burst', 1, 1, origin); advance(c, .15); expect(inside.hp).toBe(1000);
  advance(c, .02); expect([inside.hp, outside.hp, elite.hp, boss.hp, unborn.hp]).toEqual([950, 1000, 965, 980, 1000]);
  expect(inside.wetTime).toBeGreaterThan(0); advance(c, .5); expect(inside.hp).toBe(950);
  c.clearTransientEffects(); inside.hp = 1;
  c.waterAoe.cast('azure-burst', 1, 1, origin); advance(c, .2);
  expect(c.kills).toBe(1); expect(c.goldEarned).toBe(1);
  expect(c.orbs.reduce((n, o) => n + (o.active ? o.value : 0), 0)).toBe(3);
  expect(c.areaDeaths.some(e => e.active && e.enemyId === inside.id)).toBe(true);
});

test('pulse sweeps annuli rather than repeatedly damaging a filled disk, with independent level-five waves', () => {
  const c = fixture(), near = enemy(c, .5), far = enemy(c, 3), outside = enemy(c, 5);
  c.waterAoe.cast('star-tide', 1, 1, origin); advance(c, .05);
  expect(near.hp).toBe(980); expect(far.hp).toBe(1000);
  advance(c, .5); expect(far.hp).toBe(980); expect(near.hp).toBe(980); expect(outside.hp).toBe(1000);
  const late = enemy(c, .5); advance(c, .2); expect(late.hp).toBe(1000);
  c.clearTransientEffects(); for (const e of c.enemies) e.active = false;
  const target = enemy(c, 1); c.waterAoe.cast('star-tide', 5, 1, origin); advance(c, 1.2);
  expect(target.hp).toBeCloseTo(1000 - waterStats('star-tide', 5).damage * 3);
});

test('fields tick at fixed cadence without overlap stacking, while the aura follows its caster', () => {
  const c = fixture(), target = enemy(c, 0), outside = enemy(c, 3.31);
  c.waterAoe.cast('still-sea', 1, 1, origin); c.waterAoe.cast('still-sea', 1, 1, origin);
  advance(c, 1.5); expect(target.hp).toBe(976); expect(outside.hp).toBe(1000); expect(target.slowTime).toBe(.6);
  advance(c, 2.5); expect(target.hp).toBe(936); expect(c.waterAoe.inspect().active).toHaveLength(0);
  c.waterAoe.cast('returning-ring', 1); advance(c, .5); expect(target.hp).toBe(930);
  c.anchorX = 8; const next = enemy(c, 8); advance(c, 1.5);
  expect(target.hp).toBe(930); expect(next.hp).toBe(982);
  expect(c.waterAoe.inspect().active[0].x).toBe(8);
});

test('all water pools, reaction nodes and lifecycle state remain bounded under saturation', () => {
  const c = fixture(); c.grantUpgrade('bubble-weapon'); c.grantUpgrade('draft-bubble-spore');
  for (const id of WATER_AOE_IDS) { expect(c.waterAoe.cast(id, 5, 1, origin)).toBe(true); }
  expect(c.waterAoe.cast('returning-ring', 5, 1, origin)).toBe(false);
  for (const id of ['azure-burst', 'star-tide', 'still-sea'] as const) {
    expect(c.waterAoe.cast(id, 5, 1, origin)).toBe(true); expect(c.waterAoe.cast(id, 5, 1, origin)).toBe(false);
  }
  for (let i = 0; i < 256; i++) c.spawn('normal', i % 8 * .1, Math.floor(i / 8) * .05, 0)!.hp = 1;
  for (const e of c.effects) Object.assign(e, { active: true, time: 100 });
  advance(c, .2); expect(c.kills).toBe(256); expect(c.goldEarned).toBe(256);
  expect(c.waterAoe.inspect().capacity).toBe(7);
  expect(c.waterAoe.inspect().active.every(c => c.reactionNodes <= 24)).toBe(true);
  const before = JSON.stringify(c.waterAoe.inspect()); c.update(0, origin); expect(JSON.stringify(c.waterAoe.inspect())).toBe(before);
  c.hitPlayer(10000); expect(c.waterAoe.inspect().active).toHaveLength(0);
  c.reset(); expect(c.waterAoe.inspect().casts).toBe(0);
});

test('five-level water cards work for all three creatures and stay out of legacy modes', () => {
  for (const species of ['yanrong', 'bubblesalamander', 'sproutspike'] as SpeciesId[]) {
    const c = fixture(species), attack = c.baseAttack;
    for (const id of WATER_AOE_IDS) {
      for (let i = 0; i < 5; i++) expect(c.grantUpgrade(id)).toBe(true);
      expect(c.grantUpgrade(id)).toBe(false);
    }
    c.spawn('tank', 5, 0, 0); c.update(1 / 60, origin);
    expect(c.waterAoe.inspect().active).toHaveLength(4);
    expect(c.baseAttack).toBe(attack); expect(c.runBuild.attacks).toHaveLength(1);
  }
  expect(new Combat().progression.skills.some(s => WATER_AOE_IDS.includes(s.id as any))).toBe(false);
});
