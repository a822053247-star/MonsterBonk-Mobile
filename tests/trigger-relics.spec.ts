import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import type { BaseAttackId } from '../src/fusion';
import { RELICS } from '../src/relics';

const origin = { x: 0, z: 0 };
function fixture(species: SpeciesId = 'yanrong') {
  const c = new Combat([], 32, () => .5);
  c.party = new PartySystem(); c.party.reset([species]);
  c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  return c;
}
function tick(c: Combat, dt = .001) { c.party!.syncLeader(origin,0); c.update(dt,origin); }
function hit(c: Combat, target: Combat['enemies'][number], attackId: BaseAttackId, damage: number, burst = false) {
  const shot = c.projectiles.find(p => !p.active)!;
  Object.assign(shot, { active: true, x: target.x, z: target.z, previousX: target.x, previousZ: target.z,
    vx: 0, vz: 0, life: 1, damage, baseDamage: damage, distance: 0, attackId, attackRules: c.runBuild.rules(attackId),
    relicSource: undefined, homing: false, elemental: attackId === 'leaf' || attackId === 'bubble', burst,
    generation: 0, bornTick: -1, ignoreEnemyId: 0, fusionIds: [], hitIds: [], damageIds: [], pierces: 0,
    bounces: 0, scatter: false, hopTargetId: 0 });
  tick(c);
}

test('six trigger relics enter compatible upgrade/shop pools and cannot be duplicated', () => {
  const c = fixture();
  expect(Object.keys(RELICS)).toHaveLength(12);
  expect(c.grantUpgrade('draft-martyr-core')).toBe(true);
  expect(c.grantUpgrade('draft-martyr-core')).toBe(false);
  expect(c.grantUpgrade('draft-kindling-flask')).toBe(true);
  expect(c.grantUpgrade('draft-thorn-testament')).toBe(false);
  expect(c.grantUpgrade('leaf-weapon')).toBe(true);
  expect(c.grantUpgrade('draft-thorn-testament')).toBe(true);
  expect(c.grantUpgrade('shattered-core')).toBe(true);
  const water = fixture('bubblesalamander');
  expect(water.progression.skills.filter(s => s.id.startsWith('draft-')).map(s=>s.id)).toEqual(['draft-bubble-spore','draft-echo-bone-dice','draft-slaughter-hourglass']);
});

test('standalone fire kills propagate only two generations, with unique rewards', () => {
  const c = fixture(); c.grantUpgrade('draft-martyr-core');
  const enemies = [6,7.6,9.2,10.8].map(x => c.spawn('normal',x,0,0)!);
  for (const e of enemies) e.hp = 1;
  hit(c,enemies[0],'spark',40);
  expect(enemies.map(e => e.active)).toEqual([false,false,false,true]);
  expect(c.relicTelemetry).toMatchObject({ explosions: 2, maxGeneration: 2 });
  expect(c.kills).toBe(3); expect(c.goldEarned).toBe(3);
  expect(c.orbs.filter(o => o.active).reduce((sum,o) => sum+o.value,0)).toBe(9);
  tick(c); expect(c.kills).toBe(3);
});

test('same-lineage explosions never double hit a surviving target', () => {
  const c = fixture(); c.grantUpgrade('draft-martyr-core');
  const seed = c.spawn('normal',6,0,0)!, next = c.spawn('normal',7.4,0,0)!;
  seed.hp = next.hp = 1;
  const tank = c.spawn('tank',6.7,1,0)!;
  hit(c,seed,'spark',40);
  expect(tank.hp).toBe(80); expect(c.relicTelemetry.explosions).toBe(2);
});

test('water, grass, neutral skills and spore damage do not start martyr explosions', () => {
  for (const attack of ['leaf','bubble'] as const) {
    const c = fixture(); c.grantUpgrade('draft-martyr-core');
    const e = c.spawn('normal',6,0,0)!; hit(c,e,attack,40);
    expect(c.relicTelemetry.explosions).toBe(0);
  }
  const c = fixture(); c.grantUpgrade('draft-martyr-core');
  c.encounters.beginWave(2);
  const bomber = c.spawn('draft-spore-bomber',6,0,0)!, neighbor = c.spawn('normal',7.5,0,0)!;
  hit(c,bomber,'bubble',bomber.hp); tick(c,.71); tick(c);
  expect(neighbor.active).toBe(false); expect(c.relicTelemetry.explosions).toBe(0);
});

test('burn ticks exactly four times over two seconds and burn kills cannot start martyr', () => {
  const c = fixture(); c.grantUpgrade('draft-kindling-flask'); c.grantUpgrade('draft-martyr-core');
  const tank = c.spawn('tank',7,0,0)!;
  hit(c,tank,'spark',20); expect(tank.hp).toBe(80);
  for (let i=0;i<4;i++) tick(c,.5);
  expect(tank.hp).toBe(72); expect(tank.burnTime).toBe(0);
  tick(c,.5); expect(tank.hp).toBe(72);
  tank.hp = 21; hit(c,tank,'spark',20); tick(c,.5);
  expect(tank.active).toBe(false); expect(c.relicTelemetry.explosions).toBe(0);
});

test('repeated hits cap kindling at three and burst seed consumes the bonus once', () => {
  const c = fixture(); c.grantUpgrade('draft-kindling-flask');
  const tank = c.spawn('tank',7,0,0)!;
  for(let i=0;i<5;i++) hit(c,tank,'spark',1);
  expect(tank.burnStacks).toBe(3); expect(tank.burnTime).toBe(2);
  hit(c,tank,'spark',1,true);
  const burst = c.effects.find(e => e.active && e.kind === 'burst')!;
  expect(burst.radius).toBeCloseTo(1.35*1.45); expect(tank.burnStacks).toBe(0);
  c.clearWave(); expect(tank.burnTime).toBe(0);
  c.reset(); const reused = c.spawn('tank',7,0,0)!;
  expect(reused.burnSource).toBeUndefined(); expect(reused.burnStacks).toBe(0);
});

test('martyr consumes kindling on death and overload scales its radius', () => {
  const c = fixture(); c.grantUpgrade('draft-kindling-flask'); c.grantUpgrade('draft-martyr-core');
  c.grantUpgrade('flame-sweep-weapon'); c.grantUpgrade('overload-core');
  c.runBuild.attacks[1].cooldown = 10000;
  const tank = c.spawn('tank',7,0,0)!;
  for(let i=0;i<4;i++) hit(c,tank,'spark',1);
  hit(c,tank,'spark',100);
  expect(c.effects.find(e => e.active && e.kind === 'burst')!.radius).toBeCloseTo(1.35*1.5*1.45);
});

test('testament fires three low-damage thorns and their kills cannot trigger testament again', () => {
  const c = fixture('sproutspike'); c.grantUpgrade('draft-thorn-testament');
  const seed = c.spawn('normal',6,0,0)!; seed.hp = 1;
  const target = c.spawn('tank',8,0,0)!; target.hp = 1;
  hit(c,seed,'leaf',20);
  expect(c.projectiles.filter(p => p.active)).toHaveLength(3);
  expect(c.projectiles.filter(p => p.active).map(p => p.damage)).toEqual([7,7,7]);
  for(let i=0;i<20;i++) tick(c,.02);
  expect(target.active).toBe(false); expect(c.relicTelemetry.thorns).toBe(3);
});

test('shattered core modifies testament and full pools safely truncate derived thorns', () => {
  const c = fixture('sproutspike'); c.grantUpgrade('draft-thorn-testament'); c.grantUpgrade('shattered-core');
  const seed = c.spawn('normal',6,0,0)!; hit(c,seed,'leaf',40);
  expect(c.relicTelemetry.thorns).toBe(4);
  expect(c.projectiles.filter(p=>p.active).map(p=>p.damage)).toEqual([10.5,10.5,10.5,10.5]);
  const full = fixture('sproutspike'); full.grantUpgrade('draft-thorn-testament');
  for(const p of full.projectiles) Object.assign(p,{ active:true,x:25,z:25,vx:0,vz:0,life:10,damage:1 });
  full.projectiles[0].active = false;
  const e = full.spawn('normal',6,0,0)!; hit(full,e,'leaf',40);
  expect(full.kills).toBe(1); expect(full.relicTelemetry.thorns).toBe(1);
  expect(full.projectiles.filter(p=>p.active)).toHaveLength(24);
});

test('large sweep defers overflow explosion events and reset clears pending work', () => {
  const c = fixture(); c.grantUpgrade('draft-martyr-core'); c.grantUpgrade('flame-sweep-weapon');
  c.runBuild.attacks[1].cooldown = 0;
  for(let i=0;i<80;i++) c.spawn('normal',2,0,0);
  tick(c); expect(c.kills).toBe(80); expect(c.relicTelemetry.explosions).toBe(32);
  tick(c); expect(c.relicTelemetry.explosions).toBe(64);
  tick(c); expect(c.relicTelemetry.explosions).toBe(80);
  expect(c.goldEarned).toBe(80);
  c.clearWave(); tick(c); expect(c.relicTelemetry.explosions).toBe(80);
  c.reset(); expect(c.relicTelemetry.explosions).toBe(0);
});

test('cover and spawn immunity block relic explosions; deferred snapshots survive slot reuse', () => {
  const c = fixture(); c.grantUpgrade('draft-martyr-core');
  const seed = c.spawn('normal',6,0,0)!; seed.hp = 1;
  const warned = c.spawn('tank',7,0,1)!;
  hit(c,seed,'spark',40); expect(warned.hp).toBe(100);
  const cover = new Combat([{x:6.7,z:0,radius:.2}],32,()=>.5);
  cover.party = new PartySystem(); cover.fusionEnabled = true; cover.automaticSpawning = false; cover.reset();
  cover.runBuild.attacks[0].cooldown = 10000; cover.grantUpgrade('draft-martyr-core');
  const first = cover.spawn('normal',6,0,0)!, behind = cover.spawn('tank',7.4,0,0)!;
  hit(cover,first,'spark',40); expect(behind.hp).toBe(100);
  const deferred = fixture(); deferred.grantUpgrade('draft-martyr-core'); deferred.grantUpgrade('flame-sweep-weapon');
  deferred.runBuild.attacks[1].cooldown = 0;
  for(let i=0;i<40;i++) deferred.spawn('normal',2,0,0);
  tick(deferred);
  const reused = deferred.spawn('tank',20,0,0)!; tick(deferred);
  expect(reused.hp).toBe(100); expect(deferred.relicTelemetry.explosions).toBe(40);
});

test('choice/death pauses freeze burning, and a burn Boss kill uses the victory gate', () => {
  const c = fixture(); c.grantUpgrade('draft-kindling-flask');
  const tank = c.spawn('tank',7,0,0)!; hit(c,tank,'spark',20);
  c.progression.gainExperience(c.progression.threshold); tick(c,.5);
  expect(tank.hp).toBe(80); expect(tank.burnTime).toBe(2);
  c.reset(); c.grantUpgrade('draft-kindling-flask'); c.encounters.beginWave(6);
  const boss = c.spawnRank('boss',origin)!; c.encounters.boss = boss;
  boss.spawnTime = 0; boss.hp = 21;
  hit(c,boss,'spark',20); tick(c,.5);
  expect(boss.active).toBe(false); expect(c.encounters.dying).toBe(true);
  const frozen = fixture(); frozen.grantUpgrade('draft-kindling-flask');
  const e = frozen.spawn('tank',7,0,0)!; hit(frozen,e,'spark',20);
  frozen.hp = 0; tick(frozen,2); expect(e.hp).toBe(80); expect(e.burnTime).toBe(2);
});
