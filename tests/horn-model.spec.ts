import { test, expect } from '@playwright/test';
import { Combat, ENEMY_TYPES, WEAPON } from '../src/combat';
import { HORN, POUNCE, type DashStep } from '../src/trial';

const STEP = 1 / 60;
const trial = () => {
  const combat = new Combat([], 100, () => 0.4, 'horn-trial');
  (combat as unknown as { fireClock: number; spawnClock: number }).fireClock = Infinity;
  (combat as unknown as { spawnClock: number }).spawnClock = Infinity;
  return combat;
};
const dash = (fromX: number, fromZ: number, dx = 1, dz = 0, started = true): DashStep => ({ active: true, started, fromX, fromZ, dx, dz });

test('horn sweep hits crossed targets once per dash, knocks survivors, and preserves classic damage', () => {
  const combat = trial();
  const enemy = combat.spawn('tank', 2, 0, 0)!;
  combat.update(STEP, { x: 4, z: 0 }, dash(0, 0));
  expect(enemy.hp).toBe(100 - HORN.damage); expect(enemy.knockX).toBe(HORN.knockback);
  expect(enemy.stagger).toBe(HORN.stagger); expect(combat.hornHits).toBe(1); expect(combat.hp).toBe(100);
  combat.update(STEP, { x: enemy.x, z: enemy.z }, dash(4, 0, -1, 0, false));
  expect(combat.hornHits).toBe(1);
  combat.update(STEP, { x: enemy.x + 1, z: enemy.z }, dash(enemy.x - 1, enemy.z));
  expect(combat.hornHits).toBe(2);
  const classic = new Combat(); const target = classic.spawn('tank', 2, 0, 0)!;
  classic.update(STEP, { x: 4, z: 0 }, dash(0, 0));
  expect(target.hp).toBe(100); expect(classic.hornHits).toBe(0);
  expect(WEAPON.damage).toBe(18); expect(ENEMY_TYPES.fast.hp).toBe(18);
});

test('horn kills use the existing XP drop and pickup path; rear, spawning and covered targets are excluded', () => {
  const combat = trial(); const victim = combat.spawn('normal', 2, 0, 0)!;
  const rear = combat.spawn('tank', -1.5, 0, 0)!;
  const warning = combat.spawn('tank', 2, 0.5, 1)!;
  combat.update(STEP, { x: 4, z: 0 }, dash(0, 0));
  expect(victim.active).toBe(false); expect(combat.hornKills).toBe(1);
  expect(rear.hp).toBe(100); expect(warning.hp).toBe(100);
  for (let i = 0; i < 30; i++) combat.update(STEP, { x: 4, z: 0 });
  expect(combat.xp).toBe(3); expect(combat.collected).toBe(1);
  const cover = new Combat([{ x: 0.8, z: 0, radius: 0.3 }], 100, () => .4, 'horn-trial');
  (cover as unknown as { fireClock: number }).fireClock = Infinity;
  const protectedEnemy = cover.spawn('tank', 1.6, 0, 0)!;
  cover.update(STEP, { x: 0.3, z: 0 }, dash(0, 0));
  expect(protectedEnemy.hp).toBe(100); expect(cover.hornHits).toBe(0);
});

test('pounce telegraph locks direction, cannot deal windup damage, sweeps its hit, then recovers', () => {
  const combat = trial(); const enemy = combat.spawn('fast', 0, 4, 0)!;
  combat.update(STEP, { x: 0, z: 0 });
  expect(enemy.intent).toBe('windup'); expect(enemy.aimX).toBe(0); expect(enemy.aimZ).toBe(-1);
  expect(enemy.hp).toBe(POUNCE.hp);
  for (let i = 0; i < 20; i++) combat.update(STEP, { x: 2, z: 0 });
  expect(enemy.intent).toBe('windup'); expect(enemy.aimX).toBe(0); expect(combat.hp).toBe(100);
  for (let i = 0; i < 45; i++) combat.update(STEP, { x: 2, z: 0 });
  expect(enemy.intent).toBe('recover'); const resting = { x: enemy.x, z: enemy.z };
  combat.update(STEP, { ...resting });
  expect(combat.hp).toBe(100); expect(enemy.x).toBe(resting.x); expect(enemy.z).toBe(resting.z);
  const collision = trial(); const attacker = collision.spawn('fast', 0, 4, 0)!;
  attacker.intent = 'pounce'; attacker.intentTime = .3; attacker.aimX = 0; attacker.aimZ = -1;
  collision.update(.28, { x: 0, z: 0 });
  expect(attacker.z).toBeLessThan(-1); expect(collision.hp).toBe(94);
});

test('a horn strike interrupts a committed pounce, protects its hit target, and allows a later pounce', () => {
  const combat = trial(); const enemy = combat.spawn('fast', 0, 2, 0)!;
  enemy.intent = 'pounce'; enemy.intentTime = .2; enemy.aimX = 0; enemy.aimZ = -1;
  combat.update(STEP, { x: 0, z: 1 }, dash(0, 0, 0, 1));
  expect(enemy.intent).toBe('recover'); expect(combat.interrupts).toBe(1);
  expect(enemy.stagger).toBe(HORN.stagger); expect(enemy.hp).toBe(POUNCE.hp - HORN.damage); expect(combat.hp).toBe(100);
  for (let i = 0; i < 90; i++) combat.update(STEP, { x: 0, z: 0 });
  expect(enemy.intent === 'chase' || enemy.intent === 'windup').toBe(true);
});

test('upgrade/death freeze intents and horn hits; reset clears the trial and reused slots', () => {
  const combat = trial(); const enemy = combat.spawn('fast', 0, 4, 0)!;
  combat.update(STEP, { x: 0, z: 0 }); combat.progression.gainExperience(8);
  const frozen = combat.inspect(); combat.update(.5, { x: 0, z: 4 }, dash(0, 0, 0, 1));
  expect(combat.inspect()).toEqual(frozen);
  combat.reset('classic'); expect(combat.isTrial).toBe(false); expect(combat.hornHits).toBe(0);
  expect(combat.inspect().trial).toBeUndefined();
  const reused = combat.spawn('fast', 0, 3, 0)!;
  expect(reused).toBe(enemy); expect(reused.intent).toBe('chase'); expect(reused.stagger).toBe(0); expect(reused.hp).toBe(18);
  combat.hp = 0; const ended = combat.inspect(); combat.update(1, { x: 0, z: 3 }, dash(0, 0)); expect(combat.inspect()).toEqual(ended);
});

test('the same fixed steps give identical trial outcomes under 30, 60 and 120 Hz frame schedules', () => {
  const simulate = (fps: number) => {
    const combat = trial(); combat.spawn('fast', 0, 5, 0); combat.spawn('tank', 3, 0, 0);
    let accumulator = 0, tick = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-9 >= STEP) {
        accumulator -= STEP;
        const p = { x: Math.sin(tick * .04), z: 0 };
        combat.update(STEP, p); tick++;
      }
    }
    return combat.inspect();
  };
  expect(simulate(30)).toEqual(simulate(60)); expect(simulate(120)).toEqual(simulate(60));
});
