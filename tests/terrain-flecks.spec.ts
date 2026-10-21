import { test, expect } from '@playwright/test';
import { sampleInfiniteTerrain } from '../src/infinite-world';

test('terrain has no isolated sand flecks inside a grass region', () => {
  const found: { seed: string; x: number; z: number; area: number }[] = [];
  const size = 768, step = .125, origin = -48;
  for (const seed of ['forest-42', 'shore-19', 'meadow', 'audit-42', 'terrain-0', 'terrain-1', 'terrain-2', 'terrain-3']) {
    const mask = new Uint8Array(size * size);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++)
      mask[z * size + x] = sampleInfiniteTerrain(seed, origin + x * step, origin + z * step) === 'sand' ? 1 : 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 1) continue;
      const queue = [i]; mask[i] = 2; let border = false;
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head], x = at % size, z = Math.floor(at / size);
        if (x === 0 || z === 0 || x === size - 1 || z === size - 1) border = true;
        const neighbors: number[] = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && x + dx >= 0 && x + dx < size && z + dz >= 0 && z + dz < size)
            neighbors.push(at + dz * size + dx);
        }
        for (const next of neighbors) {
          if (next >= 0 && mask[next] === 1) { mask[next] = 2; queue.push(next); }
        }
      }
      const area = queue.length * step * step;
      if (!border && area < 12) found.push({ seed, x: origin + i % size * step,
        z: origin + Math.floor(i / size) * step, area });
    }
  }
  expect(found).toEqual([]);
});

