import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, RUN_WAVES } from '../src/run-flow';
import { WAVE_DIRECTOR, directorStage } from '../src/wave-director';
import { measureWave, seededRandom } from '../scripts/wave-balance';

const origin = { x: 0, z: 0 };
function fixture(seed = 42) {
  const c = new Combat([], 32, seededRandom(seed));
  c.party = new PartySystem();
  c.fusionEnabled = true; c.automaticSpawning = false; c.useNavigation = true;
  c.reset();
  return { c, run: new RunFlow(seededRandom(seed + 1)) };
}
function clearOrdinary(c: Combat) {
  for (const enemy of c.enemies) if (enemy.active && !enemy.rank) enemy.active = false;
}

test('six director plans cover the original wave lengths with increasing then relaxing danger', () => {
  expect(WAVE_DIRECTOR).toHaveLength(6);
  const expected = [[20,45,65], [18,50,70], [20,55,75], [10,50,75], [25,60,80], [25,60,90]];
  expect(WAVE_DIRECTOR.map(p => p.stages.map(s => s.end))).toEqual(expected);
  for (let wave = 1; wave <= 6; wave++) {
    const plan = WAVE_DIRECTOR[wave - 1];
    expect(plan.stages[2].end).toBe(RUN_WAVES[wave - 1].seconds);
    expect(directorStage(wave, 0)).toBe(plan.stages[0]);
    expect(directorStage(wave, plan.stages[0].end)).toBe(plan.stages[1]);
    expect(directorStage(wave, plan.stages[1].end)).toBe(plan.stages[2]);
    for (const stage of plan.stages) {
      expect(stage.pace).toBeGreaterThan(0);
      expect(stage.escortPulses).toBeLessThanOrEqual(2);
      expect(stage.sporeCap).toBeLessThanOrEqual(3);
      expect(stage.fastCap + stage.tankCap + stage.sporeCap).toBeLessThan(RUN_WAVES[wave - 1].cap);
    }
  }
  expect(WAVE_DIRECTOR[3].sporeFirst).toBe(25);
  expect(WAVE_DIRECTOR[3].treasureFirst).toBe(40);
  expect(WAVE_DIRECTOR[4].stages[1].pace).toBeLessThan(WAVE_DIRECTOR[4].stages[0].pace);
  expect(() => directorStage(7, 0)).toThrow(RangeError);
});

test('wave one keeps its first twenty seconds free of fast/tank escorts', () => {
  const { c, run } = fixture();
  run.update(1.2, c, origin);
  run.update(.35, c, origin);
  expect(c.enemies.filter(e => e.active).length).toBeGreaterThan(0);
  expect(c.enemies.filter(e => e.active && (e.kind === 'fast' || e.kind === 'tank'))).toHaveLength(0);
  expect(run.inspect().director.beat).toBe('warmup');
});

test('threat quotas are respected even if the field already contains their maximum', () => {
  for (let wave = 1; wave <= 6; wave++) {
    const { c, run } = fixture(wave * 11); run.waveIndex = wave - 1;
    run.waveElapsed = WAVE_DIRECTOR[wave - 1].stages[0].end + 1;
    const stage = directorStage(wave, run.waveElapsed);
    for (let i = 0; i < stage.fastCap; i++) c.spawn('fast', 15, -15, 0);
    for (let i = 0; i < stage.tankCap; i++) c.spawn('tank', -15, 15, 0);
    run.update(1.2, c, origin);
    run.update(.35, c, origin);
    expect(c.enemies.filter(e => e.active && !e.rank && e.kind === 'fast')).toHaveLength(stage.fastCap);
    expect(c.enemies.filter(e => e.active && !e.rank && e.kind === 'tank')).toHaveLength(stage.tankCap);
    expect(c.enemies.filter(e => e.active).length).toBeLessThanOrEqual(RUN_WAVES[wave - 1].cap);
  }
});

test('wave four introduces the elite before spores and treasure, without additional waves', () => {
  const { c, run } = fixture(18); run.waveIndex = 3;
  for (let second = 1; second <= 24; second++) {
    run.update(1, c, origin);
    expect(c.enemies.some(e => e.active && e.kind === 'draft-spore-bomber')).toBe(false);
    expect(c.enemies.some(e => e.active && e.kind === 'draft-treasure-runner')).toBe(false);
    clearOrdinary(c);
  }
  expect(c.encounters.elite?.active).toBe(true);
  run.update(1, c, origin);
  expect(c.enemies.some(e => e.active && e.kind === 'draft-spore-bomber')).toBe(true);
  clearOrdinary(c);
  for (let second = 26; second <= 40; second++) {
    run.update(1, c, origin);
    if (second < 40) expect(c.enemies.some(e => e.active && e.kind === 'draft-treasure-runner')).toBe(false);
    if (second !== 40) clearOrdinary(c);
  }
  expect(c.enemies.some(e => e.active && e.kind === 'draft-treasure-runner')).toBe(true);
});

test('boss windup suppresses spore candidates until a safe weighted slot is available', () => {
  const { c, run } = fixture(25); run.waveIndex = 5;
  for (let second = 1; second <= 28; second++) {
    run.update(1, c, origin);
    if (second === 2) c.encounters.bossState = 'dash-windup';
    expect(c.enemies.some(e => e.active && e.kind === 'draft-spore-bomber')).toBe(false);
    clearOrdinary(c);
  }
  expect(c.encounters.boss?.active).toBe(true);
  c.encounters.bossState = 'approach';
  let appeared = false;
  for (let second = 0; second < 12; second++) {
    run.update(1, c, origin);
    appeared ||= c.enemies.some(e => e.active && e.kind === 'draft-spore-bomber');
    if (appeared) break;
    clearOrdinary(c);
  }
  expect(appeared).toBe(true);
});

test('director remains fixed-seed reproducible in real 60Hz Combat and RunFlow', () => {
  const params = { seed: 90125, maxSeconds: 10 };
  const first = measureWave('bubblesalamander', 'focused', 4, params);
  const second = measureWave('bubblesalamander', 'focused', 4, params);
  expect(second).toEqual(first);
  expect(first.cap).toBe(160);
});
