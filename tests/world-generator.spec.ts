import { test, expect } from '@playwright/test';
import { generateWorld, validateLayout } from '../src/world-generator';
import { sampleObstacles } from '../src/world-layout';

test('same seed reproduces the complete layout and validation, independently of global RNG', () => {
  const first = generateWorld('forest-42');
  for (let i = 0; i < 20; i++) Math.random();
  expect(generateWorld('forest-42')).toEqual(first);
  expect(generateWorld(42)).toEqual(generateWorld('42'));
  const unicode = generateWorld('a' + '🌲'.repeat(80));
  expect(Array.from(unicode.seed)).toHaveLength(64);
  expect(generateWorld(new URLSearchParams({ seed: unicode.seed }).get('seed')!)).toEqual(unicode);
});

test('256 seeds vary regions, trees, rocks and ponds while preserving spawn and every navigable cell', () => {
  const regions = new Set<string>(), water = new Set<string>(), trees = new Set<string>(), rocks = new Set<string>();
  let fallbacks = 0;
  for (let i = 0; i < 256; i++) {
    const map = generateWorld('audit-' + i);
    expect(map.validation.valid, map.seed).toBe(true);
    expect(map.validation.reachable).toBe(map.validation.walkable);
    expect(map.validation.openRatio).toBeGreaterThanOrEqual(.72);
    expect(map.attempt).toBeLessThanOrEqual(8);
    if (map.fallback) {
      fallbacks++;
      expect(map.attempt).toBe(8);
      expect(generateWorld(map.seed)).toEqual(map);
    }
    expect(sampleObstacles(map.layout).every(o => Math.hypot(o.x, o.z) - o.radius >= 8)).toBe(true);
    regions.add(map.layout.regions.map(r => r.kind).join(','));
    water.add(JSON.stringify(map.layout.water)); trees.add(JSON.stringify(map.layout.trees)); rocks.add(JSON.stringify(map.layout.rocks));
  }
  // Preserve the original 95% variation target as the batch grows. A rejected
  // layout must use the validated fallback rather than loosen connectivity.
  expect(fallbacks / 256).toBeLessThanOrEqual(.05);
  expect(regions.size).toBeGreaterThan(8);
  expect(water.size).toBeGreaterThan(240); expect(trees.size).toBeGreaterThan(240); expect(rocks.size).toBeGreaterThan(240);
});

test('validation rejects blocked spawn, blocked roads and isolated walkable pockets', () => {
  const blank = { trees: [], rocks: [], regions: [], water: [] };
  expect(validateLayout({ ...blank, water: [{ x: 0, z: 0, radius: 1 }] }).issues).toContain('blocked-spawn');
  expect(validateLayout({ ...blank, rocks: [[-20, 6]] }).issues).toContain('blocked-road');
  const ring = Array.from({ length: 8 }, (_, i) => ({ x: 16 + Math.sin(i * Math.PI / 4) * 4.3, z: -16 + Math.cos(i * Math.PI / 4) * 4.3, radius: 1.8 }));
  expect(validateLayout({ ...blank, water: ring }).issues).toContain('disconnected-ground');
});
