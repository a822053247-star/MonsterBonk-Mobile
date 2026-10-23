import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
function fixture() {
 const c = new Combat([],32,()=>.5); c.party = new PartySystem(); c.fusionEnabled=true; c.automaticSpawning=false; c.reset(); c.encounters.beginWave(3);
 for(const a of c.runBuild.attacks) a.cooldown=10000;
 return c;
}
test('floater locks aim, fires from bounded shared pool and resets reused state',()=>{
 const c=fixture(), e=c.spawn('spore-floater',0,6,0)!;
 c.update(.01,{x:0,z:0}); expect(e.intent).toBe('windup'); expect(c.encounters.shots.some(s=>s.active)).toBe(false);
 for(let i=0;i<43;i++) c.update(1/60,{x:1,z:0});
 const shot=c.encounters.shots.find(s=>s.active)!; expect(shot).toBeTruthy(); expect(shot.style).toBe('spore'); expect(shot.vx).toBe(0); expect(shot.vz).toBe(-5);
 e.active=false; const reused=c.spawn('spore-floater',0,6,0)!; expect(reused).toBe(e); expect(reused.intent).toBe('chase'); expect(reused.intentTime).toBe(0);
 c.reset(); expect(c.encounters.shots.some(s=>s.active)).toBe(false); expect(c.encounters.shots.every(s=>s.style===undefined)).toBe(true);
});
test('floater retreats at close range and approaches outside firing range',()=>{
 const c=fixture(), e=c.spawn('spore-floater',0,2,0)!; e.intentCooldown=10;
 c.update(.1,{x:0,z:0}); expect(e.z).toBeGreaterThan(2);
 e.z=e.previousZ=11; e.steerX=e.steerZ=undefined;
 c.update(.1,{x:0,z:0}); expect(e.z).toBeLessThan(11);
});

test('heavy crystal troop slides without bob, winds up slowly and reuses hostile shots',()=>{
 const c=fixture(),e=c.spawn('crystal-crawler',0,6,0)!;
 expect(e.hp).toBeCloseTo(243); c.update(.01,{x:0,z:0}); expect(e.intent).toBe('windup');
 for(let i=0;i<55;i++)c.update(1/60,{x:0,z:0});
 expect(c.encounters.shots.some(s=>s.active)).toBe(false);
 for(let i=0;i<14;i++)c.update(1/60,{x:0,z:0});
 const shot=c.encounters.shots.find(s=>s.active)!;expect(shot.style).toBe('crystal');expect(shot.vz).toBe(-4);
 expect(e.z).toBeCloseTo(6,1); expect(c.enemyRadius(e)).toBe(.8);
 c.reset();expect(c.encounters.shots.some(s=>s.active)).toBe(false);
});

test('scarlet flower warns then fires petal magic and resets its pooled slot',()=>{
 const c=fixture(),e=c.spawn('scarlet-flower',0,6,0)!;
 expect(e.hp).toBeCloseTo(94.5);c.update(.01,{x:0,z:0});expect(e.intent).toBe('windup');
 for(let i=0;i<45;i++)c.update(1/60,{x:0,z:0});
 expect(c.encounters.shots.some(s=>s.active)).toBe(false);
 for(let i=0;i<12;i++)c.update(1/60,{x:0,z:0});
 expect(c.encounters.shots.find(s=>s.active)).toMatchObject({style:'petal',vx:0,vz:-4.6});
 e.active=false;const reused=c.spawn('scarlet-flower',0,6,0)!;expect(reused.intent).toBe('chase');expect(reused.intentCooldown).toBe(0);
 c.reset();expect(c.encounters.shots.some(s=>s.active)).toBe(false);
});

test('moondew support heals at most three ordinary allies, freezes and resets',()=>{
 const c=fixture(), source=c.spawn('moondew-shell',0,10,0)!;
 const allies=Array.from({length:4},(_,i)=>{const e=c.spawn('tank',1+i*.1,10,0)!;e.hp=10;return e});
 const other=c.spawn('moondew-shell',1,11,0)!;other.hp=10;
 const elite=c.spawn('tank',1,9,0)!;elite.rank='elite';elite.hp=10;
 source.hp=10;source.specialTime=3.99;
 c.update(0,{x:0,z:0});expect(allies.every(e=>e.hp===10)).toBe(true);
 c.update(.02,{x:0,z:0});expect(allies.filter(e=>e.hp>10)).toHaveLength(3);
 expect(other.hp).toBe(10);expect(source.hp).toBe(10);expect(elite.hp).toBe(10);
 source.active=false;const reused=c.spawn('moondew-shell',0,10,0)!;expect(reused.specialTime).toBe(0);
 c.reset();expect(c.enemies.some(e=>e.active)).toBe(false);
});

test('molten fruit locks direction, charges, recovers and resets its roll',()=>{
 const c=fixture(),e=c.spawn('molten-fruit',0,5,0)!;
 c.update(.01,{x:0,z:0});expect(e.intent).toBe('windup');const z=e.z;
 for(let i=0;i<40;i++)c.update(1/60,{x:0,z:0});expect(e.intent).toBe('windup');expect(e.z).toBe(z);
 for(let i=0;i<9;i++)c.update(1/60,{x:0,z:0});expect(e.intent).toBe('pounce');expect(e.z).toBeLessThan(z);expect(e.grassRollDistance).toBeGreaterThan(0);
 for(let i=0;i<38;i++)c.update(1/60,{x:0,z:0});expect(e.intent).toBe('recover');expect(c.hp).toBeLessThan(100);
 e.active=false;const reused=c.spawn('molten-fruit',0,5,0)!;expect(reused.intent).toBe('chase');expect(reused.grassRollDistance).toBe(0);
});
