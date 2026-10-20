import { test, expect } from '@playwright/test';
import { CHUNK_SIZE, chunkCoordinates, generateInfiniteChunk } from '../src/infinite-world';

test('negative, positive and boundary coordinates select stable centered chunks', () => {
  expect(chunkCoordinates(0, 0)).toEqual({ cx: 0, cz: 0 });
  expect(chunkCoordinates(31.99, -31.99)).toEqual({ cx: 0, cz: 0 });
  expect(chunkCoordinates(32, -32.01)).toEqual({ cx: 1, cz: -1 });
  expect(chunkCoordinates(-96.01, 96)).toEqual({ cx: -2, cz: 2 });
  expect(CHUNK_SIZE).toBe(64);
});

test('independent chunk seeds are deterministic across traversal order and revisits', () => {
  const positions = [[0, 0], [1, 0], [-1, 0], [-2, 3], [40, -31]] as const;
  const original = positions.map(([x, z]) => generateInfiniteChunk('forest-42', x, z));
  positions.toReversed().forEach(([x, z]) => generateInfiniteChunk('other', x, z));
  positions.forEach(([x, z], i) => expect(generateInfiniteChunk('forest-42', x, z)).toEqual(original[i]));
  expect(generateInfiniteChunk('shore-19', -2, 3)).not.toEqual(original[3]);
});

test('streamed obstacles remain inside each chunk, apart from generous free border lanes', () => {
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) {
    const layout = generateInfiniteChunk('audit-42', cx, cz);
    const left = cx * CHUNK_SIZE - CHUNK_SIZE / 2;
    const top = cz * CHUNK_SIZE - CHUNK_SIZE / 2;
    for (const o of layout.obstacles) {
      expect(o.x - o.radius).toBeGreaterThan(left + .2);
      expect(o.x + o.radius).toBeLessThan(left + CHUNK_SIZE - .2);
      expect(o.z - o.radius).toBeGreaterThan(top + .2);
      expect(o.z + o.radius).toBeLessThan(top + CHUNK_SIZE - .2);
      expect(Math.hypot(o.x, o.z) - o.radius).toBeGreaterThanOrEqual(8);
    }
    expect(layout.trees.length + layout.rocks.length).toBeGreaterThan(5);
  }
});
