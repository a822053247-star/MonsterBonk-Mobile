import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { RunFlow, RUN_WAVES } from '../src/run-flow';

const origin = { x: 0, z: 0 };
function fixture() {
  const c = new Combat([], 32, () => .999);
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  return { c, run: new RunFlow(() => 0) };
}
function shop(f: ReturnType<typeof fixture>) { f.run.update(f.run.definition.seconds, f.c, origin); expect(f.run.phase).toBe('shop'); return f.run.shop!; }

test('six waves provide five shops, 455 combat seconds and a 9m15s reference run with 20s rests', () => {
  const { c, run } = fixture();
  for (let wave = 1; wave <= 6; wave++) {
    if(wave===6) {
      run.prepare(c,origin); const boss=c.encounters.boss!; boss.spawnTime=0;
      (c as any).damageEnemy(boss,boss.hp,0,0); c.encounters.beforeTick(1);
    }
    expect(run.wave).toBe(wave); run.update(run.definition.seconds, c, origin);
    if (wave < 6) {
      expect(run.phase).toBe('shop'); const token = run.shop!.token;
      run.update(100, c, origin); expect(run.wave).toBe(wave);
      run.updateRest(20); expect(run.nextWave(token, c)).toBe(true);
      expect(run.nextWave(token, c)).toBe(false);
    }
  }
  expect(run.phase).toBe('won'); expect(run.completedWaves).toBe(6);
  expect(run.combatElapsed).toBe(455); expect(run.totalElapsed).toBe(555);
  expect(run.coins).toBe(225); expect(RUN_WAVES).toHaveLength(6);
});

test('wave boundary claims loose XP once, resolves pending upgrades, and clears combat without resetting build/HP', () => {
  const f = fixture(); f.c.hp = 73;
  Object.assign(f.c.orbs[0], { active: true, value: 8 });
  f.c.spawn('tank', 6, 0, 0);
  f.run.update(65, f.c, origin);
  expect(f.run.phase).toBe('fighting'); expect(f.c.progression.awaitingChoice).toBe(true);
  expect(f.c.progression.totalExperience).toBe(8); expect(f.run.coins).toBe(0);
  f.run.resolveBoundary(f.c); expect(f.c.progression.totalExperience).toBe(8);
  expect(f.c.chooseUpgrade(f.c.progression.offers[0])).toBe(true);
  f.run.resolveBoundary(f.c); expect(f.run.phase).toBe('shop');
  expect(f.run.coins).toBe(35); expect(f.c.hp).toBe(73);
  expect(f.c.enemies.some(e => e.active)).toBe(false); expect(f.c.projectiles.some(s => s.active)).toBe(false);
  f.run.resolveBoundary(f.c); expect(f.run.coins).toBe(35);
});

test('real kills award gold once and recycling a living enemy does not count', () => {
  const { c, run } = fixture();
  c.spawn('normal', 5, 0, 0)!.hp = 1; c.update(.3, origin); run.update(.3, c, origin);
  expect(c.kills).toBe(1); expect(run.coins).toBe(1);
  const alive = c.spawn('tank', 7, 0, 0)!; alive.active = false;
  run.update(.01, c, origin); expect(run.coins).toBe(1);
  run.waveElapsed = 65; run.resolveBoundary(c); expect(run.coins).toBe(36);
});

test('buying a weapon is atomic, costs gold rather than XP, and rejects stale/double/poor purchases', () => {
  const f = fixture(), s = shop(f), token = s.token;
  expect(s.items[0].price).toBe(35); const xp = f.c.progression.totalExperience;
  expect(f.run.buy(0, token)).toBe(true); expect(f.run.coins).toBe(0);
  expect(f.c.runBuild.attacks).toHaveLength(2); expect(f.c.progression.totalExperience).toBe(xp);
  expect(f.c.progression.level).toBe(1); expect(f.c.progression.pendingChoices).toBe(0);
  expect(f.run.buy(0, token)).toBe(false); expect(f.run.buy(1, s.token)).toBe(false);
  expect(f.run.refresh(s.token)).toBe(false); expect(f.run.coins).toBe(0);
});

test('healing preserves max HP; refresh prices increase and stale shop tokens cannot spend', () => {
  const f = fixture(); f.c.hp = 40; const s = shop(f);
  expect(f.run.buy(3, s.token)).toBe(true); expect(f.c.hp).toBe(75); expect(f.c.maxHp).toBe(100);
  expect(f.run.coins).toBe(17); const token = s.token;
  expect(f.run.refresh(token)).toBe(true); expect(f.run.coins).toBe(12); expect(s.refreshCost).toBe(10);
  expect(f.run.buy(0, token)).toBe(false); expect(f.run.refresh(token)).toBe(false);
  expect(f.run.refresh(s.token)).toBe(true); expect(f.run.coins).toBe(2); expect(s.refreshCost).toBe(15);
  const frozen = JSON.stringify(f.c.inspect()); f.run.updateRest(20);
  expect(JSON.stringify(f.c.inspect())).toBe(frozen);
  expect(f.run.nextWave(s.token, f.c)).toBe(true); expect(f.c.hp).toBe(75);
});

test('fixed rewards give a low-kill build real purchasing tradeoffs', () => {
  const f = fixture(); let s = shop(f);
  expect(f.run.buy(0, s.token)).toBe(true); expect(f.run.coins).toBe(0);
  expect(f.run.nextWave(s.token, f.c)).toBe(true); s = shop(f);
  expect(f.run.coins).toBe(40); expect(f.run.buy(1, s.token)).toBe(true);
  expect(f.run.coins).toBe(15); expect(f.run.buy(0, s.token)).toBe(false);
});

test('death at the last boundary defeats rather than wins and leaves historical modes unchanged', () => {
  const f = fixture(); f.run.waveIndex = 5; f.run.waveElapsed = 90; f.c.hp = 0;
  f.run.resolveBoundary(f.c); expect(f.run.phase).toBe('lost'); expect(f.run.completedWaves).toBe(0);
  f.c.fusionEnabled = false; f.c.automaticSpawning = true; f.c.reset();
  expect(f.c.progression.skills).toHaveLength(8); expect(f.c.goldEarned).toBe(0);
});
