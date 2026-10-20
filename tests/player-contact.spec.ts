import {test,expect} from '@playwright/test';
import {Combat} from '../src/combat';
import {PartySystem} from '../src/party';

function fixture() {
  const c=new Combat([],32,()=>.3);c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();c.encounters.beginWave(2);
  c.runBuild.attacks[0].cooldown=10000;return c;
}
function tick(c:Combat,p={x:0,z:0}){c.party!.syncLeader(p,0);c.update(1/60,p);}

test('touching an enemy body hurts even while its special attack is winding up',()=>{
  const c=fixture(),e=c.spawn('normal',.4,0,0)!;e.swarm=true;
  tick(c);expect(e.intent).toBe('windup');expect(c.hp).toBe(97);expect(c.hurtFlash).toBeGreaterThan(0);
});

test('crossing the bodies of a dense crowd keeps dealing damage rather than granting a free passage',()=>{
  const c=fixture();
  for(let i=0;i<30;i++) {
    const e=c.spawn('normal',-3+(i%10)*.65,(Math.floor(i/10)-1)*.3,0)!;e.swarm=true;e.hp=1000;
  }
  for(let frame=0;frame<120;frame++)tick(c,{x:-3+frame*.05,z:0});
  expect(c.hp).toBeLessThanOrEqual(88);expect(c.balanceTelemetry.damageEvents).toBeGreaterThanOrEqual(4);
});

test('swept body contact catches passing through an enemy between two sampled positions',()=>{
  const c=fixture();tick(c,{x:-3,z:0});
  c.spawn('tank',0,0,0);
  tick(c,{x:3,z:0});expect(c.hp).toBeLessThan(100);
});

test('one crowded frame deals one hit, protection expires, and leaving the crowd stops damage',()=>{
  const c=fixture();
  for(let i=0;i<40;i++){const e=c.spawn('normal',.1+(i%5)*.03,(Math.floor(i/5)-4)*.03,0)!;e.swarm=true;}
  tick(c);expect(c.hp).toBe(97);expect(c.balanceTelemetry.damageEvents).toBe(1);
  for(let i=0;i<10;i++)tick(c);expect(c.hp).toBe(97);
  for(let i=0;i<20;i++)tick(c);expect(c.hp).toBeLessThan(97);
  tick(c,{x:12,z:12});const hp=c.hp;
  for(let i=0;i<60;i++)tick(c,{x:12,z:12});expect(c.hp).toBe(hp);
});

test('spawn warning, cover, harmless treasure, pause and death retain their protections',()=>{
  const c=fixture();c.spawn('normal',.1,0,2);tick(c);expect(c.hp).toBe(100);
  c.clearWave();c.encounters.beginWave(2);c.spawn('draft-treasure-runner',0,0,0);tick(c);expect(c.hp).toBe(100);
  c.clearWave();c.encounters.beginWave(2);c.spawn('normal',.7,0,0);
  (c as any).obstacles=[{x:.35,z:0,radius:.15}];tick(c);expect(c.hp).toBe(100);
  c.progression.gainExperience(c.progression.threshold);for(let i=0;i<60;i++)tick(c);expect(c.hp).toBe(100);
  c.hp=0;tick(c);expect(c.hp).toBe(0);
});
