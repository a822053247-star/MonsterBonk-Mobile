import { test, expect } from '@playwright/test';
import { Combat, ENEMY_TYPES, SWARM_RULES } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, SHOP_AFTER_WAVE, WAVE_INTERMISSION_SECONDS } from '../src/run-flow';
import { WAVE_DIRECTOR } from '../src/wave-director';

const origin={x:0,z:0};
function fixture() {
  const c=new Combat([],32,()=>.27);
  c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
  return {c,flow:new RunFlow(()=>.27)};
}

test('real formal batches contain fodder, fast flankers and rock tanks, limited by live quotas',()=>{
  const {c}=fixture();c.encounters.beginWave(3);
  const n=c.spawnSwarm(origin,24,120,'normal',{fastCap:9,tankCap:7});
  expect(n).toBeGreaterThan(10);
  const living=c.enemies.filter(e=>e.active);
  const red=living.filter(e=>e.kind==='normal');
  const fast=living.filter(e=>e.kind==='fast');
  const tanks=living.filter(e=>e.kind==='tank');
  expect(red.length).toBeGreaterThan(fast.length);
  expect(red.length).toBeGreaterThan(tanks.length);
  expect(fast.length).toBeGreaterThan(0);
  expect(tanks.length).toBeGreaterThan(0);
  expect(fast.length).toBeLessThanOrEqual(9);
  expect(tanks.length).toBeLessThanOrEqual(7);
  expect(red.every(e=>e.swarm && e.hp===SWARM_RULES.health[2])).toBe(true);
  expect(tanks.every(e=>!e.swarm && e.hp===ENEMY_TYPES.tank.hp*1.5)).toBe(true);
  for(let i=0;i<16;i++) c.spawnSwarm(origin,24,120,'normal',{fastCap:9,tankCap:7});
  expect(c.enemies.filter(e=>e.active&&e.kind==='fast').length).toBeLessThanOrEqual(9);
  expect(c.enemies.filter(e=>e.active&&e.kind==='tank').length).toBeLessThanOrEqual(7);
  expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(120);
});

test('rock tanks have more HP but elite and boss have independent rank pools',()=>{
  const {c}=fixture();c.encounters.beginWave(4);
  expect(ENEMY_TYPES.tank.hp).toBe(125);
  const tank=c.spawn('tank',5,0,0)!;
  expect(tank.maxHp).toBe(225);
  expect(tank.hp).toBe(225);
  const elite=c.encounters.spawnElite(c,origin)!;
  expect(elite.hp).toBe(480);
  c.encounters.beginWave(6);
  const boss=c.encounters.spawnBoss(c,origin)!;
  expect(boss.hp).toBe(6000);
});

test('formal sprinters flank during chase, leap with locked telegraph, then disengage',()=>{
  const {c}=fixture();c.encounters.beginWave(3);
  const sprinter=c.spawn('fast',5,0,0)!;sprinter.spawnTime=0;sprinter.intentCooldown=1;
  const initialZ=sprinter.z;const initialX=sprinter.x;
  c.party!.syncLeader(origin,0);c.update(1/60,origin);
  expect(sprinter.intent).toBe('chase');
  expect(sprinter.z).not.toBeCloseTo(initialZ,6);
  expect(sprinter.x).toBeLessThan(initialX);
  sprinter.intent='recover';sprinter.intentTime=1;
  const retreat=sprinter.x;
  c.update(1/60,origin);
  expect(sprinter.x).toBeGreaterThan(retreat);
  sprinter.intent='windup';sprinter.intentTime=.5;
  c.update(1/60,origin);
  expect(sprinter.intent).toBe('windup');
});

test('battlefield intermission preserves HP/build and blocks shops before the fifth boundary',()=>{
  const {c,flow}=fixture();c.hp=73;
  c.grantUpgrade('damage');
  for(let wave=1;wave<=4;wave++) {
    flow.update(flow.definition.seconds,c,origin);
    expect(flow.phase).toBe('intermission');
    expect(flow.shop).toBeUndefined();
    const frozen=JSON.stringify(c.inspect());
    flow.updateRest(1.5,c);
    expect(flow.phase).toBe('intermission');
    expect(JSON.stringify(c.inspect())).toBe(frozen);
    flow.updateRest(WAVE_INTERMISSION_SECONDS-1.5,c);
    expect(flow.phase).toBe('fighting');
    expect(flow.wave).toBe(wave+1);
    expect(c.hp).toBe(73);
    expect(c.runBuild.attacks[0].level).toBe(1);
  }
  expect(SHOP_AFTER_WAVE).toBe(5);
  flow.update(flow.definition.seconds,c,origin);
  expect(flow.phase).toBe('intermission');
  flow.updateRest(WAVE_INTERMISSION_SECONDS-.1,c);
  expect(flow.shop).toBeUndefined();
  flow.updateRest(.1,c);
  expect(flow.phase).toBe('shop');
  expect(flow.wave).toBe(5);
  expect(flow.shop!.items.length).toBe(4);
});

test('director quotas across six waves never allow the new mixed role mix to exceed each cap',()=>{
  for(let i=0;i<6;i++) {
    const {c,flow}=fixture();flow.waveIndex=i;
    flow.waveElapsed=WAVE_DIRECTOR[i].stages[0].end + 1;
    flow.update(1.2,c,origin);
    flow.update(.35,c,origin);
    const stage=WAVE_DIRECTOR[i].stages[1];
    expect(c.enemies.filter(e=>e.active&&!e.rank&&e.kind==='fast').length).toBeLessThanOrEqual(stage.fastCap);
    expect(c.enemies.filter(e=>e.active&&!e.rank&&e.kind==='tank').length).toBeLessThanOrEqual(stage.tankCap);
    expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(flow.definition.cap);
  }
});
