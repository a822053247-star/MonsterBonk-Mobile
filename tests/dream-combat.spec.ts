import { test, expect } from '@playwright/test';
import { Combat, type Enemy } from '../src/combat';
import { PartySystem } from '../src/party';
import { ATTACKS } from '../src/run-build';
import type { BaseAttackId } from '../src/fusion';
import { DREAM_RULES, dreamEchoStats } from '../src/dream-combat';
import { matchesTarget } from '../src/content/relic-effects';

function fixture() {
  const c=new Combat([],100,()=>.5);c.party=new PartySystem();c.party.reset(['yanrong']);c.fusionEnabled=true;c.reset();
  c.automaticSpawning=false;c.invulnerability=10000;c.grantUpgrade('dream-dart-weapon');c.grantUpgrade('resonance-seed-weapon');
  for(const a of c.runBuild.attacks)a.cooldown=10000;return c;
}
function target(c:Combat,x=3,z=0){const e=c.spawn('normal',x,z,0)!;e.hp=1000;return e;}
function emit(c:Combat,e:Enemy,id:BaseAttackId){
  const rules=c.runBuild.rules(id),damage=ATTACKS[id].damage*rules.damageMultiplier;
  expect((c as any).fireBolts({x:0,z:0},e,damage,1,11,0,'yanrong',id)).toBe(true);
  const shot=c.projectiles.find(p=>p.active&&p.attackId===id)!;
  for(let i=0;i<200&&shot.active;i++)c.update(1/120,{x:0,z:0});
}

test('three real dart hits consume dream marks and bloom once without marking area victims',()=>{
  const c=fixture(),e=target(c),near=target(c,3,1.6),far=target(c,7,4);
  emit(c,e,'dream-dart');expect(e.dreamStacks).toBe(1);
  emit(c,e,'dream-dart');expect(e.dreamStacks).toBe(2);expect(near.hp).toBe(1000);
  emit(c,e,'dream-dart');expect(e.dreamStacks).toBe(0);expect(c.dream.telemetry.blooms).toBe(1);
  expect(near.hp).toBeCloseTo(1000-14*1.6);expect(near.dreamStacks).toBe(0);expect(far.hp).toBe(1000);
});

test('dream expiry, cover and spawn protection prevent stale or illegal marks',()=>{
  const c=fixture(),e=target(c);emit(c,e,'dream-dart');
  c.update(4.1,{x:0,z:0});expect(e.dreamStacks).toBe(0);expect(e.dreamTime).toBe(0);
  e.x=e.previousX=3;e.z=e.previousZ=0;c.obstacles=[{x:1.5,z:0,radius:.6}];const hits=c.dream.telemetry.dreamHits;
  emit(c,e,'dream-dart');expect(c.dream.telemetry.dreamHits).toBe(hits);
  c.obstacles=[];e.spawnTime=3;emit(c,e,'dream-dart');expect(c.dream.telemetry.dreamHits).toBe(hits);
});

test('seeds sweep at most three targets, or five at level five, without fire/water/grass identity',()=>{
  for(const level of [1,5]){
    const c=fixture();for(let i=1;i<level;i++)c.grantUpgrade('resonance-seed-weapon');
    const enemies=Array.from({length:6},(_,i)=>target(c,2.2+i*1.1));emit(c,enemies[0],'resonance-seed');
    expect(enemies.filter(e=>(e.resonanceTime??0)>0)).toHaveLength(level===1?3:5);
    for(const id of ['dream-dart','resonance-seed'] as const)
      for(const element of ['fire-weapon','water-weapon','grass-weapon'] as const)expect(matchesTarget(element,id,c.runBuild.relicContext)).toBe(false);
  }
});

test('another weapon killing a marked enemy transfers to at most three marked neighbours and cannot recurse',()=>{
  const c=fixture();for(let i=1;i<5;i++)c.grantUpgrade('resonance-seed-weapon');
  const enemies=Array.from({length:5},(_,i)=>target(c,2.2+i*.85));emit(c,enemies[0],'resonance-seed');
  expect(enemies.every(e=>(e.resonanceTime??0)>0)).toBe(true);
  enemies[0].hp=enemies[1].hp=1;const before=enemies.map(e=>e.hp);emit(c,enemies[0],'spark');
  expect(enemies[0].active).toBe(false);expect(enemies[1].active).toBe(false);
  expect(c.dream.telemetry.transfers).toBe(1);expect(c.dream.telemetry.transferHits).toBe(3);
  expect(enemies[2].hp).toBeLessThan(before[2]);expect(enemies[3].hp).toBeLessThan(before[3]);expect(enemies[4].hp).toBe(before[4]);
});

test('echo chooses marked targets, grows with two dream layers, extends resonance and does not add marks',()=>{
  const c=fixture(),e=target(c),near=target(c,3,2.8),far=target(c,3,5);
  c.dream.update(.01,1,1);expect(c.dream.telemetry.pulses).toBe(0);
  emit(c,e,'dream-dart');emit(c,e,'dream-dart');emit(c,e,'resonance-seed');
  const before=e.resonanceTime!,hp=near.hp;c.dream.update(.01,1,1);
  expect(c.dream.telemetry.pulses).toBe(1);expect(e.resonanceTime).toBeCloseTo(before+1);
  expect(e.dreamStacks).toBe(2);expect(near.hp).toBe(hp-dreamEchoStats(1).damage);expect(far.hp).toBe(1000);
  expect(c.dream.events.find(e=>e.active&&e.kind==='pulse')!.radius).toBeCloseTo(3.1);
});

test('a pulse killing resonance targets can transfer once, and rank damage is reduced',()=>{
  const c=fixture(),e=target(c),other=target(c,3,1),elite=target(c,0,2),boss=target(c,-2);
  emit(c,e,'resonance-seed');emit(c,other,'resonance-seed');e.hp=1;elite.rank='elite';boss.rank='boss';
  // Keep both ranked probes inside the pulse footprint.
  elite.x=e.x;elite.z=e.z-1;boss.x=e.x+.8;boss.z=e.z-1;
  c.dream.update(.01,1,1);expect(e.active).toBe(false);expect(c.dream.telemetry.transfers).toBe(1);
  expect(elite.hp).toBeCloseTo(1000-dreamEchoStats(1).damage*.7);expect(boss.hp).toBeCloseTo(1000-dreamEchoStats(1).damage*.55);
});

test('upgrade slots, gating, pause, reuse, bounded visuals and restart retain no stale marks',()=>{
  const c=fixture();expect(c.runBuild.attacks).toHaveLength(3);expect(c.grantUpgrade('frost-crystal-weapon')).toBe(false);
  for(let i=0;i<5;i++)expect(c.grantUpgrade('sakura-echo')).toBe(true);expect(c.grantUpgrade('sakura-echo')).toBe(false);
  const e=target(c);emit(c,e,'dream-dart');const time=e.dreamTime;
  c.progression.gainExperience(c.progression.threshold);c.update(1,{x:0,z:0});expect(e.dreamTime).toBe(time);
  e.active=false;const reused=target(c,4);expect(reused).toBe(e);expect(reused.dreamStacks).toBe(0);expect(reused.resonanceTime).toBe(0);
  expect(c.dream.events).toHaveLength(DREAM_RULES.effects);c.clearTransientEffects();expect(c.dream.inspect()).toMatchObject({marks:[],effects:0,pending:0});
  c.reset();expect(c.dream.telemetry.dreamHits).toBe(0);
  expect(c.progression.skills.some(s=>s.id==='sakura-echo')).toBe(false);
});
