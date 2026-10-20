# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flame-sweep-growth.spec.ts >> ring protects walls and spawn warnings; its unlocked area follows the current player position
- Location: tests\flame-sweep-growth.spec.ts:48:1

# Error details

```
TypeError: c.setObstacles is not a function
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { Combat } from '../src/combat';
  3  | import { PartySystem } from '../src/party';
  4  | import { FLAME_SWEEP, flameSweepStats, insideSweep } from '../src/flame-sweep';
  5  | import { RunFlow } from '../src/run-flow';
  6  | 
  7  | const origin = { x: 0, z: 0 };
  8  | function fixture(level = 5) {
  9  |   const c = new Combat([], 32, () => .25); c.party = new PartySystem(); c.fusionEnabled = true;
  10 |   c.automaticSpawning = false; c.reset();
  11 |   for (let i=0; i<level; i++) expect(c.grantUpgrade('flame-sweep-weapon')).toBe(true);
  12 |   c.runBuild.attacks[0].cooldown = 1000; c.runBuild.attacks[1].cooldown = 1000;
  13 |   c.invulnerability = 1000;
  14 |   return c;
  15 | }
  16 | function tick(c: Combat, dt = 1/60) { c.party!.syncLeader(origin, 0); c.update(dt, origin); }
  17 | 
  18 | test('upgrades grow actual range and angle, and cap relic/range stacking at close range', () => {
  19 |   const first = flameSweepStats(1), last = flameSweepStats(5);
  20 |   const angle = 135*Math.PI/180, x = Math.cos(angle)*3.8, z = Math.sin(angle)*3.8;
  21 |   expect(insideSweep(x,z,1,0,first.radius,.1,first.angle)).toBe(false);
  22 |   expect(insideSweep(x,z,1,0,last.radius,.1,last.angle)).toBe(true);
  23 |   expect(insideSweep(-3.8,0,1,0,last.radius,.1,last.angle)).toBe(false);
  24 |   expect(flameSweepStats(3).ringInterval).toBe(0);
  25 |   expect(flameSweepStats(4).ringInterval).toBe(5);
  26 |   expect(last.ringInterval).toBe(4);
  27 |   const c=fixture(); for(let i=0;i<5;i++)c.grantUpgrade('range');
  28 |   expect(c.grantUpgrade('overload-core')).toBe(true);
  29 |   const profile=flameSweepStats(5,c.stats.rangeMultiplier,c.runBuild.rules('flame-sweep').areaMultiplier);
  30 |   expect(profile.radius).toBe(6); expect(profile.ringRadius).toBe(6.5);
  31 | });
  32 | 
  33 | test('periodic fire ring hits all directions once even with a saturated bolt pool and no sweep', () => {
  34 |   const c=fixture();
  35 |   for (const p of c.projectiles) Object.assign(p,{active:true,x:20,z:20,previousX:20,previousZ:20,vx:0,vz:0,life:100,damage:0});
  36 |   const victims = [[-4,0],[4,0],[0,4],[0,-4]].map(([x,z])=>c.spawn('tank',x,z,0)!);
  37 |   tick(c); expect(c.flameRing.pulseId).toBe(0);
  38 |   for(let i=0;i<237;i++)tick(c);
  39 |   for(const e of victims)expect(e.hp).toBe(100);
  40 |   tick(c);tick(c); // Four full seconds; the ring runs without a sweep target gate.
  41 |   expect(c.flameRing.pulseId).toBe(1);
  42 |   for(const e of victims)expect(e.hp).toBeCloseTo(100-36*1.8*.45);
  43 |   expect(c.flameRing.hitIds.filter(Boolean)).toHaveLength(4);
  44 |   const health = victims.map(e=>e.hp);tick(c,.1);expect(victims.map(e=>e.hp)).toEqual(health);
  45 |   expect(c.melee.attackInstanceId).toBe(0); expect(c.shotsFired).toBe(0);
  46 | });
  47 | 
  48 | test('ring protects walls and spawn warnings; its unlocked area follows the current player position', () => {
  49 |   const c=fixture(); tick(c);
  50 |   c.flameRing.cooldown = 0;
  51 |   const covered=c.spawn('tank',12,0,0)!, warned=c.spawn('tank',10,1,1)!;
  52 |   const hit=c.spawn('tank',8,0,0)!;
> 53 |   c.setObstacles([{x:11,z:0,radius:.4}]);
     |     ^ TypeError: c.setObstacles is not a function
  54 |   const player={x:10,z:0}; c.party!.syncLeader(player,0);c.update(1/60,player);
  55 |   expect(c.flameRing.x).toBe(10);expect(hit.hp).toBeLessThan(100);
  56 |   expect(covered.hp).toBe(100);expect(warned.hp).toBe(100);
  57 | });
  58 | 
  59 | test('ring timing pauses for upgrades and death, clears on wave boundaries and resets on restart', () => {
  60 |   const c=fixture();tick(c); const before=JSON.stringify(c.flameRing);
  61 |   c.progression.gainExperience(8);tick(c,.5);expect(JSON.stringify(c.flameRing)).toBe(before);
  62 |   c.chooseUpgrade(c.progression.offers[0]);c.hp=0;
  63 |   const dead=JSON.stringify(c.flameRing);tick(c,.5);expect(JSON.stringify(c.flameRing)).toBe(dead);
  64 |   c.hp=100;c.clearWave();expect(c.flameRing.active).toBe(false);expect(c.flameRing.armed).toBe(false);
  65 |   tick(c);expect(c.flameRing.cooldown).toBeGreaterThan(3);expect(c.flameRing.active).toBe(false);
  66 |   c.reset();expect(c.flameRing.pulseId).toBe(0);expect(c.flameRing.armed).toBe(false);
  67 | });
  68 | 
  69 | test('upgrading level four to five preserves ring cooldown progress and exposes the next reward', () => {
  70 |   const c=fixture(3);
  71 |   expect(c.progression.skills.find(s=>s.id==='flame-sweep-weapon')!.description).toContain('解锁环形火焰');
  72 |   c.grantUpgrade('flame-sweep-weapon');tick(c);
  73 |   c.flameRing.cooldown=2.5;
  74 |   expect(c.progression.skills.find(s=>s.id==='flame-sweep-weapon')!.description).toContain('强化环形火焰');
  75 |   c.grantUpgrade('flame-sweep-weapon');expect(c.flameRing.cooldown).toBeCloseTo(2);
  76 |   c.grantUpgrade('haste');expect(c.flameRing.cooldown).toBeLessThan(2);
  77 | });
  78 | 
  79 | test('elite and boss resistance preserves remote single-target roles; ring respects Boss death gating', () => {
  80 |   const c=fixture();tick(c);c.flameRing.cooldown=0;
  81 |   const normal=c.spawn('tank',-2,0,0)!, elite=c.spawn('tank',2,0,0)!;elite.rank='elite';
  82 |   tick(c);expect(100-elite.hp).toBeCloseTo((100-normal.hp)*FLAME_SWEEP.eliteMultiplier);
  83 |   const bossCombat=fixture(),run=new RunFlow();run.waveIndex=5;run.prepare(bossCombat,origin);
  84 |   const boss=bossCombat.encounters.boss!;Object.assign(boss,{x:-2,z:0,previousX:-2,previousZ:0,hp:1,spawnTime:0});
  85 |   tick(bossCombat);bossCombat.flameRing.cooldown=0;tick(bossCombat);
  86 |   expect(bossCombat.encounters.dying).toBe(true);expect(bossCombat.flameRing.active).toBe(false);
  87 |   run.update(1/60,bossCombat,origin);expect(run.phase).toBe('fighting');
  88 |   bossCombat.encounters.beforeTick(1);run.update(1/60,bossCombat,origin);expect(run.phase).toBe('won');
  89 | });
  90 | 
```