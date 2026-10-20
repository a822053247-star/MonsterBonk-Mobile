import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import { FLAME_SWEEP, insideSweep } from '../src/flame-sweep';
import { RunFlow } from '../src/run-flow';

const origin = {x:0,z:0};
function fixture(obstacles: {x:number;z:number;radius:number}[] = []) {
  const c = new Combat(obstacles,32,()=>.25); c.party = new PartySystem(); c.fusionEnabled = true;
  c.automaticSpawning = false; c.reset(); c.encounters.beginWave(1);
  expect(c.grantUpgrade('flame-sweep-weapon')).toBe(true);
  c.runBuild.attacks[0].cooldown = 1000;
  c.runBuild.attacks[1].cooldown = 0; // Arrange a ready melee attack after the acquisition stagger.
  return c;
}
function tick(c:Combat, seconds = 1/60) { c.party!.syncLeader(origin,0); c.update(seconds,origin); }

test('supplied originals remain byte-identical; eight equal cells have one common root and no black removal', () => {
  const dir = 'public/assets/pixel/skills/flame-sweep/';
  const manifest = JSON.parse(readFileSync(dir+'manifest.json','utf8'));
  expect(manifest.frameSize).toEqual([448,448]); expect(manifest.frames).toBe(8);
  expect(manifest.backgroundRemoval).toContain('already have alpha');
  for(let i=0;i<2;i++) expect(createHash('sha256').update(readFileSync(dir+`source-${i+1}.png`)).digest('hex')).toBe(manifest.sources[i].sha256);
  const atlas = readFileSync(dir+'flame-sweep.png'); expect(atlas[25]).toBe(6);
  expect([atlas.readUInt32BE(16),atlas.readUInt32BE(20)]).toEqual([3584,448]);
  for(const f of manifest.records) { expect(f.anchor).toEqual([96,368]); expect(f.scale).toBe(.5); }
  expect(FLAME_SWEEP.frames/FLAME_SWEEP.fps).toBe(FLAME_SWEEP.duration);
});

test('finite 220 degree sector respects back, radial limit and circle edges', () => {
  expect(insideSweep(2,0,1,0,2.8,.1)).toBe(true);
  expect(insideSweep(-2,0,1,0,2.8,.1)).toBe(false);
  expect(insideSweep(3,0,1,0,2.8,.1)).toBe(false);
  const angle=115*Math.PI/180;
  expect(insideSweep(Math.cos(angle)*2,Math.sin(angle)*2,1,0,2.8,.2)).toBe(true);
  expect(insideSweep(Math.cos(angle)*2,Math.sin(angle)*2,1,0,2.8,.05)).toBe(false);
});

test('sweep really clears a cluster with a full projectile pool and settles kills, coins and XP once', () => {
  const c = fixture();
  for(const p of c.projectiles) Object.assign(p,{active:true,x:20,z:20,previousX:20,previousZ:20,vx:0,vz:0,life:100,damage:0});
  const enemies = [[2,0],[2,.8],[2,-.8],[2.6,.5]].map(([x,z])=>c.spawn('normal',x,z,0)!);
  for(const e of enemies) e.swarm = true;
  tick(c); expect(c.kills).toBe(4); expect(c.goldEarned).toBe(1);
  expect(c.orbs.reduce((s,o)=>s+(o.active?o.value:0),0)+c.xp).toBe(4);
  expect(c.shotsFired).toBe(0); expect(c.projectiles.filter(p=>p.active)).toHaveLength(24);
  expect(c.melee.hitIds.filter(Boolean)).toHaveLength(4);
  const id=c.melee.attackInstanceId; tick(c,.1); expect(c.kills).toBe(4); expect(c.goldEarned).toBe(1); expect(c.melee.attackInstanceId).toBe(id);
  expect(c.enemies).toHaveLength(COMBAT_LIMITS.enemies);
});

test('cover, warnings, back-facing targets and targets outside the arc are not damaged', () => {
  const c=fixture([{x:1.8,z:1.8,radius:.45}]);
  const front=c.spawn('tank',2,0,0)!, back=c.spawn('tank',-2.8,0,0)!;
  const covered=c.spawn('tank',2.6,2.6,0)!, warned=c.spawn('tank',1,1,.75)!, far=c.spawn('tank',5,0,0)!;
  tick(c);
  expect(front.hp).toBe(64); for(const e of [back,covered,warned,far]) expect(e.hp).toBe(100);
  expect(c.melee.aimX).toBeCloseTo(1);
});

test('automatic melee waits for a target and repeats on its own cooldown after the animation ends', () => {
  const c=fixture(); tick(c); expect(c.melee.attackInstanceId).toBe(0);
  const enemy=c.spawn('tank',2,0,0)!; tick(c);
  expect(enemy.hp).toBe(64); expect(c.melee.attackInstanceId).toBe(1);
  for(let i=0;i<52;i++)tick(c);
  expect(enemy.hp).toBe(64); expect(c.melee.active).toBe(false);
  for(let i=0;i<3;i++)tick(c);
  expect(enemy.hp).toBe(28); expect(c.melee.attackInstanceId).toBe(2);
  for(let i=0;i<54;i++)tick(c);
  expect(c.kills).toBe(1); expect(c.melee.attackInstanceId).toBe(3);
  expect(c.shotsFired).toBe(0);
});

test('direction locks per swing; upgrades/death freeze animation and reset or wave boundary clears it', () => {
  const c=fixture(); c.spawn('tank',2,0,0); tick(c);
  const aim=[c.melee.aimX,c.melee.aimZ], id=c.melee.attackInstanceId;
  const enemy=c.enemies.find(e=>e.active)!; enemy.x=0; enemy.z=2;
  tick(c,.1); expect([c.melee.aimX,c.melee.aimZ]).toEqual(aim); expect(c.melee.attackInstanceId).toBe(id);
  c.progression.gainExperience(8); const before=JSON.stringify(c.melee); tick(c,.1); expect(JSON.stringify(c.melee)).toBe(before);
  c.chooseUpgrade(c.progression.offers[0]); c.hp=0; tick(c,.1); expect(JSON.stringify(c.melee)).toBe(before);
  c.hp=100; c.clearWave(); expect(c.melee.active).toBe(false);
  c.reset(); expect(c.melee.attackInstanceId).toBe(0); expect(c.runBuild.has('flame-sweep')).toBe(false);
});

test('shared three slots, five upgrades, modifier compatibility and legacy card pools remain explicit', () => {
  const c=fixture(); expect(c.runBuild.attacks).toHaveLength(2);
  for(let i=0;i<4;i++) expect(c.grantUpgrade('flame-sweep-weapon')).toBe(true);
  expect(c.grantUpgrade('flame-sweep-weapon')).toBe(false);
  expect(c.grantUpgrade('leaf-weapon')).toBe(true); expect(c.runBuild.attacks).toHaveLength(3);
  expect(c.progression.skills.some(s=>s.id==='bubble-weapon')).toBe(false);
  expect(c.grantUpgrade('bubble-weapon')).toBe(false);
  expect(c.grantUpgrade('split-on-hit')).toBe(true); expect(c.grantUpgrade('multishot')).toBe(true);
  c.spawn('tank',2,0,0); tick(c); expect(c.melee.attackInstanceId).toBe(1);
  expect(c.fusions.some(f=>String(f.baseAttack)==='flame-sweep')).toBe(false);
  const legacy=new Combat(); legacy.reset(); expect(legacy.progression.skills).toHaveLength(8);
  expect(legacy.progression.skills.some(s=>s.id==='flame-sweep-weapon')).toBe(false);
});

test('melee uses the Boss death gate and cannot override same-frame player death', () => {
  const c=fixture(), run=new RunFlow(); run.waveIndex=5; run.prepare(c,origin);
  const boss=c.encounters.boss!; Object.assign(boss,{x:2,z:0,previousX:2,previousZ:0,hp:1,spawnTime:0});
  tick(c); expect(c.encounters.dying).toBe(true); expect(c.melee.active).toBe(false);
  run.update(1/60,c,origin); expect(run.phase).toBe('fighting');
  c.encounters.beforeTick(1); run.update(1/60,c,origin); expect(run.phase).toBe('won');
  const lost=fixture(), defeat=new RunFlow(); defeat.waveIndex=5; defeat.prepare(lost,origin);
  lost.hp=0; tick(lost); defeat.update(1/60,lost,origin); expect(defeat.phase).toBe('lost'); expect(defeat.failure).toBe('health');
});
