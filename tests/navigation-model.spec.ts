import { test, expect } from '@playwright/test';
import { Combat, ENEMY_TYPES } from '../src/combat';
import { GroundNavigation } from '../src/navigation';
import { sampleObstacles, SAMPLE_PATHS } from '../src/world-layout';


test('finite arena navigation and enemy movement preserve the square corners', () => {
  const navigation = new GroundNavigation([], 32.3);
  expect(navigation.reachable({ x: 31, z: 31 }, { x: 0, z: 0 })).toBe(true);

  const combat = new Combat([], 32.3, () => .25);
  const enemy = combat.spawn('normal', 31, 31, 0)!;
  enemy.hp = 100000;
  combat.update(1 / 60, { x: 30, z: 30 });
  expect(enemy.x).toBeGreaterThan(30);
  expect(enemy.z).toBeGreaterThan(30);
  expect(Math.abs(enemy.x) + ENEMY_TYPES.normal.radius).toBeLessThanOrEqual(32.3 + .001);
  expect(Math.abs(enemy.z) + ENEMY_TYPES.normal.radius).toBeLessThanOrEqual(32.3 + .001);
});

test('an enemy behind the pond can reach the player without entering water', () => {
  const pond = { x: 14, z: -7, radius: 5.3 };
  // Keep reinforcements in their spawn warning, isolating one pursuit route.
  const combat = new Combat([pond], 32.3, () => .25);
  combat.useNavigation = true;
  const enemy = combat.spawn('normal', 22, -7, 0)!;
  enemy.hp = combat.hp = 100000;
  const player = { x: 6, z: -7 };
  for (let i = 0; i < 47; i++) combat.spawn('normal', player.x, player.z, 9999);
  for (let i = 0; i < 30 * 60; i++) {
    combat.update(1 / 60, player);
    expect(Math.hypot(enemy.x - pond.x, enemy.z - pond.z)).toBeGreaterThanOrEqual(5.85 - .001);
  }
  expect(Math.hypot(enemy.x - player.x, enemy.z - player.z)).toBeLessThan(2);
});

test('reinforcements still find dry connected ground when random attempts hit water', () => {
  const obstacles = sampleObstacles();
  const combat = new Combat(obstacles, 32.3, () => .25);
  combat.useNavigation = true;
  const player = { x: 6, z: -7 };
  const enemy = combat.spawnEncounter('tank', player);
  expect(enemy).toBeDefined();
  expect(Math.hypot(enemy!.x - player.x, enemy!.z - player.z)).toBeGreaterThanOrEqual(6);
  expect(obstacles.every(o => Math.hypot(enemy!.x - o.x, enemy!.z - o.z) >= o.radius + 1.1)).toBe(true);
});

test('main roads retain a 4.8-unit clear corridor and all open regions connect to spawn', () => {
  const obstacles = sampleObstacles();
  for (const path of SAMPLE_PATHS) {
    let start: readonly number[] = path.start;
    for (const c of path.curves) {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, u = 1 - t;
        const x = u ** 3 * start[0] + 3 * u ** 2 * t * c[0] + 3 * u * t ** 2 * c[2] + t ** 3 * c[4];
        const z = u ** 3 * start[1] + 3 * u ** 2 * t * c[1] + 3 * u * t ** 2 * c[3] + t ** 3 * c[5];
        expect(Math.abs(x) + 2.4).toBeLessThanOrEqual(32.3);
        expect(Math.abs(z) + 2.4).toBeLessThanOrEqual(32.3);
        expect(obstacles.every(o => Math.hypot(x - o.x, z - o.z) >= o.radius + 2.4)).toBe(true);
      }
      start = [c[4], c[5]];
    }
  }
  const navigation = new GroundNavigation(obstacles, 32.3);
  for (let x = -30; x <= 30; x += 2) for (let z = -30; z <= 30; z += 2) {
    if (obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + 1.5)) continue;
    expect(navigation.reachable({ x, z }, { x: 0, z: 0 }), 'unreachable ground at ' + x + ',' + z).toBe(true);
  }
});

test('pond approaches remain reachable from both steering sides', () => {
  const failures: string[] = [];
  for (const kind of ['normal', 'fast', 'tank'] as const) for (let approach = 0; approach < 16; approach++) for (const parity of [0, 1]) {
    const angle = approach * Math.PI / 8;
    const player = { x: 14 + Math.sin(angle) * 8, z: -7 + Math.cos(angle) * 8 };
    let roll = Math.atan2(14 - player.x, -7 - player.z) / (Math.PI * 2);
    if (roll < 0) roll += 1;
    const combat = new Combat(sampleObstacles(), 32.3, () => roll);
    combat.useNavigation = true;
    if (parity) combat.spawn('normal', 0, 0, 0)!.active = false;
    const enemy = combat.spawn(kind, 14 - Math.sin(angle) * 8, -7 - Math.cos(angle) * 8, 0)!;
    enemy.hp = combat.hp = 100000;
    for (let i = 0; i < 47; i++) combat.spawn('normal', player.x, player.z, 9999);
    let closest = Infinity;
    for (let i = 0; i < 45 * 60; i++) {
      combat.update(1 / 60, player);
      closest = Math.min(closest, Math.hypot(enemy.x - player.x, enemy.z - player.z));
    }
    if (closest > 7) failures.push(kind + ', approach ' + approach + ', parity ' + parity + ': ' + closest.toFixed(2));
  }
  expect(failures).toEqual([]);
});

test('crowded tank pursuits keep progressing after upgrade choices', () => {
  for (const approach of [6, 7, 8]) {
    const angle = approach * Math.PI / 8;
    const player = { x: 14 + Math.sin(angle) * 8, z: -7 + Math.cos(angle) * 8 };
    const combat = new Combat(sampleObstacles(), 32.3, () => .25);
    combat.useNavigation = true;
    const enemy = combat.spawn('tank', 14 - Math.sin(angle) * 8, -7 - Math.cos(angle) * 8, 0)!;
    enemy.hp = combat.hp = 100000;
    let closest = Infinity;
    for (let i = 0; i < 90 * 60 && closest > 7; i++) {
      if (combat.progression.awaitingChoice) combat.chooseUpgrade(combat.progression.offers[0]);
      combat.update(1 / 60, player);
      closest = Math.min(closest, Math.hypot(enemy.x - player.x, enemy.z - player.z));
    }
    expect(closest, 'tank approach ' + approach).toBeLessThanOrEqual(7);
  }
});

test('encounters and automatic waves spawn on dry ground with space and warning time', () => {
  const obstacles = sampleObstacles();
  let seed = 18019;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (const [x, z] of [[0, 0], [6, -7], [22, -7], [-29, 0], [0, 29], [0, -29], [-28, 8], [28, -10]]) {
    const player = { x, z }, combat = new Combat(obstacles, 32.3, random);
    combat.useNavigation = true;
    for (let i = 0; i < 30; i++) {
      const kind = (['normal', 'fast', 'tank'] as const)[i % 3];
      const enemy = combat.spawnEncounter(kind, player);
      expect(enemy, 'encounter near ' + x + ',' + z).toBeDefined();
      const radius = ENEMY_TYPES[kind].radius;
      expect(Math.abs(enemy!.x) + radius + .2).toBeLessThanOrEqual(32.3 + .001);
      expect(Math.abs(enemy!.z) + radius + .2).toBeLessThanOrEqual(32.3 + .001);
      expect(obstacles.every(o => Math.hypot(enemy!.x - o.x, enemy!.z - o.z) >= o.radius + radius + .3 - .001)).toBe(true);
      expect(Math.hypot(enemy!.x - x, enemy!.z - z)).toBeGreaterThanOrEqual(6 - .001);
      expect(enemy!.spawnTime).toBe(.75);
      enemy!.active = false;
    }
    combat.reset();
    for (let i = 0; i < 160; i++) combat.update(1 / 60, player);
    const active = combat.enemies.filter(e => e.active);
    expect(active).toHaveLength(1);
    expect(active[0].spawnTime).toBeGreaterThan(.6);
    expect(Math.hypot(active[0].x - x, active[0].z - z)).toBeGreaterThanOrEqual(8 - .001);
    expect(obstacles.every(o => Math.hypot(active[0].x - o.x, active[0].z - o.z) >= o.radius + 1.1)).toBe(true);
  }
});
