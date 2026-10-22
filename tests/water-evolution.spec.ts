import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { WATER_EVOLUTION_IDS, WATER_EVOLUTIONS } from '../src/water-evolution';
import type { SkillId } from '../src/progression';
const point = { x: 0, z: 0 };
function fixture() {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset(['bubblesalamander']);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset(); c.runBuild.attacks[0].cooldown = 10000; return c;
}
function enemy(c: Combat, x: number, z = 0) { const e = c.spawn('normal', x, z, 0)!; e.hp = 1000; return e; }
const tick = (c: Combat, dt: number) => c.waterEvolution.update(dt, {}, 1);

test('recipes gate upgrades, appear next choice, coexist and replace only their own parents', () => {
  const c = fixture();
  for (const id of WATER_EVOLUTION_IDS) {
    const r = WATER_EVOLUTIONS[id]; expect(c.grantUpgrade(id)).toBe(false);
    for (let i = 0; i < 5; i++) expect(c.grantUpgrade(r.main)).toBe(true);
    for (let i = 0; i < 2; i++) expect(c.grantUpgrade(r.support)).toBe(true);
    expect(c.grantUpgrade(id)).toBe(false); expect(c.grantUpgrade(r.support)).toBe(true);
    c.progression.gainExperience(c.progression.threshold);
    expect(c.progression.offers).toContain(id); expect(c.chooseUpgrade(id)).toBe(true);
    expect(c.grantUpgrade(id)).toBe(false); expect(c.grantUpgrade(r.support)).toBe(false);
  }
  enemy(c, 5); c.update(.01, point);
  expect(c.waterEvolution.inspect().active).toHaveLength(3);
  expect(c.waterAoe.inspect().active).toHaveLength(0); expect(c.positionAoe.inspect().active).toHaveLength(0);
  expect(c.runBuild.evolution).toBeUndefined(); expect(c.projectiles).toHaveLength(24);
  expect(c.grantUpgrade('spark-weapon')).toBe(true); expect(c.grantUpgrade('split-on-hit')).toBe(true);
  expect(c.grantUpgrade('berserk-route')).toBe(true); expect(c.runBuild.evolution).toBe('berserk-route');
  expect(new Combat().progression.skills.some(s => WATER_EVOLUTION_IDS.includes(s.id as any))).toBe(false);
});

test('sanctuary resolves burst, eight field ticks and one swept finishing ring with normal rewards', () => {
  const c = fixture(), core = enemy(c, 2), outer = enemy(c, 6.8), outside = enemy(c, 8);
  c.waterEvolution.cast('tsunami-sanctuary', 1, point); tick(c, .15); expect(core.hp).toBe(1000);
  tick(c, .01); expect(core.hp).toBe(888); tick(c, 4); expect(core.hp).toBe(744); expect(outer.hp).toBe(1000);
  tick(c, .85); expect(core.hp).toBe(680); expect(outer.hp).toBe(936); expect(outside.hp).toBe(1000);
  tick(c, .1); expect(core.hp).toBe(680); expect(outer.hp).toBe(936);
  c.reset(); const target = enemy(c, 1); target.hp = 1;
  c.waterEvolution.cast('tsunami-sanctuary', 1, point); tick(c, .2);
  expect(c.kills).toBe(1); expect(c.goldEarned).toBe(1);
  expect(c.orbs.reduce((n, o) => n + (o.active ? o.value : 0), 0)).toBe(3);
});

test('wheel keeps real ray gaps, rotates later salvos and gives each ring its own hit record', () => {
  const c = fixture(), aligned = enemy(c, 4), gap = enemy(c, Math.cos(Math.PI / 12) * 4, Math.sin(Math.PI / 12) * 4), outside = enemy(c, 9);
  c.waterEvolution.cast('astral-wheel', 1, point); tick(c, .18);
  expect(aligned.hp).toBe(968); expect(gap.hp).toBe(1000); tick(c, .3);
  expect(aligned.hp).toBe(932); expect(gap.hp).toBe(964);
  tick(c, .35); expect(gap.hp).toBe(932); expect(c.waterEvolution.inspect().rayRounds).toBe(2);
  tick(c, 1.9); expect(c.waterEvolution.inspect().rayRounds).toBe(3); expect(outside.hp).toBe(1000);
  const hits = c.waterEvolution.inspect().hits; tick(c, .06); expect(c.waterEvolution.inspect().hits).toBe(hits);
});

test('crown follows the player, pulls ranks appropriately, hits only its core and clears bounded state', () => {
  const c = fixture(), core = enemy(c, 1), normal = enemy(c, 4), elite = enemy(c, 4), boss = enemy(c, 4), outside = enemy(c, 7);
  elite.rank = 'elite'; boss.rank = 'boss'; c.waterEvolution.cast('abyss-crown', 1, point); tick(c, .8);
  expect(core.hp).toBe(948); expect(normal.x).toBeCloseTo(3.28); expect(elite.x).toBeCloseTo(3.84);
  expect(boss.x).toBe(4); expect(outside.x).toBe(7); expect(normal.hp).toBe(1000);
  c.anchorX = 1; tick(c, .1); expect(c.waterEvolution.inspect().active[0].x).toBe(1);
  const before = JSON.stringify(c.waterEvolution.inspect()); tick(c, 0); expect(JSON.stringify(c.waterEvolution.inspect())).toBe(before);
  c.waterEvolution.cast('tsunami-sanctuary', 1, point); c.waterEvolution.cast('tsunami-sanctuary', 1, point);
  expect(c.waterEvolution.cast('tsunami-sanctuary', 1, point)).toBe(false); expect(c.waterEvolution.inspect().capacity).toBe(5);
  c.hitPlayer(10000); expect(c.waterEvolution.inspect().active).toHaveLength(0);
  c.reset(); expect(c.waterEvolution.inspect().casts).toBe(0);
  expect(WATER_EVOLUTION_IDS.every(id => c.progression.ranks[id as SkillId] === 0)).toBe(true);
});
