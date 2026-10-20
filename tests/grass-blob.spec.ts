import {test,expect} from '@playwright/test';
import {Combat} from '../src/combat';
import {PartySystem} from '../src/party';
import {GRASS_BLOB,stepGrassRoll,grassBlobRoll,grassCrowdMotionScale,GRASS_ROLL_VISUAL} from '../src/grass-blob';

const origin={x:0,z:0};
function fixture() {
  const c=new Combat([],32,()=>.25);c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();c.encounters.beginWave(2);
  c.runBuild.attacks[0].cooldown=10000;return c;
}
function advance(c:Combat,seconds:number,player=origin) {
  for(let i=0;i<Math.round(seconds*60);i++){c.party!.syncLeader(player,0);c.update(1/60,player);}
}

test('dense grass crowds attenuate rotation and never flip the body upside down',()=>{
  expect(grassCrowdMotionScale(1)).toBe(1);
  expect(grassCrowdMotionScale(12)).toBe(1);
  expect(grassCrowdMotionScale(24)).toBe(.5);
  expect(grassCrowdMotionScale(48)).toBe(.25);
  expect(grassCrowdMotionScale(200)).toBe(.25);
  for(const count of [1,12,24,48,200])for(let frame=0;frame<=48;frame++) {
    const angle=grassBlobRoll({intent:'chase',intentTime:0,grassCycle:frame/60,
      grassRollDistance:Math.min(frame/36,1)*GRASS_ROLL_VISUAL.circumference},grassCrowdMotionScale(count));
    expect(Math.abs(angle)).toBeLessThanOrEqual(GRASS_ROLL_VISUAL.maxTilt*grassCrowdMotionScale(count)+1e-8);
  }
});

test('formal grass rolls for .6 seconds, rests for .2, and commits its heading until the next roll',()=>{
  const c=fixture(),e=c.spawn('normal',7,0,0)!;
  advance(c,.3);expect(e.x).toBeLessThan(7);
  const z=e.z;advance(c,.3,{x:0,z:5});expect(e.z).toBeCloseTo(z);
  const point={x:e.x,z:e.z};advance(c,.2,{x:0,z:5});
  expect(e.x).toBeCloseTo(point.x);expect(e.z).toBeCloseTo(point.z);
  advance(c,.1,{x:0,z:5});expect(e.z).toBeGreaterThan(z);
});

test('body tilts gently, settles upright, and ignores blocked motion and knockback',()=>{
  const c=fixture(),e=c.spawn('normal',7,0,0)!;
  advance(c,.15);expect(grassBlobRoll(e)).toBeCloseTo(Math.sin(Math.PI/4)*GRASS_ROLL_VISUAL.maxTilt);
  advance(c,.15);expect(grassBlobRoll(e)).toBeCloseTo(GRASS_ROLL_VISUAL.maxTilt);
  advance(c,.3);expect(grassBlobRoll(e)).toBeCloseTo(0);
  const distance=e.grassRollDistance;advance(c,.2);
  expect(e.grassRollDistance).toBeCloseTo(distance!);expect(Math.sin(grassBlobRoll(e))).toBeCloseTo(0);
  e.intent='windup';e.intentTime=GRASS_BLOB.windup-GRASS_BLOB.roll;
  expect(grassBlobRoll(e)).toBe(0);
  const blocked=fixture();(blocked as any).obstacles=[{x:5.95,z:0,radius:.5}];
  const stuck=blocked.spawn('normal',7,0,0)!;
  advance(blocked,.15);expect(stuck.grassRollDistance).toBeCloseTo(0);expect(grassBlobRoll(stuck)).toBeCloseTo(0);
  stuck.stagger=1;stuck.knockX=3;advance(blocked,.1);
  expect(stuck.x).toBeGreaterThan(7);expect(stuck.grassRollDistance).toBeCloseTo(0);
});

test('roll integrator has consistent 30/60/120 Hz travel and a bounded turn per roll',()=>{
  const distances=[30,60,120].map(hz=>{
    const state={},out={x:0,z:0};let distance=0;
    for(let i=0;i<hz*8;i++){stepGrassRoll(state,1/hz,1,0,1.25,out);distance+=out.x/hz;}
    return distance;
  });
  for(const distance of distances)expect(distance).toBeCloseTo(1.25*1.25*.6*10,5);
  const state={grassCycle:0,grassRollX:1,grassRollZ:0},out={x:0,z:0};
  stepGrassRoll(state,.1,-1,0,1.25,out);
  expect(Math.acos(state.grassRollX)).toBeCloseTo(GRASS_BLOB.turnPerRoll);
});

test('rooted warning fixes its center, gives .75s notice, hits once and exposes a full second of recovery',()=>{
  const c=fixture(),e=c.spawn('normal',.9,0,0)!;e.swarm=true;
  advance(c,1/60);expect(e.intent).toBe('windup');expect(c.hp).toBe(100);
  const center=[e.grassAttackX,e.grassAttackZ];
  advance(c,.7);expect(e.intent).toBe('windup');expect(c.hp).toBe(100);expect([e.x,e.z]).toEqual(center);
  advance(c,.06);expect(e.intent).toBe('pounce');expect(c.hp).toBe(97);
  c.invulnerability=0;advance(c,.05);expect(c.hp).toBe(97);
  advance(c,.16);expect(e.intent).toBe('recover');
  const x=e.x;advance(c,.8);expect(e.intent).toBe('recover');expect(e.x).toBeCloseTo(x);
});

test('moving out of the displayed radius and obstacle cover prevent the thorn hit',()=>{
  const c=fixture();c.spawn('normal',.9,0,0);
  advance(c,.3);advance(c,.6,{x:0,z:3});expect(c.hp).toBe(100);
  const blocked=fixture();
  const e=blocked.spawn('normal',.9,0,0)!;
  advance(blocked,1/60);
  // Cover introduced during the windup must also be checked at damage time.
  (blocked as any).obstacles=[{x:.45,z:0,radius:.2}];
  advance(blocked,.8);expect(e.intent).toBe('pounce');expect(blocked.hp).toBe(100);
});

test('real weapon knockback interrupts rooting, while a burn tick does not',()=>{
  const c=fixture(),e=c.spawn('tank',6,0,0)!;e.active=false;
  const grass=c.spawn('normal',.9,0,0)!;grass.hp=100;
  advance(c,1/60);expect(grass.intent).toBe('windup');
  (c as any).damageEnemy(grass,1,0,0);
  expect(grass.intent).toBe('windup');
  (c as any).damageEnemy(grass,1,1,0);
  expect(grass.intent).toBe('recover');expect(grass.grassAttackX).toBeUndefined();
  expect(c.interrupts).toBe(1);advance(c,.5);expect(c.hp).toBe(100);
});

test('local clusters never exceed two simultaneous grass warnings and death cancels the attack',()=>{
  const c=fixture();
  const enemies=Array.from({length:24},(_,i)=>c.spawn('normal',.8+(i%4)*.1,(Math.floor(i/4)-3)*.1,0)!);
  advance(c,1/60);
  expect(enemies.filter(e=>e.intent==='windup')).toHaveLength(2);
  for(const e of enemies.filter(e=>e.intent==='windup'))(c as any).damageEnemy(e,100,0,0);
  // Live bodies now hurt independently of attacks; remove them to isolate death cancellation.
  for(const e of enemies.filter(e=>e.active))e.active=false;
  const hp=c.hp;advance(c,1);expect(c.hp).toBe(hp);
});

test('pause freezes motion and windup; reused enemy slots reset all grass state; legacy behavior stays continuous',()=>{
  const c=fixture(),e=c.spawn('normal',6,0,0)!;
  advance(c,.3);const before=[e.x,e.z,e.grassCycle];
  c.progression.gainExperience(c.progression.threshold);advance(c,1);
  expect([e.x,e.z,e.grassCycle]).toEqual(before);
  e.active=false;const reused=c.spawn('normal',7,0,0)!;
  expect(reused.grassCycle).toBe(0);expect(reused.grassRollX).toBeUndefined();expect(reused.grassHit).toBe(false);
  const legacy=new Combat([],32,()=>.25);legacy.automaticSpawning=false;legacy.reset();
  const normal=legacy.spawn('normal',7,0,0)!;
  for(let i=0;i<36;i++)legacy.update(1/60,origin);
  const x=normal.x;for(let i=0;i<12;i++)legacy.update(1/60,origin);
  expect(normal.x).toBeLessThan(x);expect(normal.grassCycle).toBe(0);
});
