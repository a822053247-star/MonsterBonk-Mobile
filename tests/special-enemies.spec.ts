import { test, expect } from '@playwright/test';
import { Combat, type Enemy } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, RUN_WAVES } from '../src/run-flow';
import { SPORE_BOMBER, TREASURE_RUNNER } from '../src/special-enemies';

const origin = {x:0,z:0}, far = {x:0,z:20};
function fixture(obstacles: {x:number;z:number;radius:number}[] = []) {
  let seed = 42;
  const c = new Combat(obstacles,32,()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296));
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  c.encounters.beginWave(1);
  for (const attack of c.runBuild.attacks) attack.cooldown = 10000;
  return c;
}
function kill(c: Combat, e: Enemy, origin: 'player'|'spore' = 'player') { e.spawnTime=0; (c as any).damageEnemy(e,100000,0,0,origin); }
function still(e: Enemy) { e.stagger = 10000; return e; }

test('crystals form compact safe groups of 5–8, respect capacity and do not leave partial groups', () => {
  const c=fixture([{x:0,z:9,radius:2}]); c.useNavigation=true;
  for(let i=0;i<4;i++) {
    const count=c.spawnCrystalSwarm(origin,60);
    expect(count).toBeGreaterThanOrEqual(5); expect(count).toBeLessThanOrEqual(8);
  }
  const enemies=c.enemies.filter(e=>e.active);
  for(const e of enemies) {
    expect(e.kind).toBe('draft-crystal-swarm'); expect(e.hp).toBe(8);
    expect(Math.hypot(e.x,e.z-9)).toBeGreaterThanOrEqual(2.6-1e-8);
    expect(Math.hypot(e.x,e.z)).toBeGreaterThan(6);
    for(const other of enemies) if(other!==e) expect(Math.hypot(e.x-other.x,e.z-other.z)).toBeGreaterThanOrEqual(.9-1e-8);
  }
  const before=c.spawned; expect(c.spawnCrystalSwarm(origin,enemies.length+4)).toBe(0); expect(c.spawned).toBe(before);
  const blocked=fixture([{x:0,z:0,radius:40}]); expect(blocked.spawnCrystalSwarm(origin,60)).toBe(0);
});

test('twelve crystal kills award only four XP and one coin, through the existing death entry', () => {
  const c=fixture();
  for(let i=0;i<12;i++) { const e=c.spawn('draft-crystal-swarm',0,8,0)!; kill(c,e); kill(c,e); }
  expect(c.kills).toBe(12); expect(c.goldEarned).toBe(1);
  expect(c.orbs.filter(o=>o.active).reduce((sum,o)=>sum+o.value,0)).toBe(4);
  expect(c.sporeExplosions.some(e=>e.active)).toBe(false); expect(c.treasureRewards.some(e=>e.active)).toBe(false);
});

test('spore death warns for .7 seconds then hurts both monsters and player exactly once', () => {
  const c=fixture(), bomber=still(c.spawn('draft-spore-bomber',0,1,0)!), victim=still(c.spawn('tank',1,1,0)!);
  kill(c,bomber); kill(c,bomber);
  expect(c.sporeExplosions.filter(e=>e.active)).toHaveLength(1);
  c.update(.69,origin); expect(c.hp).toBe(100); expect(victim.hp).toBe(125);
  c.update(.01,origin); expect(c.hp).toBe(88); expect(victim.hp).toBe(80);
  c.update(.1,origin); expect(c.hp).toBe(88); expect(victim.hp).toBe(80);
  c.update(.3,origin); expect(c.sporeExplosions.some(e=>e.active)).toBe(false);
});

test('a spore chain preserves a fresh warning and damage origin for every generation', () => {
  const c=fixture();
  const a=still(c.spawn('draft-spore-bomber',0,0,0)!), b=still(c.spawn('draft-spore-bomber',2,0,0)!), d=still(c.spawn('draft-spore-bomber',4,0,0)!);
  const bid=b.id; kill(c,a); c.update(.7,far);
  expect(b.active).toBe(false); expect(d.active).toBe(true); expect(c.sporeKills).toBe(1);
  expect(c.sporeExplosions.find(e=>e.active&&e.sourceEnemyId===bid)).toMatchObject({origin:'spore',age:0,detonated:false});
  c.update(.69,far); expect(d.active).toBe(true);
  c.update(.01,far); expect(d.active).toBe(false); expect(c.sporeKills).toBe(2); expect(c.kills).toBe(3); expect(c.goldEarned).toBe(3);
});

test('explosion snapshots survive enemy-slot reuse, and every bomber reserves a bounded event slot', () => {
  const c=fixture(), e=c.spawn('draft-spore-bomber',-4,0,0)!, id=e.id; kill(c,e);
  const reused=c.spawn('normal',8,8,0)!; expect(reused).toBe(e); expect(reused.id).not.toBe(id);
  expect(c.sporeExplosions.find(e=>e.active)).toMatchObject({sourceEnemyId:id,x:-4,z:0});
  for(let i=1;i<SPORE_BOMBER.capacity;i++) kill(c,c.spawn('draft-spore-bomber',i,0,0)!);
  expect(c.sporeExplosions.filter(e=>e.active)).toHaveLength(SPORE_BOMBER.capacity);
  expect(c.spawn('draft-spore-bomber',0,0,0)).toBeUndefined();
  c.update(1.1,far); expect(c.spawn('draft-spore-bomber',0,0,0)).toBeDefined();
});

test('cover and spawn protection block spore damage', () => {
  const cover = [{x:0,z:0,radius:.35}];

  // Check blocked enemy splash and the spawning immunity without placing a tank
  // directly on top of the player (which legitimately causes 16 contact damage).
  const c=fixture(cover), bomber=c.spawn('draft-spore-bomber',-1,0,0)!, victim=still(c.spawn('tank',1,0,0)!);
  const spawning=c.spawn('normal',-1,1,2)!;
  kill(c,bomber); c.update(.7,{x:0,z:20});
  expect(victim.hp).toBe(125);
  expect(spawning.hp).toBe(30);

  // Check player cover separately: this fixture has no nearby live tank.
  const protectedPlayer=fixture(cover), secondBomber=protectedPlayer.spawn('draft-spore-bomber',-1,0,0)!;
  kill(protectedPlayer,secondBomber);
  protectedPlayer.update(.7,{x:1,z:0});
  expect(protectedPlayer.hp).toBe(100);
});

test('runner lingers, flees away, never bites, and escapes without rewards', () => {
  const c=fixture(), runner=c.spawn('draft-treasure-runner',1,0,0)!;
  c.update(1,origin); expect(runner.x).toBeCloseTo(1); expect(c.hp).toBe(100);
  c.update(.3,origin); expect(runner.x).toBeGreaterThan(1);
  for(let i=0;i<80;i++) c.update(.1,origin);
  expect(runner.active).toBe(false); expect(c.treasureEscapes).toBe(1); expect(c.kills).toBe(0); expect(c.goldEarned).toBe(0); expect(c.orbs.some(o=>o.active)).toBe(false);
});

test('runner kill gives a single visible 12-coin bonus and 8 XP, collected by RunFlow once', () => {
  const c=fixture(), run=new RunFlow(), e=c.spawn('draft-treasure-runner',0,8,0)!; kill(c,e); kill(c,e);
  expect(c.goldEarned).toBe(TREASURE_RUNNER.coins); expect(c.treasureRewards.filter(e=>e.active)).toHaveLength(1);
  expect(c.orbs.filter(e=>e.active).reduce((s,e)=>s+e.value,0)).toBe(TREASURE_RUNNER.xp);
  run.update(.01,c,origin); run.update(.01,c,origin); expect(run.coins).toBe(12);
});

test('upgrade pause, zero dt, wave clear, reset and boss death freeze or remove all special events', () => {
  const c=fixture(); kill(c,c.spawn('draft-spore-bomber',0,1,0)!); kill(c,c.spawn('draft-treasure-runner',0,8,0)!);
  const runner=c.spawn('draft-treasure-runner',5,0,0)!;
  c.progression.gainExperience(100); const before=JSON.stringify(c.inspect()); c.update(2,origin); expect(JSON.stringify(c.inspect())).toBe(before);
  c.update(0,origin); expect(runner.specialTime).toBe(0);
  c.clearWave(); expect(c.sporeExplosions.some(e=>e.active)).toBe(false); expect(c.treasureRewards.some(e=>e.active)).toBe(false);
  c.reset(); expect(c.treasureEscapes).toBe(0); expect(c.sporeKills).toBe(0);
  c.encounters.beginWave(6); kill(c,c.spawn('draft-spore-bomber',0,1,0)!);
  c.encounters.spawnBoss(c,origin); c.encounters.killedBoss(c);
  expect(c.sporeExplosions.some(e=>e.active)).toBe(false);
});

test('formal scheduling introduces the enemies by wave and stays under each shared cap', () => {
  for(let wave=1;wave<=6;wave++) {
    const c=fixture(), run=new RunFlow(); run.waveIndex=wave-1;
    const kinds=new Set<string>(); let runners=0;
    // Events belong to pressure windows, including late-wave spikes.
    for(let i=0;i<(RUN_WAVES[wave-1].seconds-1)*60;i++) {
      run.update(1/60,c,origin);
      expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(RUN_WAVES[wave-1].cap);
      for(const e of c.enemies) if(e.active) { kinds.add(e.kind); if(e.kind==='draft-treasure-runner') runners++; e.active=false; }
    }
    expect(kinds.has('draft-crystal-swarm')).toBe(true);
    expect(kinds.has('draft-spore-bomber')).toBe(wave>=2); expect(kinds.has('draft-treasure-runner')).toBe(wave>=2);
    expect(runners).toBe(wave>=2?1:0);
  }
});

test('special scheduling cannot overflow a crowded wave or leak into legacy auto spawning', () => {
  const c=fixture(), run=new RunFlow(); run.waveIndex=1;
  for(let i=0;i<90;i++) c.spawn('normal',10,10,0);
  for(let i=0;i<30;i++) run.update(1,c,origin);
  expect(c.enemies.filter(e=>e.active)).toHaveLength(90); expect(c.enemies.filter(e=>e.active).every(e=>e.kind==='normal')).toBe(true);
  c.reset(); c.automaticSpawning=true;
  for(let i=0;i<600;i++) c.update(.1,origin);
  expect(c.enemies.every(e=>!e.active||['normal','fast','tank'].includes(e.kind))).toBe(true);
});

test('crowded waves stop refilling until the soft budget has room for mixed arrivals', () => {
  const c=fixture(), run=new RunFlow();
  for(let i=0;i<60;i++) c.spawn('normal',10,10,0);
  run.update(8,c,origin);
  for(let i=0;i<15;i++) {
    c.enemies.find(e=>e.active&&e.kind==='normal')!.active=false;
    run.update(.2,c,origin);
    expect(c.enemies.filter(e=>e.active).length).toBeLessThanOrEqual(60);
  }
  expect(c.enemies.filter(e=>e.active&&e.kind==='draft-crystal-swarm').length).toBe(0);
  for(const enemy of c.enemies)enemy.active=false;
  for(let i=0;i<30;i++)run.update(.2,c,origin);
  expect(c.enemies.filter(e=>e.active&&e.kind==='draft-crystal-swarm').length).toBeGreaterThan(0);
});

test('real firebolts kill a bomber and a treasure runner through their special death settlements', () => {
  for(const kind of ['draft-spore-bomber','draft-treasure-runner'] as const) {
    const c=fixture(), e=still(c.spawn(kind,0,4,0)!); c.invulnerability=100;
    c.runBuild.attacks[0].cooldown=0;
    let warned=false;
    for(let tick=0;tick<720&&e.active;tick++) { c.party!.syncLeader(origin,0); c.update(1/60,origin); warned ||= c.sporeExplosions.some(e=>e.active); }
    expect(e.active).toBe(false); expect(c.kills).toBe(1);
    if(kind==='draft-spore-bomber') expect(warned).toBe(true);
    else { expect(c.goldEarned).toBe(12); expect(c.treasureRewards.some(e=>e.active)).toBe(true); }
  }
});

test('crystals serve as real burst-seed chain targets without adding their own effects', () => {
  const c=fixture(); expect(c.grantUpgrade('split-on-hit')).toBe(true);
  for(let i=0;i<8;i++) still(c.spawn('draft-crystal-swarm',(i%4)*.35-.5,4+Math.floor(i/4)*.4,0)!);
  c.runBuild.attacks[0].cooldown=0;
  for(let tick=0;tick<90;tick++) { c.party!.syncLeader(origin,0); c.update(1/60,origin); }
  expect(c.bursts).toBeGreaterThan(0); expect(c.kills).toBe(8);
  expect(c.sporeExplosions.some(e=>e.active)).toBe(false);
});

test('a player killed by an explosion loses even if that explosion also kills the Boss', () => {
  const c=fixture(), run=new RunFlow(); run.waveIndex=5; run.prepare(c,origin);
  const boss=c.encounters.boss!; boss.spawnTime=0; boss.x=0; boss.z=1; boss.hp=1; boss.stagger=10000;
  c.hp=1; kill(c,c.spawn('draft-spore-bomber',0,1,0)!); c.update(.7,origin); run.update(.7,c,origin);
  expect(c.hp).toBe(0); expect(run.phase).toBe('lost'); expect(run.failure).toBe('health');
});
