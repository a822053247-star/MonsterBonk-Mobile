import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { QuakeDrill, QUAKE_DRILL } from '../src/quake-drill';

function fixture() { const combat = new Combat([], 40, () => .5); const drill = new QuakeDrill(combat); drill.automatic = false; return { combat, drill }; }

test('movement is normalized, bounded and independent of frame rate', () => {
  const a = fixture().drill, b = fixture().drill;
  for (let i = 0; i < 30; i++) a.update(1 / 30, { x: -1, z: -1 });
  for (let i = 0; i < 120; i++) b.update(1 / 120, { x: -1, z: -1 });
  expect(Math.hypot(a.player.x - 4.5, a.player.z - 1.5)).toBeCloseTo(QUAKE_DRILL.speed);
  expect(a.player.x).toBeCloseTo(b.player.x); expect(a.player.z).toBeCloseTo(b.player.z);
  a.update(20, { x: 1, z: 1 }); expect(a.player.x).toBe(9.5); expect(a.player.z).toBe(5.5);
});

test('standing in a locked warning takes real damage once; walking out avoids it', () => {
  const still = fixture(), dodge = fixture(); still.drill.count = dodge.drill.count = 1;
  still.drill.radius = dodge.drill.radius = 4.6;
  still.drill.trigger(); dodge.drill.trigger();
  still.drill.update(1.29); expect(still.combat.hp).toBe(100);
  still.drill.update(.1); expect(still.combat.hp).toBe(80);
  still.drill.update(1.3); expect(still.combat.hp).toBe(80);
  dodge.drill.update(1.3, { x: -1, z: 0 }); expect(dodge.combat.hp).toBe(100); expect(dodge.drill.dodged).toBe(1);
});

test('six large quakes lock their settings and reserve a reachable safe pocket', () => {
  const { drill, combat } = fixture(); drill.count = 6; drill.radius = 5.5;
  const slots = [...drill.zones];
  for (const point of [[4.5,1.5],[0,.1],[9.5,5.5],[-9.5,-5.5],[0,5.5],[5.8,0],[-5.8,0]]) {
    drill.reset(); drill.player.x = point[0]; drill.player.z = point[1];
    expect(drill.trigger()).toBe(true); expect(drill.trigger()).toBe(false);
    expect(drill.zones.filter(zone => zone.active)).toHaveLength(6);
    expect(Math.abs(drill.safePoint.x)).toBeLessThanOrEqual(9.5); expect(Math.abs(drill.safePoint.z)).toBeLessThanOrEqual(5.5);
    const dx = drill.safePoint.x - drill.player.x, dz = drill.safePoint.z - drill.player.z;
    const distance = Math.hypot(dx, dz);
    expect(distance / QUAKE_DRILL.speed).toBeLessThan(1.3);
    for (const zone of drill.zones) expect(Math.hypot(zone.x - drill.safePoint.x, zone.z - drill.safePoint.z)).toBeGreaterThan(zone.radius);
    drill.update(distance / QUAKE_DRILL.speed, { x: dx, z: dz }); drill.update(2);
    expect(combat.hp).toBe(100);
  }
  drill.reset(); drill.trigger(); drill.radius = 2.5; drill.count = 2;
  expect(drill.zones.every(zone => zone.radius === 5.5)).toBe(true);
  drill.update(3.2); expect(drill.zones.every(zone => !zone.active)).toBe(true);
  expect(drill.zones.every((zone, i) => zone === slots[i])).toBe(true);
});

test('death stops scheduling and reset restores health, clocks and all pool slots', () => {
  const { combat, drill } = fixture(); drill.count = 6; combat.hp = 20;
  drill.trigger(); drill.update(2);
  expect(combat.hp).toBe(0); const time = drill.elapsed;
  drill.update(10, { x: 1, z: 0 }); expect(drill.elapsed).toBe(time);
  drill.reset(); expect(drill.inspect()).toMatchObject({ hp: 100, elapsed: 0, volleys: 0, hits: 0, dodged: 0, zones: [] });
});
