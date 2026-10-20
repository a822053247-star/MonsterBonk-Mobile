import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow } from '../src/run-flow';
import { ENCOUNTER_RULES } from '../src/enemy-challenge';
import { resolveAttackRules, WEAPON_DAMAGE_PER_LEVEL } from '../src/relics';
import { FLAME_SWEEP, flameSweepStats } from '../src/flame-sweep';
import type { BaseAttackId } from '../src/fusion';

const player = {x:0,z:0};
function setup(wave=4) {
  const combat = new Combat([], 32, () => .25);
  combat.party = new PartySystem();
  combat.fusionEnabled = true;
  combat.automaticSpawning = false;
  combat.reset();
  const flow = new RunFlow(() => .25);
  flow.waveIndex = wave-1;
  flow.prepare(combat,player);
  return {combat,flow};
}

test('all four weapons keep first-rank impact but have slower late-level damage growth',()=>{
  const weights:Record<BaseAttackId,number> = {spark:.16,bubble:.18,leaf:.16,'flame-sweep':.12};
  expect(WEAPON_DAMAGE_PER_LEVEL).toEqual(weights);
  for(const id of Object.keys(weights) as BaseAttackId[]) {
    expect(resolveAttackRules(id,[],1,1).damageMultiplier).toBe(1);
    expect(resolveAttackRules(id,[],1,3).damageMultiplier).toBeCloseTo(1+weights[id]*2);
    expect(resolveAttackRules(id,[],1,5).damageMultiplier).toBeCloseTo(1+weights[id]*4);
    expect(resolveAttackRules(id,[],1,5).damageMultiplier).toBeLessThan(1.8);
  }
  expect(resolveAttackRules('spark',['specialist-badge'],1,5).damageMultiplier).toBeCloseTo(1.64*1.45);
  expect(flameSweepStats(5).degrees).toBe(360);
  expect(FLAME_SWEEP.eliteMultiplier).toBe(.70);
});

test('elite is durable but warns for 1.3 seconds and drops only earned resources',()=>{
  const {combat,flow}=setup(4);
  const enemy=combat.encounters.elite!;
  expect(enemy).toBeUndefined();
  flow.waveElapsed=12;
  flow.prepare(combat,player);
  const elite=combat.encounters.elite!;
  expect(elite.hp).toBe(480);
  expect(ENCOUNTER_RULES.eliteWindup).toBe(1.3);
  expect(ENCOUNTER_RULES.elitePulseDamage).toBe(20);
  elite.x=2;elite.z=0;elite.spawnTime=0;
  combat.encounters.eliteCooldown=0;
  combat.encounters.movement(elite,.01,player,combat,0,0);
  for(let i=0;i<60;i++)combat.encounters.movement(elite,1/60,player,combat,0,0);
  expect(combat.encounters.elitePulsing).toBe(true);
  expect(combat.hp).toBe(100);
  combat.encounters.movement(elite,.35,player,combat,0,0);
  combat.encounters.advanceHazards(0,combat,player,player);
  expect(combat.hp).toBe(80);
  (combat as any).damageEnemy(elite,elite.hp,0,0);
  expect(combat.goldEarned).toBe(18);
  expect(combat.orbs.filter(o=>o.active).reduce((n,o)=>n+o.value,0)).toBe(24);
  expect(combat.runBuild.evolution).toBeUndefined();
});

test('spore warning blocks fresh elite windup until the explosive resolves',()=>{
  const {combat,flow}=setup(4);
  flow.waveElapsed=12;
  flow.prepare(combat,player);
  const elite=combat.encounters.elite!;
  elite.x=2;elite.z=0;elite.spawnTime=0;
  combat.encounters.eliteCooldown=0;
  const spore=combat.spawn('draft-spore-bomber',0,5,0)!;
  spore.spawnTime=0;
  (combat as any).damageEnemy(spore,spore.hp,0,0);
  combat.encounters.movement(elite,.1,player,combat,0,0);
  expect(combat.encounters.elitePulsing).toBe(false);
  combat.update(.7,{x:15,z:15});
  combat.encounters.movement(elite,.01,player,combat,0,0);
  expect(combat.encounters.elitePulsing).toBe(true);
});

test('elite and boss warnings suppress new escorts without removing fodder',()=>{
  for(const wave of [4,6]) {
    const {combat,flow}=setup(wave);
    if(wave===4) {
      flow.waveElapsed=13;flow.prepare(combat,player);
      combat.encounters.elitePulsing=true;
    } else combat.encounters.bossState='dash-windup';
    flow.update(1.2,combat,player);
    flow.update(.35,combat,player);
    const adds=combat.enemies.filter(e=>e.active&&!e.rank);
    expect(adds.length).toBeGreaterThan(0);
    expect(adds.every(e=>e.kind==='normal'||e.kind==='draft-crystal-swarm')).toBe(true);
    expect(combat.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(flow.definition.cap);
  }
});
