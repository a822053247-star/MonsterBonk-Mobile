import { test, expect } from '@playwright/test';
import { CHUNK_SIZE, chunkCoordinates, generateInfiniteChunk, sampleInfiniteTerrain, sampleInfiniteSurface } from '../src/infinite-world';

test('negative, positive and boundary coordinates select stable centered chunks', () => {
  expect(chunkCoordinates(0, 0)).toEqual({ cx: 0, cz: 0 });
  expect(chunkCoordinates(31.99, -31.99)).toEqual({ cx: 0, cz: 0 });
  expect(chunkCoordinates(32, -32.01)).toEqual({ cx: 1, cz: -1 });
  expect(chunkCoordinates(-96.01, 96)).toEqual({ cx: -2, cz: 2 });
  expect(CHUNK_SIZE).toBe(64);
});

test('terrain is deterministic over negative coordinates, remote chunks and revisits', () => {
  const positions = [[0, 0], [32, -32], [-96, 96], [2560, -1984]];
  const original = positions.map(([x, z]) => sampleInfiniteTerrain('forest-42', x, z));
  positions.toReversed().forEach(([x, z]) => sampleInfiniteTerrain('other', x, z));
  expect(positions.map(([x, z]) => sampleInfiniteTerrain('forest-42', x, z))).toEqual(original);
  const field = (seed: string) => Array.from({ length: 100 }, (_, i) => sampleInfiniteTerrain(seed, i * 3 - 150, i % 7 * 9 - 27));
  expect(new Set(field('forest-42'))).toEqual(new Set(['grass', 'sand']));
  expect(field('forest-42')).not.toEqual(field('shore-19'));
});

test('trees rocks and desert cacti collide, with safe spawn and chunk borders', () => {
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
    const layout = generateInfiniteChunk('meadow', cx, cz);
    expect(layout).toEqual(generateInfiniteChunk('meadow', cx, cz));
    expect(layout.obstacles.length).toBe(layout.trees.length + layout.rocks.length + layout.cacti.length);
    expect(layout.obstacles.length).toBeGreaterThan(0);
    for (const o of layout.obstacles) {
      expect(Math.hypot(o.x, o.z) - o.radius).toBeGreaterThan(7);
      expect(Math.abs(o.x - cx * CHUNK_SIZE) + o.radius).toBeLessThan(32);
      expect(Math.abs(o.z - cz * CHUNK_SIZE) + o.radius).toBeLessThan(32);
    }
    expect(layout.flowers.length + layout.grass.length).toBeGreaterThan(0);
    for (const p of layout.cacti)
      expect(sampleInfiniteSurface('meadow', cx * CHUNK_SIZE - 32 + p.x, cz * CHUNK_SIZE - 32 + p.z)).toBe('sand');
    const positions = [...layout.trees, ...layout.rocks, ...layout.cacti];
    for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++)
      expect(Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z)).toBeGreaterThan(4);
  }
});


test('treasure chests are deterministic, sparse, safe, and do not add collision obstacles', () => {
  for (const [cx, cz] of [[-5, -5], [0, 0], [4, -3]] as const)
    expect(generateInfiniteChunk('chest-fixture', cx, cz).chests)
      .toEqual(generateInfiniteChunk('chest-fixture', cx, cz).chests);

  let total = 0;
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) {
    const layout = generateInfiniteChunk('chest-fixture', cx, cz);
    expect(layout.chests.length).toBeLessThanOrEqual(1);
    expect(layout.obstacles.length).toBe(layout.trees.length + layout.rocks.length + layout.cacti.length);
    for (const chest of layout.chests) {
      total++;
      expect(chest.id).toBe(`chest-fixture:${cx}:${cz}:chest-0`);
      expect(chest.x).toBeGreaterThanOrEqual(9);
      expect(chest.x).toBeLessThanOrEqual(55);
      expect(chest.z).toBeGreaterThanOrEqual(9);
      expect(chest.z).toBeLessThanOrEqual(55);
      const x = cx * CHUNK_SIZE - CHUNK_SIZE / 2 + chest.x;
      const z = cz * CHUNK_SIZE - CHUNK_SIZE / 2 + chest.z;
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(12);
      expect(sampleInfiniteSurface('chest-fixture', x, z)).not.toBe('sand');
      for (const obstacle of layout.obstacles)
        expect(Math.hypot(x - obstacle.x, z - obstacle.z)).toBeGreaterThanOrEqual(obstacle.radius + 2.8);
    }
  }
  expect(total).toBeGreaterThan(10);
  expect(total).toBeLessThan(80);
});
