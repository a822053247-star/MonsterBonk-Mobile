import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS, FORMAL_POUNCE, RED_BLOB_BASH } from '../src/combat';
import { ENCOUNTER_RULES } from '../src/enemy-challenge';
import { PartySystem } from '../src/party';
import { RunFlow } from '../src/run-flow';

const origin={x:0,z:0};
function fixture(obstacles:{x:number;z:number;radius:number}[]=[]) {
  const c=new Combat(obstacles,32,()=>.25); c.party=new PartySystem(); c.fusionEnabled=true; c.reset();
  c.automaticSpawning=false; c.useNavigation=true; c.encounters.beginWave(6);
  for(const a of c.runBuild.attacks) a.cooldown=10000;
  return c;
}
function advance(c:Combat,seconds:number,p=origin) {
  for(let i=0;i<Math.round(seconds*60);i++) { c.party!.syncLeader(p,0); c.update(1/60,p); }
}
function boss(c:Combat) {
  const e=c.encounters.spawnBoss(c,origin)!;
  expect(e).toBeTruthy(); Object.assign(e,{x:6,z:0,previousX:6,previousZ:0,spawnTime:0}); return e;
}

test('formal melee warns before contact, can be walked out of, and legacy contact is unchanged',()=>{
  const c=fixture(), e=c.spawn('normal',.9,0,0)!;
  advance(c,.5); expect(e.intent).toBe('windup'); expect(c.hp).toBe(100);
  expect(RED_BLOB_BASH.windup).toBe(.75);
  advance(c,.3); expect(c.hp).toBe(92); expect(e.intent).toBe('pounce');
  const evade=fixture(); evade.spawn('normal',.9,0,0); advance(evade,.4); advance(evade,.5,{x:0,z:4}); expect(evade.hp).toBe(100);
  c.encounters.reset(); c.invulnerability=0; c.hp=100; Object.assign(e,{x:.9,z:0,spawnTime:0}); c.update(1/60,origin); expect(c.hp).toBe(92);
});

test('formal runners share the trial lock/windup/dash/recover machine and stop at cover',()=>{
  const c=fixture(), e=c.spawn('fast',5,0,0)!;
  c.update(1/60,origin); expect(e.intent).toBe('windup'); expect(e.hp).toBe(72);
  const aim=[e.aimX,e.aimZ]; advance(c,.6,{x:0,z:5}); expect([e.aimX,e.aimZ]).toEqual(aim); expect(c.hp).toBe(100);
  advance(c,.8,{x:0,z:5}); expect(e.intent).toBe('recover'); expect(c.hp).toBe(100);
  const covered=fixture([{x:2,z:0,radius:1}]), runner=covered.spawn('fast',5,0,0)!;
  Object.assign(runner,{intent:'pounce',intentTime:FORMAL_POUNCE.duration,aimX:-1,aimZ:0});
  advance(covered,.35); expect(runner.x).toBeGreaterThan(3.39); expect(covered.hp).toBe(100);
});

test('Boss locks a visible predictive aim, cycles all three attacks, and summons only pooled warned enemies',()=>{
  const c=fixture(), e=boss(c); c.hp=10000;
  c.playerVelocityZ=4; c.encounters.movement(e,1/60,origin,c,-.75,0);
  expect(c.encounters.bossState).toBe('spread-windup'); expect(c.encounters.aimZ).toBeGreaterThan(0);
  const aim=[c.encounters.aimX,c.encounters.aimZ];
  advance(c,.8,{x:0,z:-3}); expect(c.encounters.shots.filter(s=>s.active)).toHaveLength(0); expect([c.encounters.aimX,c.encounters.aimZ]).toEqual(aim);
  advance(c,.25,{x:0,z:-3}); expect(c.encounters.shots.filter(s=>s.active)).toHaveLength(7);
  const states=new Set<string>(); let summons=0;
  for(let i=0;i<600;i++) {
    c.update(1/60,origin); states.add(c.encounters.bossState);
    summons=Math.max(summons,c.enemies.filter(e=>e.active&&e.rank!=='boss').length);
    expect(c.encounters.shots.filter(s=>s.active).length).toBeLessThanOrEqual(ENCOUNTER_RULES.hostileShots);
  }
  expect(states.has('dash-windup')).toBe(true); expect(states.has('dash')).toBe(true); expect(states.has('summon')).toBe(true);
  expect(summons).toBeGreaterThanOrEqual(3); expect(c.enemies).toHaveLength(COMBAT_LIMITS.enemies); expect(c.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);
});

test('campaign fans grow to seven/nine shots inside the same warned cone; Endless retains five',()=>{
  for (const mode of ['campaign', 'endless'] as const) for (const enraged of [false, true]) {
    const c=fixture(), run=new RunFlow(()=>.25,mode); c.encounters.reset(); run.waveIndex=5; run.prepare(c,origin);
    const e=c.encounters.boss!; Object.assign(e,{x:6,z:0,spawnTime:0});
    if(enraged)e.hp=e.maxHp!/2;
    c.encounters.movement(e,1/60,origin,c,0,0);
    const aim=[c.encounters.aimX,c.encounters.aimZ];
    c.encounters.movement(e,enraged?.79:.99,{x:0,z:5},c,0,0);
    expect(c.encounters.shots.filter(s=>s.active)).toHaveLength(0);
    expect([c.encounters.aimX,c.encounters.aimZ]).toEqual(aim);
    c.encounters.movement(e,.02,origin,c,0,0);
    const shots=c.encounters.shots.filter(s=>s.active);
    expect(shots).toHaveLength(mode==='campaign'?(enraged?9:7):5);
    for(const shot of shots) {
      const offset=Math.atan2(shot.vx*aim[1]-shot.vz*aim[0],shot.vx*aim[0]+shot.vz*aim[1]);
      expect(Math.abs(offset)).toBeLessThanOrEqual(.700001);
    }
    expect(shots[Math.floor(shots.length/2)].vx).toBeCloseTo(aim[0]*ENCOUNTER_RULES.spreadSpeed*(enraged?1.15:1));
    // A nearly full pool drops excess shots without allocating replacements.
    c.encounters.clearShots();for(const shot of c.encounters.shots.slice(0,-2))shot.active=true;
    c.encounters.bossState='spread-windup';c.encounters.bossTime=1;
    c.encounters.movement(e,1/60,origin,c,0,0);
    expect(c.encounters.shots.filter(s=>s.active)).toHaveLength(16);
  }
});

test('campaign doubles charge slots per rotation with recovery; Endless keeps its original rotation',()=>{
  for(const mode of ['campaign','endless'] as const) {
    const c=fixture(),run=new RunFlow(()=>.25,mode);c.encounters.reset();run.waveIndex=5;run.prepare(c,origin);
    const e=c.encounters.boss!;Object.assign(e,{x:6,z:0,spawnTime:0});
    const attacks:string[]=[];let previous=c.encounters.bossState,recovery=0;
    for(let tick=0;tick<60*23;tick++) {
      c.encounters.movement(e,1/60,origin,c,0,0);
      const state=c.encounters.bossState;
      if(previous==='recover')recovery+=1/60;
      if(state!==previous&&state==='approach'){expect(recovery).toBeGreaterThanOrEqual(1.4);recovery=0;}
      if(state!==previous&&state.endsWith('windup'))attacks.push(state);
      previous=state;
    }
    expect(attacks.slice(0,5)).toEqual(mode==='campaign'
      ? ['spread-windup','dash-windup','summon-windup','dash-windup','spread-windup']
      : ['spread-windup','dash-windup','summon-windup','spread-windup','dash-windup']);
  }
});

test('campaign charge travels farther with the same speed and windup; Endless distance stays unchanged',()=>{
  for(const mode of ['campaign','endless'] as const) {
    const c=fixture(),run=new RunFlow(()=>.25,mode);c.encounters.reset();run.waveIndex=5;run.prepare(c,origin);
    const e=c.encounters.boss!;Object.assign(e,{x:-10,z:0,previousX:-10,previousZ:0,spawnTime:0});
    c.useNavigation=false;c.encounters.bossState='dash-windup';c.encounters.aimX=1;c.encounters.aimZ=0;
    const player={x:0,z:8};advance(c,1.05,player);expect(e.x).toBe(-10);
    advance(c,.1,player);expect(c.encounters.bossState).toBe('dash');
    advance(c,.9,player);expect(c.encounters.bossState).toBe('recover');
    expect(e.x+10).toBeCloseTo(mode==='campaign'?12.75:9.75,4);
    expect(c.hp).toBe(100);
  }
});

test('hostile projectiles sweep against players and cover with shared invulnerability; full pools stay bounded',()=>{
  for(const wall of [false,true]) {
    const c=fixture(wall?[{x:-2,z:0,radius:.6}]:[]);
    for(const s of c.encounters.shots) Object.assign(s,{active:true,x:-4,z:0,previousX:-4,previousZ:0,vx:16,vz:0,life:2});
    c.update(.5,origin); expect(c.hp).toBe(wall?100:88);
    expect(c.encounters.shots.every(s=>!s.active)).toBe(true); expect(c.encounters.shots).toHaveLength(16);
  }
  const c=fixture(); boss(c);
  for(const e of c.enemies) if(!e.active)c.spawn('tank',10,10,1);
  c.encounters.bossState='summon-windup'; c.encounters.bossTime=1; c.update(1/60,origin);
  expect(c.enemies.filter(e=>e.active)).toHaveLength(COMBAT_LIMITS.enemies);
  expect(c.encounters.bossState).toBe('summon');
});

test('elite has a dodgeable pulse and pays gold and XP exactly once through shared death settlement',()=>{
  const c=fixture(); c.encounters.beginWave(4);
  const elite=c.encounters.spawnElite(c,origin)!; Object.assign(elite,{x:2,z:0,spawnTime:0}); c.encounters.eliteCooldown=0;
  advance(c,.8); expect(c.encounters.elitePulsing).toBe(true); expect(c.hp).toBe(100);
  advance(c,.6); expect(c.hp).toBe(100-ENCOUNTER_RULES.elitePulseDamage);
  (c as any).damageEnemy(elite,1000,0,0); (c as any).damageEnemy(elite,1000,0,0);
  expect(c.goldEarned).toBe(18); expect(c.kills).toBe(1); expect(c.orbs.filter(o=>o.active).reduce((s,o)=>s+o.value,0)).toBe(24);
  const reused=c.spawn('normal',8,0,0);expect(reused).not.toBe(elite);expect(elite.active).toBe(false);
  expect(c.encounters.spawnElite(c,origin)).toBe(elite);expect(c.encounters.inspect().elite).toBeNull();
  const evade=fixture(); const e=evade.encounters.spawnElite(evade,origin)!; Object.assign(e,{x:2,z:0,spawnTime:0}); evade.encounters.eliteCooldown=0;
  advance(evade,.5); advance(evade,.8,{x:0,z:7}); expect(evade.hp).toBe(100);
});

test('all three real weapons and existing fusions damage the Boss; water cannot immobilize or knock it away',()=>{
  for(const id of ['spark','bubble','leaf'] as const) {
    const c=fixture(),e=boss(c); c.runBuild.acquire(id);
    c.grantUpgrade('split-on-hit'); c.grantUpgrade('chain'); c.grantUpgrade('area');
    for(const a of c.runBuild.attacks) a.cooldown=a.attackId===id?0:10000;
    c.encounters.bossState='recover'; c.encounters.bossTime=-100;
    advance(c,.8); expect(e.hp,id).toBeLessThan(ENCOUNTER_RULES.bossHp); expect(e.knockX).toBe(0); expect(e.knockZ).toBe(0);
    if(id==='bubble') expect(e.slowTime).toBeGreaterThan(0);
  }
  const c=fixture(),e=boss(c); c.encounters.bossState='dash'; c.encounters.aimX=-1; c.encounters.aimZ=0; e.slowTime=100;
  const x=e.x; c.update(1/60,origin); expect(x-e.x).toBeCloseTo(ENCOUNTER_RULES.dashSpeed*.85/60,5);
});

test('final wave requires a real Boss death, waits for death animation, and resolves timeout/death correctly',()=>{
  const c=fixture(),run=new RunFlow(()=>.25); run.waveIndex=5; run.prepare(c,origin);
  const e=c.encounters.boss!; e.spawnTime=0;
  run.update(89,c,origin); expect(run.phase).toBe('fighting');
  (c as any).damageEnemy(e,e.hp,0,0); expect(c.encounters.bossState).toBe('dying');
  c.progression.gainExperience(8); expect(c.progression.awaitingChoice).toBe(true);
  run.update(1,c,origin); expect(run.phase).toBe('fighting'); expect(c.enemies.every(e=>!e.active)).toBe(true);
  advance(c,1.02); run.update(1/60,c,origin); expect(run.phase).toBe('won'); expect(run.bossDefeated).toBe(true);
  const timed=fixture(),timeout=new RunFlow(); timeout.waveIndex=5; timeout.update(90,timed,origin);
  expect(timeout.phase).toBe('lost'); expect(timeout.failure).toBe('boss-timeout'); expect(timeout.bossDefeated).toBe(false);
  const dead=fixture(),loss=new RunFlow(); loss.waveIndex=5; loss.prepare(dead,origin); dead.encounters.bossState='defeated'; dead.hp=0;
  loss.update(1/60,dead,origin); expect(loss.phase).toBe('lost'); expect(loss.failure).toBe('health');
});

test('wave four retries a saturated elite spawn, and wave clears/restarts remove every hostile state',()=>{
  const c=fixture(),run=new RunFlow(); run.waveIndex=3; run.waveElapsed=12;
  for(let i=0;i<COMBAT_LIMITS.enemies;i++) c.spawn('normal',10+i*.1,5,0);
  run.prepare(c,origin); expect(c.encounters.elite).toBeUndefined();
  c.enemies[0].active=false; run.prepare(c,origin); expect(c.encounters.elite?.rank).toBe('elite');
  c.encounters.shots[0].active=true; c.clearWave(); expect(c.encounters.inspect()).toMatchObject({enabled:false,boss:null,elite:null,shots:[]});
  run.waveElapsed=75; run.resolveBoundary(c); expect(run.phase).toBe('fighting');expect(run.wave).toBe(5);
  c.reset(); expect(c.encounters.enabled).toBe(false); expect(c.enemies.every(e=>!e.active)).toBe(true);
});

test('a locked predictive charge hits an unchanged circle but a warning-time reversal avoids it',()=>{
  function attempt(reverse:boolean,enraged=false) {
    const c=fixture(), e=boss(c); Object.assign(e,{x:0,z:0,previousX:0,previousZ:0});
    if(enraged)e.hp=e.maxHp!/2;
    c.encounters.bossState='recover';c.encounters.bossTime=-100;
    let angle=0,direction=1,changed=false;
    for(let tick=0;tick<210;tick++) {
      if(tick===60){c.encounters.bossState='approach';c.encounters.bossTime=0;(c.encounters as any).pattern=1;}
      if(reverse&&!changed&&c.encounters.bossState==='dash-windup'){direction=-1;changed=true;}
      angle+=direction*4.6/8/60;const p={x:8*Math.cos(angle),z:8*Math.sin(angle)};
      c.party!.syncLeader(p,0);c.update(1/60,p);
    }
    return c.hp;
  }
  for(const enraged of [false,true]) {
    expect(attempt(false,enraged)).toBeLessThan(100);expect(attempt(true,enraged)).toBe(100);
  }
});
