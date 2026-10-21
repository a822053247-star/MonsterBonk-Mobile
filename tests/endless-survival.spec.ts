import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, WAVE_INTERMISSION_SECONDS } from '../src/run-flow';

const origin = { x: 0, z: 0 };
function fixture() {
  const combat = new Combat([], 32, () => .999);
  combat.party = new PartySystem();
  combat.fusionEnabled = true;
  combat.automaticSpawning = false;
  combat.reset();
  return { combat, run: new RunFlow(() => .5, 'endless') };
}
function defeatBoss(combat: Combat) {
  const boss = combat.encounters.boss!;
  boss.spawnTime = 0;
  (combat as any).damageEnemy(boss, boss.hp, 0, 0);
  combat.encounters.beforeTick(1);
}

test('Endless Boss timeout enters forced enrage, then victory advances to wave seven', () => {
  const { combat, run } = fixture();
  run.waveIndex = 5; // global wave 6
  run.prepare(combat, origin);
  const boss = combat.encounters.boss!;
  boss.spawnTime = 0;
  run.update(run.definition.seconds, combat, origin);
  expect(run.phase).toBe('fighting');
  expect(run.bossOvertime).toBe(true);
  expect(combat.encounters.forceEnraged).toBe(true);
  expect(combat.encounters.enraged).toBe(true);

  defeatBoss(combat);
  run.update(.01, combat, origin);
  expect(run.phase).toBe('intermission');
  expect(run.wave).toBe(6);
  expect(run.completedWaves).toBe(1);
  expect(run.bossesDefeated).toBe(1);
  expect(run.coins).toBe(60);
  run.updateRest(WAVE_INTERMISSION_SECONDS, combat);
  expect(run.wave).toBe(7);
  expect(run.phase).toBe('fighting');
  expect(run.cycle).toBe(2);
  expect(run.waveInCycle).toBe(1);
  expect(run.activeModifiers).toHaveLength(1);
  run.prepare(combat, origin);
  expect(combat.endlessCycleIndex).toBe(1);
  expect(combat.enemyMaxHp('normal')).toBeCloseTo(33);
  expect(run.waveLabel).toBe('第 7 波 · 第 2 轮');
});

test('Every cycle repeats the fifth-wave shop and sixth-wave Boss without array overflow', () => {
  const { combat, run } = fixture();
  run.waveIndex = 10; // global wave 11, cycle 2 wave five
  (run as any).rollCycleModifiers();
  run.update(run.definition.seconds, combat, origin);
  expect(run.phase).toBe('intermission');
  run.updateRest(WAVE_INTERMISSION_SECONDS, combat);
  expect(run.phase).toBe('shop');
  const token = run.shop!.token;
  expect(run.nextWave(token, combat)).toBe(true);
  expect(run.wave).toBe(12);
  expect(run.isBossWave).toBe(true);
  run.prepare(combat, origin);
  expect(combat.encounters.wave).toBe(6);
  defeatBoss(combat);
  run.update(.01, combat, origin);
  expect(run.phase).toBe('intermission');
  expect(run.bossesDefeated).toBe(1);
  run.updateRest(WAVE_INTERMISSION_SECONDS, combat);
  expect(run.wave).toBe(13);
  expect(run.cycle).toBe(3);
  expect(run.activeModifiers).toHaveLength(1);
});

test('Endless difficulty and modifier count stay bounded, and campaign remains finite', () => {
  const { combat, run } = fixture();
  run.waveIndex = 18; // wave 19, cycle 4
  (run as any).rollCycleModifiers();
  run.prepare(combat, origin);
  expect(run.activeModifiers).toHaveLength(2);
  expect(run.definition.cap).toBeLessThanOrEqual(128);
  expect(combat.endlessEnemyHealthMultiplier).toBeCloseTo(1.3);
  expect(combat.endlessContactDamageMultiplier).toBeCloseTo(1.15);
  expect(combat.endlessBossHealthMultiplier).toBeCloseTo(1.54);

  const campaign = new RunFlow(() => .5);
  expect(campaign.endless).toBe(false);
  expect(campaign.waveLabel).toBe('第 1 / 6 波');
  expect(campaign.definition.seconds).toBe(65);
});
