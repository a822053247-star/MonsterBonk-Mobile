import { test, expect } from '@playwright/test';
import { Combat, ENEMY_TYPES, FORMAL_ROCK_HP, RED_BLOB_BASH, ROCK_MARCH } from '../src/combat';
import { PartySystem } from '../src/party';
import { ENEMY_MOTION } from '../src/enemy-motion';

const player={x:0,z:0};
function fixture(formal=true) {
  const combat=new Combat([],32,()=>.277);
  combat.party=new PartySystem();
  combat.fusionEnabled=formal;
  combat.automaticSpawning=false;
  combat.reset();
  if(formal)combat.encounters.beginWave(3);
  for(const attack of combat.runBuild.attacks) attack.cooldown=100000;
  return combat;
}
function tick(combat:Combat,p=player,count=1) {
  for(let i=0;i<count;i++) {
    combat.party!.syncLeader(p,0);
    combat.update(1/60,p);
  }
}

test('red must stop to slam, whereas heavy rock never stops to wind up',()=>{
  const redCombat=fixture();
  const red=redCombat.spawn('normal',1.5,0,0)!;red.spawnTime=0;
  tick(redCombat);
  expect(red.intent).toBe('windup');
  const redX=red.x;
  tick(redCombat,player,15);
  expect(red.x).toBeCloseTo(redX,5);
  expect(RED_BLOB_BASH.radius).toBeGreaterThan(1);

  const rockCombat=fixture();
  const rock=rockCombat.spawn('tank',1.5,0,0)!;rock.spawnTime=0;
  tick(rockCombat);
  expect(rock.intent).toBe('chase');
  expect(rock.x).toBeLessThan(1.5);
  tick(rockCombat,player,15);
  expect(rock.x).toBeLessThan(1.5 - ENEMY_TYPES.tank.speed/60);
  expect(rock.intent).toBe('chase');
  expect(rock.intentTime).toBe(0);
  expect(rock.hp).toBe(FORMAL_ROCK_HP*1.5);
});

test('slow heavy steering gives rocks a distinct forward commitment',()=>{
  const c=fixture();
  const rock=c.spawn('tank',6,0,0)!;rock.spawnTime=0;
  tick(c,player,20);
  const original=rock.steerX!;
  expect(original).toBeLessThan(-.7);
  tick(c,{x:8,z:6});
  expect(rock.steerX!).toBeLessThan(0);
  expect(ROCK_MARCH.turnResponse).toBeLessThan(14);
  expect(ENEMY_MOTION.tank.bob).toBeLessThan(ENEMY_MOTION.normal.bob);
  expect(ENEMY_MOTION.tank.cadence).toBeLessThan(ENEMY_MOTION.normal.cadence);
});

test('rock close contact hurts; warning-range stand-off and moving away are safe',()=>{
  const safe=fixture();
  const distant=safe.spawn('tank',1.5,0,0)!;distant.spawnTime=0;
  tick(safe);
  expect(safe.hp).toBe(100);
  expect(distant.intent).toBe('chase');
  tick(safe,{x:0,z:4},20);
  expect(safe.hp).toBe(100);

  const close=fixture();
  const touching=close.spawn('tank',.97,0,0)!;touching.spawnTime=0;
  tick(close);
  expect(touching.intent).toBe('chase');
  expect(close.hp).toBe(100-ENEMY_TYPES.tank.damage);
  tick(close,player,5);
  expect(close.hp).toBe(100-ENEMY_TYPES.tank.damage);
  expect(ROCK_MARCH.contactPadding).toBeLessThan(.3);
});

test('classic rock and ranked elite retain their existing HP and attack systems',()=>{
  const classic=fixture(false);
  const old=classic.spawn('tank',.97,0,0)!;old.spawnTime=0;
  expect(old.hp).toBe(ENEMY_TYPES.tank.hp);
  tick(classic);
  expect(classic.hp).toBe(100-ENEMY_TYPES.tank.damage);

  const c=fixture();
  c.encounters.beginWave(4);
  const elite=c.encounters.spawnElite(c,player)!;elite.spawnTime=0;
  expect(elite.rank).toBe('elite');
  expect(elite.hp).toBeGreaterThan(FORMAL_ROCK_HP);
  c.encounters.eliteCooldown=0;
  elite.x=2;elite.z=0;
  tick(c);
  expect(c.encounters.elitePulsing).toBe(true);
});
