import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { FLAME_SWEEP, flameSweepStats, insideSweep } from '../src/flame-sweep';
import { WEAPON_DAMAGE_PER_LEVEL } from '../src/relics';

const origin={x:0,z:0};
function fixture(level=5,obstacles:{x:number;z:number;radius:number}[]=[]){
  const c=new Combat(obstacles,32,()=>.25);c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
  for(let i=0;i<level;i++)expect(c.grantUpgrade('flame-sweep-weapon')).toBe(true);
  c.runBuild.attacks[0].cooldown=1000;c.runBuild.attacks[1].cooldown=0;c.invulnerability=1000;return c;
}
function tick(c:Combat,dt=1/60){c.party!.syncLeader(origin,0);c.update(dt,origin);}

test('one sector grows monotonically from a half circle to a full circle with bounded radius',()=>{
  for(let level=1;level<5;level++){
    const a=flameSweepStats(level),b=flameSweepStats(level+1);
    expect(b.radius).toBeGreaterThan(a.radius);expect(b.angle).toBeGreaterThan(a.angle);
    expect(b.interval).toBeLessThan(a.interval);expect(a).not.toHaveProperty('ringInterval');
  }
  expect(flameSweepStats(1).degrees).toBe(180);expect(flameSweepStats(5).degrees).toBe(360);
  expect(insideSweep(-3.8,0,1,0,4.4,.1,flameSweepStats(5).angle)).toBe(true);
  const c=fixture();for(let i=0;i<5;i++)c.grantUpgrade('range');c.grantUpgrade('overload-core');
  expect(flameSweepStats(5,c.stats.rangeMultiplier,c.runBuild.rules('flame-sweep').areaMultiplier).radius).toBe(6);
});

test('actual upgraded swings reach far and rear-side enemies that level one leaves untouched',()=>{
  for(const level of [1,5]){
    const c=fixture(level);c.spawn('tank',1.6,0,0);
    const far=c.spawn('tank',5.1,0,0)!,back=c.spawn('tank',-3.8,0,0)!;
    tick(c);
    for(const e of [far,back])expect(e.hp).toBeCloseTo(level===1?100:100-FLAME_SWEEP.damage*(1+4*WEAPON_DAMAGE_PER_LEVEL['flame-sweep']));
    if(level===5){expect(c.melee.x).toBe(0);expect(c.melee.z).toBe(0);}
  }
});

test('a lone enemy whose body overlaps the sector edge can trigger a real swing',()=>{
  for(const level of [1,5]){
    const c=fixture(level),profile=flameSweepStats(level),offset=level===5?0:FLAME_SWEEP.bodyOffset;
    const target=c.spawn('tank',profile.radius+offset+.8,0,0)!;
    tick(c);expect(c.melee.attackInstanceId).toBe(1);
    expect(target.hp).toBeCloseTo(100-FLAME_SWEEP.damage*(1+WEAPON_DAMAGE_PER_LEVEL['flame-sweep']*(level-1)));
  }
});

test('a full-circle swing still hits once and has no second periodic attack or clock',()=>{
  const c=fixture();const targets=[[-2,0],[2,0],[0,2],[0,-2]].map(([x,z])=>c.spawn('tank',x,z,0)!);
  tick(c);expect(c.melee.hitIds.filter(Boolean)).toHaveLength(4);expect(c.shotsFired).toBe(0);
  for(const e of targets)expect(e.hp).toBeCloseTo(100-FLAME_SWEEP.damage*(1+4*WEAPON_DAMAGE_PER_LEVEL['flame-sweep']));
  c.runBuild.attacks[1].cooldown=1000;const hits=c.hits;
  for(let i=0;i<300;i++)tick(c);
  expect(c.hits).toBe(hits);expect(c.inspect()).not.toHaveProperty('flameRing');
});

test('moving cast origins respect walls and spawn protection at every angle',()=>{
  const c=fixture(5,[{x:11,z:0,radius:.4}]);
  const hit=c.spawn('tank',8,0,0)!,covered=c.spawn('tank',12,0,0)!,warning=c.spawn('tank',10,1,1)!;
  const p={x:10,z:0};c.party!.syncLeader(p,0);c.update(1/60,p);
  expect(c.melee.x).toBe(10);expect(hit.hp).toBeCloseTo(100-FLAME_SWEEP.damage*(1+4*WEAPON_DAMAGE_PER_LEVEL['flame-sweep']));expect(covered.hp).toBe(100);expect(warning.hp).toBe(100);
});

test('upgrade cooldown progress and text describe a single widening wave',()=>{
  const c=fixture(4);c.runBuild.attacks[1].cooldown=.33;
  const card=c.progression.skills.find(s=>s.id==='flame-sweep-weapon')!;
  expect(card.description).toContain('火浪角度 300° → 360°');expect(card.description).not.toContain('周期');
  c.grantUpgrade('flame-sweep-weapon');expect(c.runBuild.attacks[1].cooldown).toBeCloseTo(.32);
  c.grantUpgrade('haste');expect(c.runBuild.attacks[1].cooldown).toBeLessThan(.32);
});

test('boss resistance, pause, death and reset preserve single-wave combat semantics',()=>{
  const c=fixture(),plain=c.spawn('tank',2,0,0)!,elite=c.spawn('tank',-2,0,0)!;elite.rank='elite';
  tick(c);expect(100-elite.hp).toBeCloseTo((100-plain.hp)*FLAME_SWEEP.eliteMultiplier);
  c.progression.gainExperience(8);const paused=JSON.stringify(c.melee);tick(c,.2);expect(JSON.stringify(c.melee)).toBe(paused);
  c.chooseUpgrade(c.progression.offers[0]);c.hp=0;const dead=JSON.stringify(c.melee);tick(c,.2);expect(JSON.stringify(c.melee)).toBe(dead);
  c.hp=100;c.clearWave();expect(c.melee.active).toBe(false);c.reset();expect(c.melee.attackInstanceId).toBe(0);
});
