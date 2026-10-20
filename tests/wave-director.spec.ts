import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, RUN_WAVES } from '../src/run-flow';
import { WAVE_DIRECTOR, directorStage } from '../src/wave-director';
import { measureWave, seededRandom } from '../scripts/wave-balance';

const origin = { x: 0, z: 0 };
function fixture(seed = 42) {
  const c = new Combat([], 32, seededRandom(seed));
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.useNavigation = true; c.reset();
  return { c, run: new RunFlow(seededRandom(seed + 1)) };
}
function simulate(run: RunFlow, c: Combat, seconds: number, clear = false) {
  for (let i = 0; i < seconds * 60; i++) {
    run.update(1/60, c, origin);
    if(clear) for(const e of c.enemies) if(!e.rank) e.active = false;
  }
}

test('six plans cover each wave, alternate pressure and harvest, and increase late arrival supply', () => {
  expect(WAVE_DIRECTOR).toHaveLength(6);
  for (let wave = 1; wave <= 6; wave++) {
    const stages = WAVE_DIRECTOR[wave-1].stages;
    expect(stages[stages.length-1].end).toBe(RUN_WAVES[wave-1].seconds);
    expect(directorStage(wave, 0)).toBe(stages[0]);
    stages.forEach((s,i)=>{
      expect(s.end).toBeGreaterThan(i ? stages[i-1].end : 0);
      expect(s.fodderPerSecond).toBeGreaterThan(0);
      expect(s.fastCap+s.tankCap+s.sporeCap).toBeLessThan(RUN_WAVES[wave-1].cap);
      if(s.beat==='release') expect(s.escorts).toHaveLength(0);
      if(i) expect(directorStage(wave,stages[i-1].end)).toBe(s);
    });
    expect(stages.some(s=>s.beat==='pressure' && s.escorts.length>0)).toBe(true);
    expect(stages.some(s=>s.beat==='release')).toBe(true);
  }
  expect(Math.max(...WAVE_DIRECTOR[4].stages.map(s=>s.fodderPerSecond)))
    .toBeGreaterThan(Math.max(...WAVE_DIRECTOR[0].stages.map(s=>s.fodderPerSecond)));
  expect(()=>directorStage(7,0)).toThrow(RangeError);
});

test('opening gives growth space, then actual scheduled escorts appear without clearing any enemies',()=>{
  const {c,run}=fixture(); simulate(run,c,19);
  expect(c.enemies.some(e=>e.active&&e.kind==='fast')).toBe(false);
  simulate(run,c,10);
  expect(run.inspect().director.escortArrivals).toBeGreaterThan(0);
  expect(c.enemies.some(e=>e.active&&e.kind==='fast')).toBe(true);
});

test('nearby crowding slows fodder but cannot erase scheduled pressure',()=>{
  const {c,run}=fixture();run.waveIndex=4;run.waveElapsed=3;
  for(let i=0;i<18;i++)c.spawn('normal',Math.sin(i)*3,Math.cos(i)*3,0);
  const ids=c.enemies.filter(e=>e.active).map(e=>e.id);
  simulate(run,c,12);
  expect(run.inspect().director.escortArrivals).toBeGreaterThan(5);
  expect(c.enemies.filter(e=>e.active&&ids.includes(e.id))).toHaveLength(18);
  expect(c.kills).toBe(0);
  expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(run.definition.cap);
});

test('harvest stops new escorts while increasing fodder and preserving surviving threats',()=>{
  const {c,run}=fixture();run.waveIndex=4;run.waveElapsed=10;
  simulate(run,c,10,true);
  const pressure=run.inspect().director;
  expect(pressure.escortArrivals).toBeGreaterThan(0);
  const survivor=c.spawn('fast',0,8,0)!;
  run.waveElapsed=26;
  simulate(run,c,10);
  const harvest=run.inspect().director;
  expect(harvest.escortArrivals).toBe(pressure.escortArrivals);
  expect(harvest.fodderArrivals-pressure.fodderArrivals).toBeGreaterThan(pressure.fodderArrivals);
  expect(survivor.active).toBe(true);
});

test('quota, blocked placement and full population never turn an event into an over-cap burst',()=>{
  const {c,run}=fixture();run.waveIndex=2;run.waveElapsed=21;
  const s=directorStage(3,21);
  for(let i=0;i<s.fastCap;i++)c.spawn('fast',-20,-20,0);
  for(let i=0;i<s.tankCap;i++)c.spawn('tank',-20,-20,0);
  for(let i=0;i<s.sporeCap;i++)c.spawn('draft-spore-bomber',-20,-20,0);
  simulate(run,c,5);
  for(const [kind,cap] of [['fast',s.fastCap],['tank',s.tankCap],['draft-spore-bomber',s.sporeCap]] as const)
    expect(c.enemies.filter(e=>e.active&&!e.rank&&e.kind===kind).length).toBeLessThanOrEqual(cap);
  for(const e of c.enemies)e.active=false;
  c.spawnViewport={x:0,z:0,halfWidth:100,halfDepth:100};
  simulate(run,c,1);const before=c.spawned;
  simulate(run,c,4);expect(c.spawned).toBe(before);
});

test('authored escorts can use reserved space above the background target',()=>{
  const {c,run}=fixture();run.waveIndex=4;run.waveElapsed=3;
  const target=run.inspect().director.populationTarget;
  for(let i=0;i<target;i++)c.spawn('normal',-20,-20,0);
  simulate(run,c,5);
  expect(run.inspect().director.fodderArrivals).toBe(0);
  expect(run.inspect().director.escortArrivals).toBeGreaterThan(0);
  expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(run.definition.cap);
});

test('elite and Boss warnings suppress escorts without retaining catch-up debt',()=>{
  const {c,run}=fixture();run.waveIndex=5;run.waveElapsed=12;run.prepare(c,origin);
  c.encounters.bossState='dash-windup';
  simulate(run,c,8,true);
  expect(run.inspect().director.escortArrivals).toBe(0);
  expect(run.inspect().director.pendingArrivals).toBe(0);
  c.encounters.bossState='approach';
  simulate(run,c,1,true);expect(run.inspect().director.escortArrivals).toBe(0);
  simulate(run,c,3,true);expect(run.inspect().director.escortArrivals).toBeGreaterThan(0);
});

test('seamless wave change retains pressure budget instead of restarting the opening ramp',()=>{
  const {c,run}=fixture();run.waveIndex=1;run.waveElapsed=69.99;
  simulate(run,c,.02);
  expect(run.wave).toBe(3);
  expect(run.inspect().director.populationTarget).toBeGreaterThanOrEqual(60);
});

test('director remains fixed-seed reproducible in real 60Hz Combat and RunFlow',()=>{
  const params={seed:90125,maxSeconds:10};
  expect(measureWave('bubblesalamander','focused',4,params)).toEqual(measureWave('bubblesalamander','focused',4,params));
});
