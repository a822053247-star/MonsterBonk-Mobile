import { test, expect } from '@playwright/test';
import { Combat, ENEMY_TYPES, FORMAL_MIX, FORMAL_SPORE_HP, RED_BLOB_BASH, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, RUN_WAVES } from '../src/run-flow';
import { WAVE_DIRECTOR } from '../src/wave-director';
import { SPORE_BOMBER } from '../src/special-enemies';

const origin={x:0,z:0};
function fixture() {
  const c=new Combat([],32,()=>.271);
  c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
  for(const attack of c.runBuild.attacks) attack.cooldown=10000;
  return {c, run:new RunFlow(()=>.271)};
}
function tick(c:Combat,dt:number=1/60) {
  c.party!.syncLeader(origin,0);c.update(dt,origin);
}
const typeCount=(c:Combat,kind:string)=>c.enemies.filter(e=>e.active&&!e.rank&&e.kind===kind).length;

test('five-kind mix has weighted red, fast, rock, crystal and capped spore slots',()=>{
  expect(FORMAL_MIX).toHaveLength(12);
  expect(FORMAL_MIX.filter(x=>x==='normal')).toHaveLength(3);
  expect(FORMAL_MIX.filter(x=>x==='fast')).toHaveLength(2);
  expect(FORMAL_MIX.filter(x=>x==='tank')).toHaveLength(2);
  expect(FORMAL_MIX.filter(x=>x==='draft-crystal-swarm')).toHaveLength(4);
  expect(FORMAL_MIX.filter(x=>x==='draft-spore-bomber')).toHaveLength(1);
  const {c}=fixture();c.encounters.beginWave(3);
  const mixed={fastCap:18,tankCap:18,crystalCap:18,sporeCap:2,crystalAllowed:true,sporeAllowed:true};
  expect(c.spawnSwarm(origin,48,120,'normal',mixed)).toBeGreaterThan(20);
  for(const kind of ['normal','fast','tank','draft-crystal-swarm','draft-spore-bomber'])
    expect(typeCount(c,kind)).toBeGreaterThan(0);
  expect(typeCount(c,'draft-spore-bomber')).toBeLessThanOrEqual(2);
  for(let i=0;i<10;i++)c.spawnSwarm(origin,24,120,'normal',mixed);
  expect(typeCount(c,'fast')).toBeLessThanOrEqual(18);
  expect(typeCount(c,'tank')).toBeLessThanOrEqual(18);
  expect(typeCount(c,'draft-crystal-swarm')).toBeLessThanOrEqual(18);
  expect(typeCount(c,'draft-spore-bomber')).toBeLessThanOrEqual(2);
  expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(120);
  expect(c.enemies).toHaveLength(COMBAT_LIMITS.enemies);
});

test('blocked threat slots diversify into crystals, respecting introduction and live caps',()=>{
  for(const allowed of [false,true]) {
    const {c}=fixture();c.encounters.beginWave(3);
    const mixed={fastCap:0,tankCap:0,crystalCap:12,sporeCap:0,crystalAllowed:allowed,sporeAllowed:false};
    for(let i=0;i<8;i++) c.spawnSwarm(origin,12,60,'normal',mixed);
    const living=c.enemies.filter(e=>e.active);
    expect(living.length).toBeGreaterThan(12);
    expect(typeCount(c,'fast')).toBe(0); expect(typeCount(c,'tank')).toBe(0);
    expect(typeCount(c,'draft-spore-bomber')).toBe(0);
    expect(typeCount(c,'draft-crystal-swarm')).toBe(allowed?12:0);
    expect(living.length).toBeLessThanOrEqual(60);
  }
});

test('real first-wave refills hold 40 percent crystals after introduction without adding dangerous enemies',()=>{
  const {c,run}=fixture();run.waveElapsed=9;
  for(let i=0;i<30;i++)run.update(.4,c,origin);
  const living=c.enemies.filter(e=>e.active&&!e.rank);
  expect(living).toHaveLength(60);
  expect(typeCount(c,'draft-crystal-swarm')).toBe(24);
  expect(typeCount(c,'normal')).toBe(36);
  expect(typeCount(c,'fast')).toBe(0); expect(typeCount(c,'tank')).toBe(0);
});

test('red holds a telegraphed ground slam without moving, unlike sprinter lanes and weaving crystal bugs',()=>{
  const {c}=fixture();c.encounters.beginWave(2);
  const red=c.spawn('normal',1.5,0,0)!;red.spawnTime=0;red.intentCooldown=0;
  const crystal=c.spawn('draft-crystal-swarm',6,0,0)!;crystal.spawnTime=0;
  tick(c);
  expect(red.intent).toBe('windup');
  expect(red.intentTime).toBeCloseTo(RED_BLOB_BASH.windup);
  const redX=red.x,hp=c.hp;
  tick(c,.3);
  expect(red.intent).toBe('windup');
  expect(red.x).toBeCloseTo(redX);
  expect(c.hp).toBe(hp);
  expect(crystal.intent).toBe('chase');
  expect(Math.abs(crystal.z)).toBeGreaterThan(0);
  tick(c,.46);
  expect(red.intent).toBe('pounce');
  expect(red.x).toBeCloseTo(redX);
  expect(c.hp).toBe(hp); // Standing beyond the ring is safe.
  tick(c,.25);
  expect(red.intent).toBe('recover');
  expect(red.x).toBeCloseTo(redX);
  expect(red.intentTime).toBeGreaterThan(0);
});

test('the armored spore takes multiple normal weapon hits but can still chain-detonate another spore',()=>{
  const {c}=fixture();c.encounters.beginWave(5);
  expect(ENEMY_TYPES['draft-spore-bomber'].hp).toBe(28); // untouched classic
  expect(FORMAL_SPORE_HP).toBe(140);
  const a=c.spawn('draft-spore-bomber',0,0,0)!,b=c.spawn('draft-spore-bomber',2,0,0)!;
  expect(a.hp).toBeCloseTo(140*2.2);
  expect(b.hp).toBeCloseTo(140*2.2);
  a.spawnTime=b.spawnTime=0;
  (c as any).damageEnemy(a,150,0,0);
  expect(a.active).toBe(true);
  (c as any).damageEnemy(a,a.hp,0,0);
  tick(c,.7);
  expect(b.active).toBe(false);
  expect(c.balanceTelemetry.sporeChainKills).toBe(1);
  expect(SPORE_BOMBER.enemyDamage*SPORE_BOMBER.chainMultiplier).toBeGreaterThan(140*2.2);
});

test('director gates spore candidates until their introduction and during elite/Boss warnings',()=>{
  for(const wave of [1,2,4,6]) {
    const {c,run}=fixture();run.waveIndex=wave-1;
    const plan=WAVE_DIRECTOR[wave-1];
    if(plan.sporeFirst!==null)run.waveElapsed=plan.sporeFirst-4;
    for(let n=0;n<2;n++){run.update(1,c,origin);run.update(.35,c,origin);}
    expect(typeCount(c,'draft-spore-bomber')).toBe(0);
    if(wave===4){c.encounters.elitePulsing=true;run.waveElapsed=plan.sporeFirst!+1;}
    if(wave===6){c.encounters.bossState='dash-windup';run.waveElapsed=plan.sporeFirst!+1;}
    if(wave===4||wave===6){
      for(let n=0;n<5;n++){run.update(.8,c,origin);}
      expect(typeCount(c,'draft-spore-bomber')).toBe(0);
    }
  }
});

test('six waves still honor global cap and the fifth-only shop with deterministic fixed settings',()=>{
  for(let wave=1;wave<=6;wave++){
    const {c,run}=fixture();run.waveIndex=wave-1;
    run.waveElapsed=Math.min(run.definition.seconds-8,25);
    for(let n=0;n<6;n++)run.update(.5,c,origin);
    expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(RUN_WAVES[wave-1].cap);
  }
});

test('red warning overlap is bounded; fast retains real directional movement',()=>{
  const {c}=fixture();c.encounters.beginWave(3);
  const reds=[
    c.spawn('normal',1.2,0,0)!,
    c.spawn('normal',1.3,.2,0)!,
    c.spawn('normal',1.4,-.2,0)!,
    c.spawn('normal',1.1,.3,0)!,
  ];
  for(const e of reds) {e.spawnTime=0;e.intentCooldown=0;}
  tick(c);
  expect(reds.filter(e=>e.intent==='windup')).toHaveLength(RED_BLOB_BASH.nearbyWarningCap);
  const fast=c.spawn('fast',5,0,0)!;fast.spawnTime=0;
  tick(c);
  expect(fast.intent).toBe('windup');
  const startX=fast.x;
  tick(c,1);
  expect(fast.intent).toBe('pounce');
  tick(c,.15);
  expect(fast.x).toBeLessThan(startX);
  expect(reds.filter(e=>e.intent==='windup').length).toBeLessThanOrEqual(RED_BLOB_BASH.nearbyWarningCap);
});

test('moving outside the red floor circle during the warning avoids damage',()=>{
  const {c}=fixture();c.encounters.beginWave(3);
  const red=c.spawn('normal',.9,0,0)!;red.spawnTime=0;
  tick(c);
  expect(red.intent).toBe('windup');
  c.party!.syncLeader({x:0,z:4},0);
  c.update(.5,{x:0,z:4});
  c.update(.3,{x:0,z:4});
  expect(red.intent).toBe('pounce');
  expect(c.hp).toBe(100);
  expect(red.x).toBeCloseTo(.9);
});
