import { test, expect } from '@playwright/test';
import { Combat, type Enemy } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { RunFlow } from '../src/run-flow';
import { RunShop } from '../src/shop';
import { TREASURE_RUNNER } from '../src/special-enemies';
import { seededRandom } from '../scripts/wave-balance';

const origin = { x: 0, z: 0 };
function fixture(species: SpeciesId = 'yanrong') {
  const c = new Combat([], 32, seededRandom(93));
  c.party = new PartySystem();
  c.party.reset([species]);
  c.fusionEnabled = true;
  c.automaticSpawning = false;
  c.reset();
  const run = new RunFlow(seededRandom(107));
  return { c, run };
}
function kill(c: Combat, enemy: Enemy, originKind: 'player' | 'spore' = 'player') {
  enemy.spawnTime = 0;
  (c as any).damageEnemy(enemy, 100000, 0, 0, originKind);
}
function finishWave(c: Combat, run: RunFlow) {
  run.waveElapsed = run.definition.seconds;
  run.resolveBoundary(c);
  while (c.progression.awaitingChoice) {
    const id = c.progression.offers[0];
    expect(id).toBeDefined();
    expect(c.chooseUpgrade(id)).toBe(true);
  }
  run.resolveBoundary(c);
  expect(run.phase).toBe('shop');
  return run.shop!;
}

test('capturing a treasure runner gives original gold and XP plus exactly one free next-shop refresh', () => {
  const { c, run } = fixture(); run.waveIndex = 1; run.prepare(c, origin);
  const runner = c.spawn('draft-treasure-runner', 0, 8, 0)!;
  kill(c, runner); kill(c, runner);
  expect(c.treasureCaught).toBe(1);
  expect(c.goldEarned).toBe(TREASURE_RUNNER.coins);
  expect(c.orbs.filter(o => o.active).reduce((sum, o) => sum + o.value, 0)).toBe(TREASURE_RUNNER.xp);
  const shop = finishWave(c, run);
  expect(run.coins).toBe(40 + TREASURE_RUNNER.coins);
  expect(run.lastWaveGrowth).toEqual({ treasureCaught: 1, sporeBonus: 0 });
  expect(shop.refreshCost).toBe(0);
  expect(shop.treasureRefreshes).toBe(1);
  const oldToken = shop.token, coins = run.coins;
  expect(run.refresh(oldToken)).toBe(true);
  expect(run.coins).toBe(coins);
  expect(shop.treasureRefreshes).toBe(0);
  expect(shop.refreshCost).toBe(5);
  expect(run.refresh(oldToken)).toBe(false);
  expect(run.coins).toBe(coins);
  expect(run.refresh(shop.token)).toBe(true);
  expect(run.coins).toBe(coins - 5);
  expect(shop.refreshCost).toBe(10);
  expect(run.nextWave(shop.token, c)).toBe(true);
  const nextShop = finishWave(c, run);
  expect(nextShop.refreshCost).toBe(5);
  expect(nextShop.treasureRefreshes).toBe(0);
});

test('treasure escape and ordinary players get no shop credit; no-capture shops still function', () => {
  const { c, run } = fixture(); run.waveIndex = 1; run.prepare(c, origin);
  const runner = c.spawn('draft-treasure-runner', 0, 4, 0)!;
  runner.spawnTime = 0;
  c.update(9, origin);
  expect(runner.active).toBe(false);
  expect(c.treasureEscapes).toBe(1);
  expect(c.treasureCaught).toBe(0);
  const shop = finishWave(c, run);
  expect(shop.refreshCost).toBe(5);
  expect(shop.treasureRefreshes).toBe(0);
  expect(run.coins).toBe(40);
  expect(run.refresh(shop.token)).toBe(true);
  expect(run.coins).toBe(35);
  expect(shop.refreshCost).toBe(10);
});

test('all three starting creatures receive a build-relevant affordable shop option', () => {
  const expected: [SpeciesId, string][] = [
    ['yanrong', 'split-on-hit'], ['bubblesalamander', 'area'], ['sproutspike', 'chain'],
  ];
  for (const [species, skill] of expected) {
    const { c } = fixture(species);
    const shop = new RunShop(c, 1, () => 0);
    expect(shop.items[1]).toMatchObject({ kind: 'reward', skill, price: 25 });
    expect(shop.items).toHaveLength(4);
    expect(shop.refreshCost).toBe(5);
  }
});

test('real spore-to-spore chain kills grant a bounded shop reward once', () => {
  const { c, run } = fixture(); run.waveIndex = 2; run.prepare(c, origin);
  const first = c.spawn('draft-spore-bomber', 0, 0, 0)!;
  const second = c.spawn('draft-spore-bomber', 2, 0, 0)!;
  kill(c, first);
  second.spawnTime = 0;
  c.update(.7, { x: 15, z: 15 });
  expect(second.active).toBe(false);
  expect(c.balanceTelemetry.sporeChainKills).toBe(1);
  const shop = finishWave(c, run);
  expect(run.lastWaveGrowth).toEqual({ treasureCaught: 0, sporeBonus: 3 });
  expect(run.coins).toBe(45 + 2 + 3);
  const previous = run.coins;
  run.resolveBoundary(c); run.resolveBoundary(c);
  expect(run.coins).toBe(previous);
  expect(shop.treasureRefreshes).toBe(0);
});

test('chain bounties are capped per wave and do not carry into later waves', () => {
  const { c, run } = fixture(); run.waveIndex = 2; run.prepare(c, origin);
  for (let i = 0; i < 5; i++) {
    const bomber = c.spawn('draft-spore-bomber', i, 8, 0)!;
    kill(c, bomber, 'spore');
  }
  expect(c.balanceTelemetry.sporeChainKills).toBe(5);
  let shop = finishWave(c, run);
  expect(run.lastWaveGrowth.sporeBonus).toBe(9);
  expect(run.coins).toBe(45 + 5 + 9);
  expect(run.nextWave(shop.token, c)).toBe(true);
  shop = finishWave(c, run);
  expect(run.lastWaveGrowth.sporeBonus).toBe(0);
  expect(run.coins).toBe(45 + 5 + 9 + 50);
  expect(shop.treasureRefreshes).toBe(0);
});

test('historical modes never receive formal shop entitlements', () => {
  const c = new Combat([], 32, seededRandom(17));
  c.reset();
  const treasure = c.spawn('draft-treasure-runner', 0, 4, 0)!;
  kill(c, treasure);
  expect(c.treasureCaught).toBe(0);
  c.reset();
  expect(c.treasureCaught).toBe(0);
});
