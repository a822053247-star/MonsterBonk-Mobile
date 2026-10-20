import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { REACTION_RULES } from '../src/combat-reactions';
import type { SkillId } from '../src/progression';
import type { BaseAttackId } from '../src/fusion';
import { arrangeBuildDemo } from '../src/build-chain-demo';
import { RunShop } from '../src/shop';

const origin = { x: 0, z: 0 };
function fixture() {
  const c = new Combat([],32,()=>.5); c.party=new PartySystem(); c.fusionEnabled=true; c.automaticSpawning=false; c.reset();
  for(const a of c.runBuild.attacks)a.cooldown=10000;
  return c;
}
function grant(c:Combat,...ids:SkillId[]) { for(const id of ids)expect(c.grantUpgrade(id),id).toBe(true);for(const a of c.runBuild.attacks)a.cooldown=10000; }
function tick(c:Combat,seconds=1/60) { c.party!.syncLeader(origin,0); c.update(seconds,origin); }
function hit(c:Combat,e:Combat['enemies'][number],attackId:BaseAttackId,damage:number,copied=false) {
  const s=c.projectiles.find(p=>!p.active)!;
  const rules=c.runBuild.rules(attackId);
  const source=(c as any).newRelicSource(attackId,rules,damage);source.copied=copied;
  Object.assign(s,{active:true,x:e.x,z:e.z,previousX:e.x,previousZ:e.z,vx:0,vz:0,life:.1,damage,baseDamage:damage,distance:0,
    attackId,attackRules:rules,relicSource:source,elemental:attackId==='bubble'||attackId==='leaf',generation:0,bornTick:-1,
    ignoreEnemyId:0,burst:false,fusionIds:[],hitIds:[],damageIds:[],pierces:0,bounces:0,scatter:false,hopTargetId:0,homing:false});
  tick(c,.001);return source;
}
function target(c:Combat,x:number,z=0,hp=100) { const e=c.spawn('tank',x,z,0)!;e.hp=e.maxHp=hp;e.stagger=1000;return e; }

test('mature fire propagates three generations from the original snapshot; basic fire retains its rules',()=>{
  const simulate=(level:number)=>{
    const c=fixture();grant(c,'split-on-hit','draft-martyr-core');
    for(let i=1;i<level;i++)grant(c,'spark-weapon');
    const enemies=Array.from({length:5},(_,i)=>target(c,6+i*1.9,0,20));
    hit(c,enemies[0],'spark',50);
    for(let i=0;i<40;i++)tick(c);
    return {c,enemies};
  };
  const early=simulate(2), mature=simulate(3);
  expect(early.c.kills).toBe(2);expect(mature.c.kills).toBe(4);
  expect(mature.c.relicTelemetry.maxGeneration).toBe(3);
  expect(mature.enemies[4].hp).toBe(20);
  expect(mature.c.goldEarned).toBe(8); // Four ordinary tanks, two gold each.
  tick(mature.c);expect(mature.c.kills).toBe(4);
});

test('only mature burn kills relay; copied roots retain their reduced damage',()=>{
  for(const mature of [false,true]) {
    const c=fixture();grant(c,'draft-kindling-flask','draft-martyr-core','split-on-hit');
    if(mature)grant(c,'spark-weapon','spark-weapon');
    const seed=target(c,6,0,26),neighbor=target(c,7.9);
    hit(c,seed,'spark',25,true);tick(c,.5);for(let i=0;i<8;i++)tick(c);
    expect(c.kills).toBe(1);
    if(mature)expect(neighbor.hp).toBeCloseTo(100-25*.65);
    else expect(neighbor.hp).toBe(100);
  }
});

test('steam consumes wet, damages living origin and neighbors, and cannot recursively boil',()=>{
  const c=fixture();grant(c,'bubble-weapon','draft-boiling-core');
  const seed=target(c,6),neighbor=target(c,8.2);
  hit(c,seed,'bubble',10);expect(seed.wetTime).toBeGreaterThan(2);
  hit(c,neighbor,'bubble',1);
  hit(c,seed,'spark',40);
  expect(c.relicTelemetry.steamBursts).toBe(1);
  expect(seed.wetTime).toBe(0);expect(seed.hp).toBeCloseTo(24);
  expect(neighbor.hp).toBeCloseTo(73);expect(neighbor.wetTime).toBeGreaterThan(0);
  hit(c,seed,'bubble',1);hit(c,seed,'spark',1);
  expect(c.relicTelemetry.steamBursts).toBe(1); // Per-target cooldown.
  for(let i=0;i<40;i++)tick(c);
  hit(c,seed,'spark',1);expect(c.relicTelemetry.steamBursts).toBe(2);
});

test('wet expiry, pause, cover, spawn protection and pooled reset are respected',()=>{
  const c=fixture();grant(c,'bubble-weapon','draft-boiling-core');
  const e=target(c,6);hit(c,e,'bubble',1);
  const wet=e.wetTime;c.progression.gainExperience(c.progression.threshold);tick(c,1);
  expect(e.wetTime).toBe(wet);
  while(c.progression.awaitingChoice)c.chooseUpgrade(c.progression.offers[0]);
  for(let i=0;i<150;i++)tick(c);
  expect(e.wetTime).toBe(0);hit(c,e,'spark',1);expect(c.relicTelemetry.steamBursts).toBe(0);
  c.clearWave();const reused=target(c,6);expect(reused.wetTime).toBe(0);expect(reused.steamReadyAt).toBe(0);
  // Wall lies only between the steam origin and the neighboring target.
  (c as any).obstacles=[{x:6,z:1.1,radius:.3}];
  const hidden=target(c,6,2.2),protectedEnemy=target(c,7,0);protectedEnemy.spawnTime=1;
  hit(c,reused,'bubble',1);hit(c,reused,'spark',1);
  expect(hidden.hp).toBe(100);expect(protectedEnemy.hp).toBe(100);
  c.hp=0;const elapsed=c.elapsed;tick(c,1);expect(c.elapsed).toBe(elapsed);
  c.reset();expect(c.relicTelemetry.steamBursts).toBe(0);expect(c.inspect().triggerRelics.pending).toBe(0);
});

test('steam can kill a Boss through the shared victory gate',()=>{
  const c=fixture();grant(c,'bubble-weapon','draft-boiling-core');c.encounters.beginWave(6);
  const boss=c.spawnRank('boss',origin)!;c.encounters.boss=boss;
  Object.assign(boss,{x:6,z:0,hp:20,spawnTime:0,stagger:1000});
  hit(c,boss,'bubble',1);hit(c,boss,'spark',12);
  expect(c.encounters.dying).toBe(true);expect(c.kills).toBe(1);
  expect(c.inspect().triggerRelics.pending).toBe(0);
});

test('mature roots cap nodes while all primary kills and XP survive full effect/projectile pools',()=>{
  const c=fixture();grant(c,'flame-sweep-weapon','flame-sweep-weapon','flame-sweep-weapon','draft-martyr-core');
  for(let i=0;i<80;i++) {const e=c.spawn('normal',2,0,0)!;e.stagger=1000;}
  for(const e of c.effects)Object.assign(e,{active:true,time:10,duration:10});
  for(const p of c.projectiles)Object.assign(p,{active:true,x:20,z:20,vx:0,vz:0,life:10,elemental:false,burst:false,homing:false});
  c.runBuild.attacks[1].cooldown=0;tick(c);
  expect(c.kills).toBe(80);expect(c.goldEarned).toBe(80);
  for(const a of c.runBuild.attacks)a.cooldown=10000;
  for(let i=0;i<20;i++)tick(c);
  expect(c.relicTelemetry.explosions).toBe(REACTION_RULES.nodesPerChain);
  expect(c.relicTelemetry.maxNodes).toBe(24);expect(c.inspect().triggerRelics.pending).toBe(0);
  expect(c.orbs.reduce((sum,e)=>sum+(e.active?e.value:0),0) + c.progression.totalExperience).toBe(240);
});

test('steam eligibility requires water and fire; six skipped rolls reserve an applicable core',()=>{
  const c=fixture();expect(c.progression.skills.some(s=>s.id==='draft-boiling-core')).toBe(false);
  grant(c,'bubble-weapon');expect(c.progression.skills.some(s=>s.id==='draft-boiling-core')).toBe(true);
  // High RNG refuses the base 25% roll, exercising the explicit earned-choice guarantee.
  const p=new Combat([],32,()=>.999);p.party=new PartySystem();p.fusionEnabled=true;p.reset();
  for(let roll=1;roll<=6;roll++) {
    p.progression.gainExperience(p.progression.threshold-p.progression.experience);
    const offers=p.progression.offers;
    expect(new Set(offers).size).toBe(offers.length);
    expect(offers.filter(id=>p.progression.skills.find(s=>s.id===id)?.category).length).toBeLessThanOrEqual(1);
    if(roll===6)expect(offers.some(id=>id==='draft-martyr-core'||id==='draft-kindling-flask')).toBe(true);
    expect(p.chooseUpgrade(offers.find(id=>!p.progression.skills.find(s=>s.id===id)?.category)!)).toBe(true);
  }
  expect(p.grantUpgrade('draft-martyr-core')).toBe(true);
  p.progression.gainExperience(p.progression.threshold-p.progression.experience);
  expect(p.progression.offers.every(id=>!p.progression.skills.find(s=>s.id===id)?.category)).toBe(true);
});

test('steam can be bought in the real shop and key effects survive a pool full of deaths',()=>{
  const c=fixture();grant(c,'bubble-weapon');
  const shop=new RunShop(c,1,()=>0);
  const index=shop.items.findIndex(item=>item.skill==='draft-boiling-core');expect(index).toBeGreaterThanOrEqual(0);
  expect(shop.buy(index,shop.token,70)).toBe(0);expect(c.runBuild.relics).toContain('draft-boiling-core');
  for(const e of c.effects)Object.assign(e,{active:true,kind:'death',time:10,duration:10});
  const seed=target(c,6);hit(c,seed,'bubble',1);hit(c,seed,'spark',1);
  expect(c.effects.some(e=>e.active&&e.kind==='steam')).toBe(true);
});

test('declared demo builds exercise actual propagation, steam and slaughter deterministically',()=>{
  const run=(index:number)=>{
    const c=fixture();const layout=arrangeBuildDemo(c,index);
    for(let i=0;i<360;i++) {
      for(const {enemy,x,z} of layout.targets)if(enemy.active)Object.assign(enemy,{x,z,knockX:0,knockZ:0});
      c.party!.syncLeader(layout.player,0);c.update(1/60,layout.player);
      if(index<2&&c.shotsFired>0)for(const a of c.runBuild.attacks)a.cooldown=10000;
      while(c.progression.awaitingChoice)c.chooseUpgrade(c.progression.offers[0]);
    }
    return {kills:c.kills,...c.relicTelemetry,pending:c.inspect().triggerRelics.pending};
  };
  const early=run(0),mature=run(1),steam=run(2),mowing=run(3);
  expect(mature.kills).toBeGreaterThan(early.kills);expect(mature.maxGeneration).toBe(3);
  expect(steam.steamBursts).toBeGreaterThan(0);expect(mowing.steamBursts).toBeGreaterThan(0);
  expect(mowing.hourglassProcs).toBeGreaterThan(0);expect(mowing.echoes).toBeGreaterThan(0);
  expect(run(3)).toEqual(mowing);
});

test('maturity is snapshotted on volleys and echo copies across a mid-flight upgrade',()=>{
  const c=fixture();grant(c,'spark-weapon','split-on-hit','draft-martyr-core','draft-echo-bone-dice');
  target(c,9,0,10000);c.runBuild.attacks[0].cooldown=0;tick(c,.001);
  const shot=c.projectiles.find(p=>p.active)!;
  expect(shot.relicSource!.mature).toBe(false);
  grant(c,'spark-weapon');expect(c.resonances).toContain('连爆觉醒');
  expect(shot.relicSource!.mature).toBe(false);
  // The queued copy must use the recorded maturity, not the upgraded weapon.
  (c as any).pendingEchoes.push({attack:{attackId:'spark',damage:shot.baseDamage!*.5,range:10.5,
    rules:shot.attackRules,fusions:['burst-seed'],mature:false},readyAt:c.elapsed,expiresAt:c.elapsed+.75});
  tick(c);expect(c.projectiles.filter(p=>p.active&&p.relicSource?.copied).every(p=>p.relicSource?.mature===false)).toBe(true);
  expect(c.relicTelemetry.echoes).toBe(1);
});

test('200-enemy mixed reactions remain deterministic with bounded queues and pools',()=>{
  const simulate=()=>{
    const c=fixture();arrangeBuildDemo(c,3);grant(c,'spark-weapon','spark-weapon','spark-weapon','split-on-hit');
    for(const e of c.enemies)e.active=false;
    for(let i=0;i<200;i++) {
      const angle=i*2.399963,radius=3+(i%9)*.65;
      const e=c.spawn('normal',Math.cos(angle)*radius,Math.sin(angle)*radius,0)!;
      e.swarm=true;e.hp=e.maxHp=20;
    }
    for(const a of c.runBuild.attacks)a.cooldown=0;
    let peak=0;
    for(let i=0;i<600;i++) {
      while(c.progression.awaitingChoice)c.chooseUpgrade(c.progression.offers[0]);
      tick(c);peak=Math.max(peak,c.inspect().triggerRelics.pending);
      expect(c.projectiles.filter(p=>p.active).length).toBeLessThanOrEqual(24);
    }
    expect(c.relicTelemetry.steamBursts).toBeGreaterThan(0);
    expect(c.relicTelemetry.maxGeneration).toBeLessThanOrEqual(3);
    expect(c.relicTelemetry.maxNodes).toBeLessThanOrEqual(24);expect(peak).toBeLessThan(512);
    return {kills:c.kills,...c.relicTelemetry,peak};
  };
  expect(simulate()).toEqual(simulate());
});
