import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import { RUN_WAVES } from '../src/run-flow';
import { BALANCE_SPECIES, BALANCE_BUILDS, measureWave, seededRandom, waveBalanceMatrix } from '../scripts/wave-balance';

test('the fixed-seed baseline covers all three creatures, two builds and six real waves', () => {
  const rows = waveBalanceMatrix({ seed: 901, maxSeconds: 1 });
  expect(rows).toHaveLength(BALANCE_SPECIES.length * BALANCE_BUILDS.length * RUN_WAVES.length);
  for (const row of rows) {
    expect(BALANCE_SPECIES).toContain(row.character);
    expect(BALANCE_BUILDS).toContain(row.build);
    expect(row.scheduledSeconds).toBe(RUN_WAVES[row.wave - 1].seconds);
    expect(row.cap).toBe(RUN_WAVES[row.wave - 1].cap);
    expect(row.observedSeconds).toBeGreaterThan(0);
    expect(row.observedSeconds).toBeLessThanOrEqual(1);
    expect(row.kills).toBeGreaterThanOrEqual(0);
    expect(row.damageEvents).toBeGreaterThanOrEqual(0);
    expect(row.xpPerMinute).toBeGreaterThanOrEqual(0);
    expect(row.projectileBlockedAttempts).toBeGreaterThanOrEqual(0);
    expect(row.projectilePeak).toBeLessThanOrEqual(COMBAT_LIMITS.projectiles);
    expect(row.activePeak).toBeLessThanOrEqual(row.cap);
    expect(row.sporeChainKills).toBeLessThanOrEqual(row.sporeExplosionKills);
    expect(row.treasureEscapeRate === null || row.treasureEscapeRate >= 0 && row.treasureEscapeRate <= 1).toBe(true);
    expect(Object.keys(row.weaponShots)).toContain(
      row.character === 'yanrong' ? 'spark' : row.character === 'bubblesalamander' ? 'bubble' : 'leaf',
    );
  }
});

test('identical inputs produce byte-for-byte reproducible combat and flow metrics', () => {
  const params = { seed: 7102026, maxSeconds: 12 };
  const first = measureWave('yanrong', 'focused', 3, params);
  const again = measureWave('yanrong', 'focused', 3, params);
  expect(again).toEqual(first);
  expect(first.presetUpgrades).toHaveLength(4);
  expect(first.independentWave).toBe(true);
  expect(first.movement).toBe('fixed-circle-r6-omega0.43');
});

test('the telemetry counts accepted hits, not blocked i-frame hits, and resets', () => {
  const combat = new Combat([], 32, seededRandom(17));
  combat.party = new PartySystem(); combat.fusionEnabled = true; combat.automaticSpawning = false;
  combat.reset();
  combat.hitPlayer(3);
  combat.hitPlayer(3);
  expect(combat.balanceTelemetry.damageEvents).toBe(1);
  expect(combat.hp).toBe(97);
  combat.reset();
  expect(combat.balanceTelemetry).toEqual({
    damageEvents: 0, projectileBlockedAttempts: 0, sporeChainKills: 0, derivedDenied: 0, queuePeak: 0,
  });
});

test('ready weapons blocked by the shared projectile pool produce a measurable counter', () => {
  const combat = new Combat([], 32, seededRandom(11));
  combat.party = new PartySystem(); combat.fusionEnabled = true; combat.automaticSpawning = false;
  combat.reset();
  combat.spawn('normal', 0, 4, 0);
  for (const p of combat.projectiles) Object.assign(p, {
    active: true, x: 0, z: 0, previousX: 0, previousZ: 0,
    vx: 0, vz: 0, life: 99, distance: 0, damage: 0,
  });
  combat.party!.syncLeader({ x: 0, z: 0 }, 0);
  combat.update(1 / 60, { x: 0, z: 0 });
  expect(combat.balanceTelemetry.projectileBlockedAttempts).toBeGreaterThan(0);
  expect(combat.shotsFired).toBe(0);
});

test('a real spore-origin bomber kill is counted as a chain, not a fake direct kill', () => {
  const combat = new Combat([], 32, seededRandom(23));
  combat.party = new PartySystem(); combat.fusionEnabled = true; combat.automaticSpawning = false;
  combat.reset();
  combat.encounters.beginWave(2);
  const first = combat.spawn('draft-spore-bomber', 0, 0, 0)!;
  const second = combat.spawn('draft-spore-bomber', 1, 0, 0)!;
  (combat as unknown as {damageEnemy: (e: typeof first, d: number, x: number, z: number) => void})
    .damageEnemy(first, 100000, 0, 0);
  expect(combat.balanceTelemetry.sporeChainKills).toBe(0);
  combat.update(.7, { x: 15, z: 15 });
  expect(second.active).toBe(false);
  expect(combat.sporeKills).toBeGreaterThanOrEqual(1);
  expect(combat.balanceTelemetry.sporeChainKills).toBe(1);
});

test('invalid inputs cannot produce mislabeled baseline output', () => {
  expect(() => measureWave('yanrong', 'focused', 0)).toThrow(RangeError);
  expect(() => measureWave('yanrong', 'focused', 7)).toThrow(RangeError);
  expect(() => measureWave('yanrong', 'focused', 2, { maxSeconds: 0 })).toThrow(RangeError);
});
