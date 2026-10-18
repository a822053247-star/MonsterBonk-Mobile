import { test, expect } from '@playwright/test';
import { AdaptiveQuality } from '../src/quality';
import { cameraFraction } from '../src/camera-collision';
import { Combat, COMBAT_LIMITS } from '../src/combat';

test('adaptive graphics reduces pixels under sustained load and recovers with hysteresis', () => {
  const quality = new AdaptiveQuality();
  for (let i = 0; i < 400; i++) quality.sample(1 / 35);
  expect(quality.scale).toBe(0.65);
  expect(quality.targetFps).toBe(30);
  const low = quality.pixelRatio(3, 1920, 1080);
  for (let i = 0; i < 60; i++) quality.sample(1 / 60);
  expect(quality.targetFps).toBe(30);
  for (let i = 0; i < 750; i++) quality.sample(1 / 60);
  expect(quality.targetFps).toBe(60);
  expect(quality.pixelRatio(3, 1920, 1080)).toBeGreaterThanOrEqual(low);
  expect(quality.pixelRatio(3, 1920, 1080)).toBeLessThanOrEqual(1.5);
});

test('graphics modes bound pixel area, ignore suspended time, and reset sample windows', () => {
  const quality = new AdaptiveQuality('battery');
  for (let i = 0; i < 500; i++) quality.sample(1 / 120);
  expect(quality.targetFps).toBe(30);
  expect(quality.particles).toBe(2);
  const ratio = quality.pixelRatio(4, 3840, 2160);
  expect(3840 * 2160 * ratio ** 2).toBeLessThanOrEqual(1_300_001);
  quality.setMode('high');
  for (let i = 0; i < 500; i++) quality.sample(8);
  expect(quality.scale).toBe(1);
  for (let i = 0; i < 19; i++) quality.sample(0.1);
  quality.resetSamples();
  quality.sample(0.1);
  expect(quality.scale).toBe(1);
});

test('camera sweep catches foliage between player and lens and retains a padded gap', () => {
  const start = { x: 0, y: 0, z: 0 }, end = { x: 0, y: 0, z: 10 };
  const obstacle = { x: 0, y: 0, z: 5, rx: 1, ry: 1, rz: 1 };
  const fraction = cameraFraction(start, end, [obstacle]);
  expect(fraction).toBeGreaterThan(0.3);
  expect(fraction).toBeLessThan(0.355);
  expect(cameraFraction(start, { x: 0, y: 0, z: fraction * 10 }, [obstacle])).toBe(1);
  expect(cameraFraction(start, end, [{ ...obstacle, x: 5 }])).toBe(1);
  expect(cameraFraction(start, start, [obstacle])).toBe(1);
  expect(cameraFraction(obstacle, end, [obstacle])).toBe(0);
});

test('projectile trails and death fragments reuse bounded simulation slots and reset cleanly', () => {
  const combat = new Combat([], 100, () => 0.4);
  const projectileSlots = [...combat.projectiles], effectSlots = [...combat.effects];
  combat.spawn('normal', 0, 3, 0);
  for (let i = 0; i < 50; i++) combat.update(1 / 60, { x: 0, z: 0 });
  const death = combat.effects.find((effect) => effect.active && effect.kind === 'death');
  expect(death?.enemyKind).toBe('normal');
  expect(death?.duration).toBe(0.55);
  expect(combat.kills).toBe(1);
  expect(combat.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);
  expect(combat.effects).toHaveLength(COMBAT_LIMITS.effects);
  combat.reset();
  expect(combat.projectiles.every((slot, i) => slot === projectileSlots[i] && !slot.active)).toBe(true);
  expect(combat.effects.every((slot, i) => slot === effectSlots[i] && !slot.active)).toBe(true);
});
