import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, RUN_WAVES } from '../src/run-flow';
import { populationBudget, SPAWN_LAYOUT } from '../src/spawn-layout';
import { seededRandom } from '../scripts/wave-balance';

const origin={x:0,z:0};
function fixture(seed=42) {
  const c=new Combat([],32,seededRandom(seed));c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.useNavigation=true;c.reset();
  return {c,run:new RunFlow(seededRandom(seed+1))};
}

test('arrivals are outside landscape and portrait footprints, remain within world bounds, and cover several directions',()=>{
  for(const view of [{x:0,z:0,halfWidth:18.4,halfDepth:12},{x:0,z:0,halfWidth:14,halfDepth:42.9},{x:29,z:0,halfWidth:18.4,halfDepth:12}]) {
    const {c,run}=fixture(42);c.spawnViewport=view;const player={x:view.x,z:view.z};
    const quadrants=new Set<string>();
    for(let i=0;i<1800;i++) {
      const before=new Set(c.enemies.filter(e=>e.active).map(e=>e.id));run.update(1/60,c,player);
      for(const e of c.enemies.filter(e=>e.active&&!before.has(e.id)&&!e.rank)) {
        expect(Math.abs(e.x-view.x)>view.halfWidth||Math.abs(e.z-view.z)>view.halfDepth).toBe(true);
        expect(Math.hypot(e.x-player.x,e.z-player.z)).toBeGreaterThanOrEqual(SPAWN_LAYOUT.minDistance);
        expect(Math.hypot(e.x-player.x,e.z-player.z)).toBeLessThanOrEqual(SPAWN_LAYOUT.maxDistance);
        expect(Math.hypot(e.x,e.z)).toBeLessThanOrEqual(32-c.enemyRadius(e)-.2+1e-8);
        quadrants.add(`${Math.sign(e.x-player.x)},${Math.sign(e.z-player.z)}`);
      }
    }
    expect(c.spawned).toBeGreaterThan(5);expect(quadrants.size).toBeGreaterThanOrEqual(view.x===0?3:2);
  }
});

test('background feed is rate limited with at most one birth per update and no rapid-clear catch-up',()=>{
  const {c,run}=fixture();const times:number[]=[];
  for(let tick=0;tick<480;tick++) {
    const before=c.spawned;run.update(1/60,c,origin);const count=c.spawned-before;
    expect(count).toBeLessThanOrEqual(1);if(count)times.push(tick/60);
    for(const e of c.enemies)e.active=false;
  }
  expect(times.length).toBeGreaterThanOrEqual(6);
  for(let i=1;i<times.length;i++)expect(times[i]-times[i-1]).toBeGreaterThanOrEqual(1/1.5-1e-8);
});

test('nearby pressure still permits background supply without despawning existing enemies',()=>{
  const {c,run}=fixture();run.waveIndex=4;
  for(let i=0;i<18;i++)c.spawn('normal',Math.sin(i)*3,Math.cos(i)*3,0);
  const ids=c.enemies.filter(e=>e.active).map(e=>e.id);
  for(let i=0;i<60;i++)run.update(1/60,c,origin);expect(c.spawned).toBeGreaterThan(18);
  expect(c.enemies.filter(e=>e.active&&ids.includes(e.id))).toHaveLength(ids.length);expect(c.kills).toBe(0);
  for(const e of c.enemies)e.active=false;
  run.update(3,c,origin);expect(c.enemies.filter(e=>e.active)).toHaveLength(1);
});

test('a full harvest never removes survivors, and blocked edges never fall back near the player',()=>{
  const {c,run}=fixture();run.waveIndex=4;run.waveElapsed=32;
  for(let i=0;i<112;i++)c.spawn('normal',-20,-20,0);
  run.update(1,c,origin);expect(c.enemies.filter(e=>e.active)).toHaveLength(112);expect(c.spawned).toBe(112);
  expect(run.inspect().director.populationTarget).toBe(112);
  c.clearWave();c.encounters.beginWave(1);c.spawnViewport={x:0,z:0,halfWidth:100,halfDepth:100};
  expect(c.spawnSwarm(origin,4,36,'normal',undefined,0)).toBe(0);
  expect(c.spawnSwarm(origin,4,36,'normal',undefined,NaN)).toBe(0);
});

test('only the run opening ramps; harvest keeps chain fuel and identical seeds reproduce positions',()=>{
  expect(populationBudget(112,.8,0)).toBeLessThan(populationBudget(112,.8,18));
  expect(populationBudget(112,1,60)).toBeGreaterThan(populationBudget(112,.9,50));
  const runOnce=()=>{const {c,run}=fixture(916);for(let i=0;i<1800;i++)run.update(1/60,c,origin);return c.inspect()};
  expect(runOnce()).toEqual(runOnce());
});

test('Boss summons share the reduced final-wave hard ceiling',()=>{
  const {c,run}=fixture();run.waveIndex=5;run.prepare(c,origin);c.encounters.boss!.spawnTime=0;
  for(let i=1;i<RUN_WAVES[5].cap;i++)c.spawn('normal',-20,-20,0);
  c.encounters.bossState='summon-windup';c.encounters.bossTime=1;c.invulnerability=1000;
  c.party!.syncLeader(origin,0);c.update(1/60,origin);
  expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(RUN_WAVES[5].cap);
});
