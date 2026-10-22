import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS, ENEMY_TYPES, segmentHit } from '../src/combat';

const STEP = 1 / 60;
const advance = (combat: Combat, seconds: number, player = { x: 0, z: 0 }) => {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) combat.update(STEP, player);
};
function seededRandom() {
  let seed = 45678;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('three enemies have distinct pursuit speeds and durability', () => {
  const combat = new Combat();
  const normal = combat.spawn('normal', 5, 0, 0)!;
  const fast = combat.spawn('fast', 0, 6, 0)!;
  const tank = combat.spawn('tank', -7, 0, 0)!;
  advance(combat, 0.1);
  const normalTravel = 5 - Math.hypot(normal.x, normal.z);
  const fastTravel = 6 - Math.hypot(fast.x, fast.z);
  const tankTravel = 7 - Math.hypot(tank.x, tank.z);
  expect(fastTravel).toBeGreaterThan(normalTravel);
  expect(normalTravel).toBeGreaterThan(tankTravel);
  expect(tank.hp).toBeGreaterThan(normal.hp);
  expect(normal.hp).toBeGreaterThan(fast.hp);
});

test('targeting excludes blocked, distant, spawning and dead enemies', () => {
  const combat = new Combat([{ x: 2, z: 0, radius: 0.7 }]);
  combat.spawn('normal', 5, 0, 0);
  const clear = combat.spawn('fast', 0, 7, 0)!;
  combat.spawn('tank', 0, 15, 0);
  combat.spawn('normal', 0, 1, 0.75);
  combat.spawn('normal', 0, 0.5, 0)!.hp = 0;
  expect(combat.findTarget({ x: 0, z: 0 })?.id).toBe(clear.id);
  const nearer = combat.spawn('normal', -2, 0, 0)!;
  expect(combat.findTarget({ x: 0, z: 0 })?.id).toBe(nearer.id);
});

test('magic bolts damage, flash, kill and drop XP which nearby players collect once', () => {
  const combat = new Combat();
  const enemy = combat.spawn('normal', 5, 0, 0)!;
  for (let i = 0; i < 50 && combat.hits === 0; i++) combat.update(STEP, { x: 0, z: 0 });
  expect(enemy.hp).toBe(12);
  expect(enemy.flash).toBeGreaterThan(0);
  expect(enemy.knockX).toBeGreaterThan(0);
  for (let i = 0; i < 100 && combat.kills === 0; i++) combat.update(STEP, { x: 0, z: 0 });
  expect(enemy.active).toBe(false);
  expect(combat.kills).toBe(1);
  const orb = combat.orbs.find((candidate) => candidate.active)!;
  expect(orb.value).toBe(ENEMY_TYPES.normal.xp);
  expect(combat.xp).toBe(0);
  advance(combat, 0.6, { x: orb.x - 2, z: orb.z });
  expect(combat.xp).toBe(ENEMY_TYPES.normal.xp);
  expect(combat.collected).toBe(1);
  expect(orb.active).toBe(false);
  advance(combat, 0.2);
  expect(combat.xp).toBe(ENEMY_TYPES.normal.xp);
});

test('contact damage has a shared invulnerability window and death freezes combat', () => {
  const combat = new Combat();
  combat.spawn('tank', 0.5, 0, 0);
  combat.spawn('tank', -0.5, 0, 0);
  combat.update(STEP, { x: 0, z: 0 });
  expect(combat.hp).toBe(84); // Overlapping enemies do not apply damage twice in one tick.
  expect(combat.hurtFlash).toBeGreaterThan(0);
  advance(combat, 0.35);
  expect(combat.hp).toBe(84);
  advance(combat, 0.55);
  expect(combat.hp).toBe(68);
  combat.hp = 1;
  combat.invulnerability = 0;
  combat.update(STEP, { x: 0, z: 0 });
  expect(combat.hp).toBe(0);
  const ended = combat.inspect();
  advance(combat, 2);
  expect(combat.inspect()).toEqual(ended);
});

test('swept collision catches tunneling and only the first enemy is hit', () => {
  expect(segmentHit(0, 0, 20, 0, 5, 0, 0.5)).toBeCloseTo(0.225);
  const combat = new Combat();
  const near = combat.spawn('tank', 3, 0, 0)!;
  const far = combat.spawn('tank', 7, 0, 0)!;
  combat.update(0.4, { x: 0, z: 0 }); // A deliberately large step crosses an entire target.
  expect(near.hp).toBe(82);
  expect(far.hp).toBe(100);
});

test('spawn positions stay near the player, inside the map and outside obstacles', () => {
  const obstacles = [{ x: 25, z: 5, radius: 3 }];
  const combat = new Combat(obstacles, 32.3, seededRandom());
  const player = { x: 31, z: 0 };
  for (let tick = 0; tick < 60 * 15; tick++) {
    combat.update(STEP, player);
    for (const enemy of combat.enemies) {
      if (!enemy.active || enemy.age > STEP * 1.1) continue;
      expect(Math.hypot(enemy.x - player.x, enemy.z - player.z)).toBeGreaterThanOrEqual(8);
      expect(Math.hypot(enemy.x - player.x, enemy.z - player.z)).toBeLessThanOrEqual(12);
      expect(Math.abs(enemy.x)).toBeLessThanOrEqual(31.3);
      expect(Math.abs(enemy.z)).toBeLessThanOrEqual(31.3);
      expect(Math.hypot(enemy.x - 25, enemy.z - 5)).toBeGreaterThanOrEqual(4.1);
    }
  }
  expect(combat.spawned).toBeGreaterThan(3);
});

test('30, 60 and 120 Hz frame schedules give identical fixed-step combat results', () => {
  const simulate = (fps: number) => {
    const combat = new Combat([], 32.3, seededRandom());
    let accumulator = 0, ticks = 0;
    for (let frame = 0; frame < fps * 20; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-9 >= STEP) {
        accumulator -= STEP;
        const angle = ticks++ * STEP * 0.25;
        combat.update(STEP, { x: Math.sin(angle) * 4, z: Math.cos(angle) * 4 });
      }
    }
    return combat.inspect();
  };
  const baseline = simulate(60);
  expect(baseline.shotsFired).toBeGreaterThan(10);
  expect(baseline.kills).toBeGreaterThan(0);
  expect(simulate(30)).toEqual(baseline);
  expect(simulate(120)).toEqual(baseline);
});

test('all pools are bounded, full XP pool merges drops, and reset removes old entities', () => {
  const combat = new Combat([], 32.3, seededRandom());
  for (let i = 0; i < COMBAT_LIMITS.enemies + 32; i++) combat.spawn('tank', 20, 20, 0);
  expect(combat.enemies.filter((enemy) => enemy.active)).toHaveLength(COMBAT_LIMITS.enemies);
  // Fill drops before a real kill: the new XP must merge, not be lost.
  for (const enemy of combat.enemies) enemy.active = false;
  for (const orb of combat.orbs) Object.assign(orb, { active: true, x: 20, z: 20, value: 1, magnetized: false });
  combat.spawn('fast', 5, 0, 0);
  advance(combat, 0.6);
  expect(combat.kills).toBe(1);
  expect(combat.orbs.filter((orb) => orb.active)).toHaveLength(COMBAT_LIMITS.orbs);
  expect(combat.orbs.reduce((sum, orb) => sum + orb.value, 0)).toBe(COMBAT_LIMITS.orbs + ENEMY_TYPES.fast.xp);
  for (let tick = 0; tick < 60 * 180; tick++) {
    combat.hp = 100;
    while (combat.progression.awaitingChoice) combat.chooseUpgrade(combat.progression.offers[0]);
    combat.update(STEP, { x: Math.sin(tick * STEP) * 10, z: Math.cos(tick * STEP) * 10 });
  }
  expect(combat.enemies.length).toBe(COMBAT_LIMITS.enemies);
  expect(combat.projectiles.length).toBe(COMBAT_LIMITS.projectiles);
  expect(combat.orbs.length).toBe(COMBAT_LIMITS.orbs);
  expect(combat.effects.length).toBe(COMBAT_LIMITS.effects);
  combat.reset();
  expect(combat.inspect()).toMatchObject({ hp: 100, kills: 0, xp: 0, spawned: 0, shotsFired: 0, hits: 0, enemies: [], projectiles: 0, orbs: [], effects: 0, targetId: 0 });
  advance(combat, 1);
  expect(combat.spawned).toBe(0);
});
