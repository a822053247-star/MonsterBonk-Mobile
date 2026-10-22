import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { upgradePreview } from '../src/progression';
import { AREA_RULES, BARRAGE_RULES, type BarragePattern } from '../src/area-attacks';

function fixture() {
  const c = new Combat([], 100, () => .5);
  c.party = new PartySystem(); c.party.reset(['yanrong']);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  c.attackViewport = { x: 0, z: 0, halfWidth: 10, halfDepth: 8 };
  return c;
}
const advance = (c: Combat, dt: number) => c.areaAttacks.update(dt, 0, 1);

test('nova warns, snapshots current rectangular view, applies rank multipliers once', () => {
  const c = fixture();
  const normal = c.spawn('tank', 9.9, 7.9, 0)!;
  const outside = c.spawn('tank', 10.01, 0, 0)!;
  const elite = c.spawn('tank', 2, 0, 0)!; elite.rank = 'elite';
  const boss = c.spawn('tank', -2, 0, 0)!; boss.rank = 'boss';
  const unborn = c.spawn('tank', 0, 2, 1)!;
  c.areaAttacks.castNova(50); advance(c, .2);
  expect(normal.hp).toBe(100);
  advance(c, .26);
  expect([normal.hp, outside.hp, elite.hp, boss.hp, unborn.hp]).toEqual([50, 100, 65, 80, 100]);
  advance(c, .5); expect(normal.hp).toBe(50);
  expect(c.areaAttacks.novas[0].hits.size).toBe(3);
});

test('nova uses detonation view and does not hit enemies spawned into reused slots afterwards', () => {
  const c = fixture(), e = c.spawn('normal', 15, 0, 0)!;
  c.areaAttacks.castNova(100);
  c.attackViewport!.x = 15; advance(c, .46);
  expect(e.active).toBe(false);
  const replacement = c.spawn('normal', 15, 0, 0)!;
  advance(c, .2); expect(replacement.hp).toBe(30);
});

test('visual and XP saturation preserve all kills, gold and experience; casts remain bounded', () => {
  const c = fixture();
  for (const e of c.effects) Object.assign(e, { active: true, time: 10, kind: 'burst' });
  for (const orb of c.orbs) Object.assign(orb, { active: true, value: 1 });
  for (let i = 0; i < COMBAT_LIMITS.enemies; i++) c.spawn('normal', i % 8, Math.floor(i / 8) % 8, 0);
  expect(c.areaAttacks.castNova(100)).toBe(true);
  expect(c.areaAttacks.castNova(100)).toBe(true);
  expect(c.areaAttacks.castNova(100)).toBe(false);
  advance(c, .46);
  expect(c.kills).toBe(256); expect(c.goldEarned).toBe(256);
  expect(c.orbs.reduce((n, o) => n + o.value, 0)).toBe(96 + 256 * 3);
  expect(c.areaDeaths.filter(e => e.active)).toHaveLength(256);
  expect(c.areaAttacks.novas).toHaveLength(AREA_RULES.novaCapacity);
});

test('boss lethal blast settles ordinary enemies before victory clears summons', () => {
  const c = fixture(); c.encounters.enabled = true;
  const boss = c.encounters.spawnBoss(c, { x: 0, z: 0 });
  Object.assign(boss, { x: 0, z: 0, hp: 1, spawnTime: 0 });
  c.spawn('normal', 5, 0, 0);
  c.areaAttacks.castNova(100); advance(c, .46);
  expect(c.kills).toBe(2); expect(c.goldEarned).toBe(1);
  expect(c.encounters.dying).toBe(true);
});

test('formal skill unlocks automatically; zero time freezes it and reset clears attacks', () => {
  const c = fixture(); expect(c.grantUpgrade('screen-nova')).toBe(true);
  c.update(1 / 60, { x: 0, z: 0 });
  const cast = c.areaAttacks.novas.find(c => c.active)!;
  expect(cast).toBeTruthy(); const age = cast.age;
  c.update(0, { x: 0, z: 0 }); expect(cast.age).toBe(age);
  c.hp = 0; c.update(.1, { x: 0, z: 0 }); expect(cast.age).toBe(age);
  c.reset(); expect(c.areaAttacks.inspect().casts).toBe(0);
  expect(c.areaAttacks.novas.some(c => c.active)).toBe(false);
  expect(new Combat().progression.skills.some(s => s.id === 'screen-nova')).toBe(false);
});

test('all barrage patterns reserve 12–24 lanes, round timing, independent casts and refuse saturation atomically', () => {
  const c = fixture();
  for (const pattern of ['ring', 'fan', 'cross'] as BarragePattern[]) {
    expect(c.areaAttacks.castBarrage(pattern, 24, 3)).toBe(true);
  }
  expect(c.areaAttacks.castBarrage('ring', 24, 1)).toBe(true);
  expect(c.areaAttacks.inspect().reservedLanes).toBe(BARRAGE_RULES.lanes);
  expect(c.areaAttacks.castBarrage('fan')).toBe(false);
  expect(new Set(c.areaAttacks.barrages.map(c => c.castId)).size).toBe(4);
  advance(c, .01); expect(c.areaAttacks.inspect().activeLanes).toBe(48);
  advance(c, .25); expect(c.areaAttacks.inspect().activeLanes).toBe(96);
  advance(c, 2); expect(c.areaAttacks.inspect().reservedLanes).toBe(0);
  expect(c.areaAttacks.castBarrage('fan', 12, 1)).toBe(true);
  c.clearTransientEffects(); expect(c.areaAttacks.inspect().reservedLanes).toBe(0);
  expect(c.projectiles).toHaveLength(24);
});

test('barrage uses swept collision, three targets per lane with decay and cast-wide deduplication', () => {
  const c = fixture();
  c.areaAttacks.castBarrage('ring', 12, 1, 50);
  // Isolate a single reserved lane to verify collision order despite enemy slot ordering.
  for (const lane of c.areaAttacks.lanes.slice(1)) { lane.hits = 3; }
  const enemies = [8, 6, 4, 2].map(z => { const e = c.spawn('tank', 0, z, 0)!; e.hp = 1000; return e; });
  advance(c, .4);
  expect(enemies.map(e => e.hp)).toEqual([1000, 968, 960, 950]);
  advance(c, .1); expect(enemies.map(e => e.hp)).toEqual([1000, 968, 960, 950]);
  expect(c.areaAttacks.barrages[0].hits.size).toBe(3);
  // A new cast can damage an old target; overlapping lanes within that cast cannot.
  c.clearTransientEffects(); c.areaAttacks.castBarrage('cross', 24, 1, 10);
  advance(c, .4);
  expect(enemies[3].hp).toBe(940);
});

test('large-cast elemental chains share node and per-target budgets', () => {
  const c = fixture(); c.grantUpgrade('draft-martyr-core');
  for (let i = 0; i < 100; i++) c.spawn('normal', i % 10 - 5, Math.floor(i / 10) - 5, 0)!.hp = 1;
  c.areaAttacks.castNova(100); advance(c, .46);
  const source = c.areaAttacks.novas[0].source!;
  expect(source.areaBudget!.nodes).toBeLessThanOrEqual(24);
  expect(source.chain!.nodes).toBeLessThanOrEqual(24);
  for (let i = 0; i < 20; i++) c.update(1 / 60, { x: 0, z: 0 });
  expect(c.kills).toBe(100); expect(c.relicTelemetry.maxGeneration).toBeLessThanOrEqual(3);
  const target = c.spawn('tank', 0, 2, 0)!; target.hp = 1000;
  const damage = (c as any).damageEnemy.bind(c);
  for (let i = 0; i < 8; i++) damage(target, 10, 0, 0, 'player', source);
  expect(target.hp).toBe(980);
  c.reset(); expect(c.areaAttacks.inspect().reservedLanes).toBe(0);
});

test('all three creatures can acquire and upgrade large attacks without changing their base weapon', () => {
  for (const species of ['yanrong', 'bubblesalamander', 'sproutspike'] as SpeciesId[]) {
    const c = fixture(); c.party!.reset([species]); c.reset(); c.automaticSpawning = false;
    const base = c.baseAttack;
    for (let i = 0; i < 3; i++) {
      expect(c.grantUpgrade('screen-nova')).toBe(true);
      expect(c.grantUpgrade('screen-barrage')).toBe(true);
    }
    expect(c.baseAttack).toBe(base); expect(c.runBuild.attacks).toHaveLength(1);
    c.update(1 / 60, { x: 0, z: 0 });
    expect(c.areaAttacks.inspect().reservedLanes).toBe(24);
    expect(c.areaAttacks.novas[0].damage).toBe(127.5);
    const card = c.progression.skills.find(s => s.id === 'screen-barrage')!;
    expect(upgradePreview(card, { ...c.progression.ranks, 'screen-barrage': 0 })).toContain('12');
    expect(upgradePreview(card, { ...c.progression.ranks, 'screen-barrage': 1 })).toContain('18');
    c.hitPlayer(10000); expect(c.areaAttacks.inspect().reservedLanes).toBe(0);
  }
});
