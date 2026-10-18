import { test, expect } from '@playwright/test';
import { Challenge, CHALLENGE, CHALLENGE_WAVES } from '../src/challenge';
import { Combat, COMBAT_LIMITS } from '../src/combat';
const STEP = 1 / 60;
const create = () => ({ director: new Challenge(), combat: new Combat([], 100, () => .4, 'horn-challenge') });
function killActive(combat: Combat) { for (const e of combat.enemies) if (e.active) { e.hp = 0; e.active = false; combat.kills++; } }
function clearAll(director: Challenge, combat: Combat) {
  for (let i=0;i<1800&&director.phase!=='won';i++){director.update(STEP,combat,{x:0,z:0});killActive(combat);}
}

test('finite waves spawn exactly their configured enemies and victory never requires optional techniques', () => {
  const {director,combat}=create();
  for(let i=0;i<600;i++)combat.update(STEP,{x:0,z:0});
  expect(combat.spawned).toBe(0); // Infinite survival spawner is disabled only here.
  clearAll(director,combat);
  expect(director.phase).toBe('won');expect(combat.spawned).toBe(15);expect(combat.kills).toBe(15);
  expect(director.stars(combat)).toBe(1);expect(director.inspect(combat)).toMatchObject({wave:3,remaining:0,defeated:8});
  const frozen=director.inspect(combat);director.update(10,combat,{x:0,z:0});expect(director.inspect(combat)).toEqual(frozen);
});

test('remaining queued enemies prevent early clears, rest lasts three simulation seconds, and running away respawns targets', () => {
  const {director,combat}=create();
  for(let i=0;i<73;i++)director.update(STEP,combat,{x:0,z:0});
  expect(combat.spawned).toBe(1);killActive(combat);director.update(STEP,combat,{x:0,z:0});
  expect(director.phase).toBe('fighting');expect(director.remaining).toBe(3);
  for(let i=0;i<60;i++)director.update(STEP,combat,{x:0,z:0});
  const escaped=combat.enemies.find(e=>e.active)!;escaped.active=false;
  director.update(STEP,combat,{x:0,z:0});expect(director.defeated).toBe(1);expect(director.remaining).toBe(3);
  while(director.phase==='fighting'){killActive(combat);director.update(STEP,combat,{x:0,z:0});}
  expect(director.restTime).toBe(CHALLENGE.rest);
  for(let i=0;i<179;i++)director.update(STEP,combat,{x:0,z:0});
  expect(director.wave).toBe(0);director.update(STEP,combat,{x:0,z:0});expect(director.wave).toBe(1);
});

test('upgrades/death freeze wave timers, and final kills win before an unused upgrade', () => {
  const {director,combat}=create();combat.progression.gainExperience(8);
  const frozen=director.inspect(combat);director.update(1,combat,{x:0,z:0});expect(director.inspect(combat)).toEqual(frozen);
  combat.chooseUpgrade(combat.progression.offers[0]);combat.hp=0;
  const dead=director.inspect(combat);director.update(1,combat,{x:0,z:0});expect(director.inspect(combat)).toEqual(dead);
  combat.hp=100;
  for(let i=0;i<1800&&director.phase!=='won';i++){
    director.update(STEP,combat,{x:0,z:0});
    const last=director.wave===2&&director.remaining===1&&combat.enemies.some(e=>e.active);
    killActive(combat);if(last)combat.progression.gainExperience(12);
  }
  expect(combat.progression.awaitingChoice).toBe(true);expect(director.phase).toBe('won');
});

test('bonuses add stars only after winning and fresh directors carry no previous progress', () => {
  const {director,combat}=create();combat.hornHits=6;combat.interrupts=2;
  expect(director.stars(combat)).toBe(0);clearAll(director,combat);expect(director.stars(combat)).toBe(3);
  combat.interrupts=1;expect(director.stars(combat)).toBe(2);
  expect(new Challenge().inspect(combat)).toMatchObject({wave:1,phase:'fighting',defeated:0,remaining:4,stars:0});
  const classic=new Combat();for(let i=0;i<180;i++)classic.update(STEP,{x:0,z:0});expect(classic.spawned).toBeGreaterThan(0);
});

test('encounter retries respect cover, boundaries and pool capacity without losing the wave queue', () => {
  const blocked=new Combat([{x:0,z:0,radius:100}],100,()=>.4,'horn-challenge'),director=new Challenge();
  for(let i=0;i<240;i++)director.update(STEP,blocked,{x:0,z:0});expect(blocked.spawned).toBe(0);expect(director.remaining).toBe(4);
  const {combat}=create();for(let i=0;i<COMBAT_LIMITS.enemies;i++)combat.spawn('tank',20,0,0);
  expect(combat.spawnEncounter('fast',{x:0,z:0})).toBeUndefined();
  let seed=3;const safe=new Combat([{x:0,z:6,radius:1}],12,()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),'horn-challenge');
  for(let i=0;i<8;i++){const e=safe.spawnEncounter('tank',{x:6,z:0});if(e){expect(Math.hypot(e.x,e.z)).toBeLessThanOrEqual(10.95);expect(Math.hypot(e.x,e.z-6)).toBeGreaterThan(2.15);expect(e.spawnTime).toBe(.75);}}
});

test('30/60/120 Hz render schedules produce the same fixed-step wave progression', () => {
  const run=(fps:number)=>{const {director,combat}=create();let acc=0;for(let f=0;f<fps*24;f++){acc+=1/fps;while(acc+1e-9>=STEP){acc-=STEP;director.update(STEP,combat,{x:0,z:0});killActive(combat)}}return {state:director.inspect(combat),spawned:combat.spawned};};
  expect(run(30)).toEqual(run(60));expect(run(120)).toEqual(run(60));
  expect(CHALLENGE_WAVES.map(w=>w.enemies.length)).toEqual([4,3,8]);
});
