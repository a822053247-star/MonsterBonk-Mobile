import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { ENCOUNTER_RULES } from '../src/enemy-challenge';
import { ELITE_QUAKE_DURATION } from '../src/elite-quake';
import { EliteQuakeView } from '../src/elite-quake-view';

test('elite impact is emitted on the actual damage tick and remains anchored as the elite moves', () => {
  const combat = new Combat([], 40, () => .5), c = combat.encounters;
  c.beginWave(4);
  const elite = c.spawnElite(combat, { x: 0, z: 0 })!;
  Object.assign(elite, { x: 0, z: 0, spawnTime: 0 }); c.elitePulsing = true;
  const player = { x: 3, z: 0 };
  const tick = (dt: number) => { c.beforeTick(dt); c.movement(elite, dt, player, combat, 0, 0); c.advanceHazards(dt, combat, player, player); };
  tick(ENCOUNTER_RULES.eliteWindup - .01);
  expect(c.eliteQuake.active).toBe(false); expect(combat.hp).toBe(100);
  tick(.02);
  expect(c.eliteQuake).toMatchObject({ active: true, age: 0, x: 0, z: 0 });
  expect(combat.hp).toBe(100 - ENCOUNTER_RULES.elitePulseDamage);
  elite.x = 9; combat.invulnerability = 0; tick(.1);
  expect(c.eliteQuake.x).toBe(0); expect(c.eliteQuake.age).toBeCloseTo(.1);
  expect(combat.hp).toBe(100 - ENCOUNTER_RULES.elitePulseDamage);
  c.beforeTick(ELITE_QUAKE_DURATION); expect(c.eliteQuake.active).toBe(false);
  c.reset(); expect(c.eliteQuake).toEqual({ active: false, age: 0, x: 0, z: 0 });
});

test('missed attacks still show the impact and warning interruption cannot create one', () => {
  const combat = new Combat([], 40, () => .5), c = combat.encounters;
  c.beginWave(4); const elite = c.spawnElite(combat, { x: 0, z: 0 })!;
  Object.assign(elite, { x: 0, z: 0, spawnTime: 0 }); c.elitePulsing = true;
  const player = { x: 12, z: 0 };
  c.beforeTick(.1); c.freezeEnemy(elite);
  c.movement(elite, 1.4, player, combat, 0, 0); c.advanceHazards(.1, combat, player, player);
  expect(c.eliteQuake.active).toBe(false);
  c.elitePulsing = true; c.movement(elite, 1.4, player, combat, 0, 0); c.advanceHazards(.1, combat, player, player);
  expect(c.eliteQuake.active).toBe(true); expect(combat.hp).toBe(100);
});

test('quake rendering is read-only, bounded and keeps the real warning radius at low quality', () => {
  const view = new EliteQuakeView(), impact = { active: true, age: .17, x: 2, z: 3 };
  view.render(null, impact, 3);
  expect(view.inspect()).toMatchObject({ visible: true, warning: false, rocks: 24, dust: 24 });
  view.render(null, impact, 2);
  expect(view.inspect()).toMatchObject({ rocks: 10, dust: 10 });
  expect(impact).toEqual({ active: true, age: .17, x: 2, z: 3 });
  view.render({ x: 4, z: 5, progress: .7 }, { ...impact, active: false }, 2);
  expect(view.inspect()).toMatchObject({ warning: true, radius: ENCOUNTER_RULES.elitePulseRadius + .62, rocks: 0, dust: 0 });
  view.clear(); expect(view.inspect().visible).toBe(false); view.dispose();
});
