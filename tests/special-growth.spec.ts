import { test, expect } from '@playwright/test';
import { Combat, type Enemy } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { RunFlow, WAVE_INTERMISSION_SECONDS } from '../src/run-flow';
import { RunShop } from '../src/shop';
import { TREASURE_RUNNER } from '../src/special-enemies';
import { seededRandom } from '../scripts/wave-balance';

const origin={x:0,z:0};
function fixture(species:SpeciesId='yanrong') {
  const c=new Combat([],32,seededRandom(93));
  c.party=new PartySystem();c.party.reset([species]);c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
  return {c,run:new RunFlow(seededRandom(107))};
}
function kill(c:Combat,e:Enemy,originKind:'player'|'spore'='player') {
  e.spawnTime=0;(c as any).damageEnemy(e,100000,0,0,originKind);
}
function boundary(c:Combat,run:RunFlow) {
  run.waveElapsed=run.definition.seconds;
  run.resolveBoundary(c);
  while(c.progression.awaitingChoice) expect(c.chooseUpgrade(c.progression.offers[0])).toBe(true);
  run.resolveBoundary(c);
  if(run.phase==='intermission') run.updateRest(WAVE_INTERMISSION_SECONDS,c);
  else expect(run.phase).toBe('fighting');
}
function fifthShop(c:Combat,run:RunFlow) {
  run.waveIndex=4;run.prepare(c,origin);
  boundary(c,run);
  expect(run.phase).toBe('shop');
  return run.shop!;
}

test('a treasure caught before wave five preserves original coin/XP plus one deferred refresh',()=>{
  const {c,run}=fixture();
  run.waveIndex=1;run.prepare(c,origin);
  const runner=c.spawn('draft-treasure-runner',0,8,0)!;
  kill(c,runner);kill(c,runner);
  expect(c.treasureCaught).toBe(1);expect(c.goldEarned).toBe(TREASURE_RUNNER.coins);
  expect(c.orbs.filter(o=>o.active).reduce((n,o)=>n+o.value,0)).toBe(TREASURE_RUNNER.xp);
  boundary(c,run);
  expect(run.phase).toBe('fighting');expect(run.wave).toBe(3);
  for(const wave of [3,4]) {expect(run.wave).toBe(wave);boundary(c,run);}
  const shop=fifthShop(c,run);
  expect(run.lastWaveGrowth.treasureCaught).toBe(0);
  expect(shop.treasureRefreshes).toBe(1);expect(shop.refreshCost).toBe(0);
  const old=shop.token,coins=run.coins;
  expect(run.refresh(old)).toBe(true);expect(run.coins).toBe(coins);
  expect(shop.refreshCost).toBe(5);
  expect(run.refresh(old)).toBe(false);
  expect(run.refresh(shop.token)).toBe(true);expect(run.coins).toBe(coins-5);
  expect(shop.refreshCost).toBe(10);
  expect(run.nextWave(shop.token,c)).toBe(true);
  expect(run.wave).toBe(6);expect(run.shop).toBeUndefined();
});

test('treasure escape cannot create a free shop voucher',()=>{
  const {c,run}=fixture();run.waveIndex=4;run.prepare(c,origin);
  const runner=c.spawn('draft-treasure-runner',0,4,0)!;runner.spawnTime=0;
  c.update(9,origin);expect(runner.active).toBe(false);expect(c.treasureEscapes).toBe(1);
  expect(c.treasureCaught).toBe(0);
  const shop=fifthShop(c,run);
  expect(shop.treasureRefreshes).toBe(0);expect(shop.refreshCost).toBe(5);
  expect(run.refresh(shop.token)).toBe(true);expect(shop.refreshCost).toBe(10);
});

test('all three initial creatures have a build-matched shop option without any catch',()=>{
  const cases:[SpeciesId,string][]=[['yanrong','split-on-hit'],['bubblesalamander','area'],['sproutspike','chain']];
  for(const [species,id]of cases) {
    const {c}=fixture(species),shop=new RunShop(c,5,()=>0);
    expect(shop.items[1]).toMatchObject({kind:'reward',skill:id,price:25});
    expect(shop.items).toHaveLength(4);expect(shop.refreshCost).toBe(5);
  }
});

test('real spore-chain kills grant a bounded bonus once, and only a fifth-wave shop appears',()=>{
  const {c,run}=fixture();run.waveIndex=4;run.prepare(c,origin);
  const a=c.spawn('draft-spore-bomber',0,0,0)!;
  const b=c.spawn('draft-spore-bomber',2,0,0)!;
  kill(c,a);b.spawnTime=0;c.update(.7,{x:15,z:15});
  expect(b.active).toBe(false);expect(c.balanceTelemetry.sporeChainKills).toBe(1);
  const shop=fifthShop(c,run);
  expect(run.lastWaveGrowth.sporeBonus).toBe(3);
  expect(run.coins).toBe(55+2+3);
  const saved=run.coins;run.resolveBoundary(c);expect(run.coins).toBe(saved);
  expect(shop.treasureRefreshes).toBe(0);
});

test('chain bounty is capped at nine per wave with no replay on the next wave',()=>{
  const {c,run}=fixture();run.waveIndex=3;run.prepare(c,origin);
  for(let i=0;i<5;i++)kill(c,c.spawn('draft-spore-bomber',i,8,0)!, 'spore');
  expect(c.balanceTelemetry.sporeChainKills).toBe(5);
  boundary(c,run);
  expect(run.lastWaveGrowth.sporeBonus).toBe(9);
  expect(run.phase).toBe('fighting');expect(run.coins).toBe(50+5+9);
  const saved=run.coins;
  const shop=fifthShop(c,run);
  expect(run.lastWaveGrowth.sporeBonus).toBe(0);
  expect(run.coins).toBe(saved+55);expect(shop.treasureRefreshes).toBe(0);
});

test('historical modes never receive formal shop entitlements',()=>{
  const c=new Combat([],32,seededRandom(17));c.reset();
  kill(c,c.spawn('draft-treasure-runner',0,4,0)!);
  expect(c.treasureCaught).toBe(0);
  c.reset();expect(c.treasureCaught).toBe(0);
});
