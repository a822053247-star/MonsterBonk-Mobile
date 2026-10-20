import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS, ENEMY_TYPES, SWARM_RULES } from '../src/combat';
import { RunFlow, RUN_WAVES } from '../src/run-flow';
import { PartySystem } from '../src/party';

const origin = { x: 0, z: 0 };
function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function fixture(seed = 42, obstacles: { x: number; z: number; radius: number }[] = []) {
  const c = new Combat(obstacles, 32, seeded(seed));
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.useNavigation = true; c.reset();
  return { c, run: new RunFlow(seeded(seed)) };
}
function kill(c: Combat, enemy: Combat['enemies'][number]) {
  enemy.spawnTime = 0;
  (c as any).damageEnemy(enemy, 100000, 0, 0);
}

test('large groups spawn in two pulses, with a 256-slot pool and 200-active wave-five cap', () => {
  expect(RUN_WAVES.map(w => w.cap)).toEqual([60, 90, 120, 160, 200, 120]);
  expect(RUN_WAVES.map(w => w.groupSize)).toEqual([12, 18, 24, 32, 40, 16]);
  for (let wave = 1; wave <= 5; wave++) {
    const { c, run } = fixture(); run.waveIndex = wave-1;
    run.update(1.2, c, origin);
    expect(c.enemies.filter(e => e.active).length).toBeGreaterThan(0);
    const before = c.enemies.filter(e => e.active).length;
    expect(before).toBeLessThanOrEqual(Math.ceil(run.definition.groupSize / 2));
    run.update(.35, c, origin);
    expect(c.enemies.filter(e => e.active).length).toBeGreaterThan(before);
    for (let batch = 0; batch < 40; batch++) {
      run.waveElapsed = 12; run.update(run.definition.interval, c, origin);
      expect(c.enemies.filter(e => e.active).length).toBeLessThanOrEqual(run.definition.cap);
    }
    expect(c.enemies).toHaveLength(COMBAT_LIMITS.enemies);
    if (wave === 4) expect(c.encounters.elite?.active).toBe(true);
  }
});

test('placement is seeded, stays in one incoming sector, and does not overlap player, enemies, cover or bounds', () => {
  const obstacles = [{ x: 8, z: 0, radius: 2 }, { x: 22, z: 5, radius: 2 }];
  const snapshots: string[] = [];
  for (const seed of [1, 17, 491, 1]) {
    const { c } = fixture(seed, obstacles); c.encounters.beginWave(5);
    for (const player of [origin, { x: 29, z: 0 }, { x: -28, z: -5 }]) {
      c.clearWave(); c.encounters.beginWave(5);
      expect(c.spawnSwarm(player, 8, 36)).toBeGreaterThanOrEqual(4);
      const enemies = c.enemies.filter(e => e.active), first = enemies[0];
      const heading = Math.atan2(first.x-player.x, first.z-player.z);
      for (const e of enemies) {
        expect(e.spawnTime).toBe(.75);
        expect(Math.hypot(e.x-player.x, e.z-player.z)).toBeGreaterThanOrEqual(SWARM_RULES.minDistance-1e-8);
        expect(Math.hypot(e.x-player.x, e.z-player.z)).toBeLessThanOrEqual(SWARM_RULES.maxDistance+1e-8);
        expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(32-c.enemyRadius(e)-.2+1e-8);
        const angle = Math.atan2(e.x-player.x, e.z-player.z)-heading;
        expect(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)))).toBeLessThanOrEqual(SWARM_RULES.halfAngle+SWARM_RULES.laneAngle+1e-8);
        for (const o of obstacles) expect(Math.hypot(e.x-o.x, e.z-o.z)).toBeGreaterThanOrEqual(o.radius+c.enemyRadius(e)+.3-1e-8);
        for (const other of enemies) if (other !== e) expect(Math.hypot(e.x-other.x, e.z-other.z)).toBeGreaterThanOrEqual(c.enemyRadius(e)+c.enemyRadius(other)+.3-1e-8);
      }
      if (player === origin) snapshots.push(JSON.stringify(c.inspect()));
    }
  }
  expect(snapshots[0]).toBe(snapshots[3]); expect(snapshots[0]).not.toBe(snapshots[1]);
});

test('unreachable terrain skips the batch within bounded attempts, without unsafe fallback or queued burst', () => {
  const { c, run } = fixture(3, [{ x: 0, z: 0, radius: 14 }]);
  for (let i = 0; i < 100; i++) run.update(.2, c, origin);
  expect(c.spawned).toBe(0); expect(c.enemies.some(e => e.active)).toBe(false);
  const enclosed = fixture(3, Array.from({ length: 32 }, (_, i) => ({ x: Math.sin(i/32*Math.PI*2)*6, z: Math.cos(i/32*Math.PI*2)*6, radius: .8 })));
  enclosed.c.encounters.beginWave(1);
  expect(enclosed.c.spawnSwarm(origin, 4, 24)).toBe(0);
});

test('full pool and partial capacity degrade safely without replacing live objects or overfilling', () => {
  const { c } = fixture(); c.encounters.beginWave(5);
  for (let i = 0; i < COMBAT_LIMITS.enemies - 1; i++) c.spawn('normal', -20, -20);
  const ids = c.enemies.filter(e => e.active).map(e => e.id);
  expect(c.spawnSwarm(origin, 8, COMBAT_LIMITS.enemies)).toBe(1);
  expect(c.spawnSwarm(origin, 8, COMBAT_LIMITS.enemies)).toBe(0);
  expect(c.enemies.slice(0, COMBAT_LIMITS.enemies - 1).map(e => e.id)).toEqual(ids);
  expect(c.enemies.filter(e => e.active)).toHaveLength(COMBAT_LIMITS.enemies);
  expect(c.spawnSwarm(origin, Infinity, COMBAT_LIMITS.enemies)).toBe(0);
  expect(c.spawnSwarm(origin, -1, COMBAT_LIMITS.enemies)).toBe(0);
});

test('swarm pays one XP per three kills, one coin per nine, and carries remainders', () => {
  const { c, run } = fixture(); run.prepare(c, origin);
  expect(c.spawnSwarm(origin, 12, 60)).toBe(12);
  const enemies = c.enemies.filter(e => e.active);
  for (const e of enemies.slice(0, 9)) { kill(c, e); kill(c, e); }
  expect(c.kills).toBe(9); expect(c.goldEarned).toBe(1);
  run.waveElapsed = 65; run.resolveBoundary(c);
  expect(c.xp).toBe(3); expect(run.coins).toBe(36);
  expect(run.nextWave(run.shop!.token, c)).toBe(true); run.prepare(c, origin);
  c.spawnSwarm(origin, 3, 90);
  for (const e of c.enemies.filter(e => e.active)) kill(c, e);
  expect(c.goldEarned).toBe(1);
  c.reset(); c.encounters.beginWave(1); c.spawnSwarm(origin, 2, 60);
  for (const e of c.enemies.filter(e => e.active)) kill(c, e);
  expect(c.goldEarned).toBe(0);
  const reused = c.spawn('normal', 8, 0, 0)!;
  kill(c, reused); expect(c.goldEarned).toBe(1);
});

test('escorts keep their stats and boss wave receives massed low-health support', () => {
  const { c, run } = fixture(); run.waveIndex = 4; run.prepare(c, origin);
  expect(c.spawnSwarm(origin, 8, 200, 'fast')).toBe(8);
  const fast = c.enemies.find(e => e.active && e.kind === 'fast')!;
  expect(fast.hp).toBe(88); expect(fast.swarm).toBe(false);
  c.clearWave(); run.waveIndex = 5; run.waveElapsed = 0; run.update(1.2, c, origin);
  expect(c.encounters.boss?.hp).toBe(6000);
  const first = c.enemies.filter(e => e.active && !e.rank);
  expect(first.length).toBeGreaterThan(0);
  expect(first.length).toBeLessThanOrEqual(8);
  run.update(.35, c, origin);
  const support = c.enemies.filter(e => e.active && !e.rank);
  expect(support.length).toBeGreaterThan(first.length);
  expect(support.every(e => e.swarm && e.hp === SWARM_RULES.health[5])).toBe(true);
});

test('high-throughput clearing has bounded economy, pooled XP merge and exactly-once boundary settlement', () => {
  for (let wave = 1; wave <= 5; wave++) {
    const { c, run } = fixture(wave); run.waveIndex = wave-1;
    for (let tick = 0; tick < run.definition.seconds*60; tick++) {
      run.update(1/60, c, origin);
      for (const e of c.enemies) if (e.active) kill(c, e);
      // Resolve choices only after automatic end-of-wave XP claim.
      while (c.progression.awaitingChoice) c.chooseUpgrade(c.progression.offers[0]);
      if (run.remaining < 1e-8) run.resolveBoundary(c);
    }
    expect(run.earned).toBeGreaterThanOrEqual(run.definition.reward);
    expect(run.earned).toBeLessThanOrEqual(run.definition.reward + c.kills + 18);
    expect(c.xp).toBeLessThanOrEqual(c.kills * 8 + 24);
    expect(c.xp).toBeGreaterThan(0); expect(run.phase).toBe('shop');
    const xp = c.xp, gold = run.earned;
    run.resolveBoundary(c); expect(c.xp).toBe(xp); expect(run.earned).toBe(gold);
    expect(c.orbs).toHaveLength(96);
  }
});

test('legacy automatic spawning and health are untouched and cannot opt into swarms accidentally', () => {
  const c = new Combat([], 32, seeded(4));
  expect(c.spawnSwarm(origin, 8, 36)).toBe(0);
  expect(c.spawn('normal', 8, 0)!.hp).toBe(30);
  expect(c.spawn('fast', -8, 0)!.hp).toBe(18);
  c.reset(); c.update(2.7, origin);
  expect(c.spawned).toBe(1); expect(c.enemies.filter(e => e.active)).toHaveLength(1);
});

test('a real area attack clears multiple low-health swarm members in one burst', () => {
  const { c } = fixture(); c.encounters.beginWave(5);
  for (let i = 0; i < 3; i++) expect(c.grantUpgrade('shockwave')).toBe(true);
  c.spawnSwarm(origin, 8, 36);
  const enemies = c.enemies.filter(e => e.active);
  const player = { x: enemies.reduce((s, e) => s+e.x, 0)/enemies.length, z: enemies.reduce((s, e) => s+e.z, 0)/enemies.length };
  for (const e of enemies) e.spawnTime = 0;
  for (const a of c.runBuild.attacks) a.cooldown = 100;
  for (let tick = 0; tick < 40; tick++) { c.party!.syncLeader(player, 0); c.update(1/60, player); }
  expect(c.kills).toBe(8);
  expect(c.goldEarned).toBe(0);
});

test('24/48/120/200 pooled enemies with all fusions preserve bounded resources', () => {
  for (const count of [24, 48, 120, 200]) {
    const { c } = fixture(count); c.encounters.beginWave(5); c.hp = 100000;
    for (const id of ['bubble-weapon', 'leaf-weapon', 'split-on-hit', 'chain', 'area', 'shattered-core'] as const) expect(c.grantUpgrade(id)).toBe(true);
    for (let i = 0; i < count; i++) {
      const angle = i/count*Math.PI*2;
      c.spawn('normal', Math.sin(angle)*7, Math.cos(angle)*7, 0);
    }
    for (let tick = 0; tick < (count >= 120 ? 180 : 600); tick++) {
      while (c.progression.awaitingChoice) c.chooseUpgrade(c.progression.offers[0]);
      c.party!.syncLeader(origin, 0); c.update(1/60, origin);
      expect(c.enemies.filter(e => e.active).length).toBeLessThanOrEqual(COMBAT_LIMITS.enemies);
      expect(c.projectiles.filter(p => p.active).length).toBeLessThanOrEqual(24);
      for (const shot of c.projectiles) if (shot.active) expect(shot.generation ?? 0).toBeLessThanOrEqual(1);
    }
    expect(c.kills).toBeGreaterThan(0); expect(c.childShots).toBeGreaterThan(0);
    expect(c.effects).toHaveLength(48); expect(c.orbs).toHaveLength(96);
  }
});

test('Boss summons never exceed the final-wave active cap', () => {
  const { c, run } = fixture(); run.waveIndex = 5; run.prepare(c, origin);
  const boss = c.encounters.boss!; boss.spawnTime = 0;
  for (let i = 0; i < 119; i++) c.spawn('normal', -20, -20, 0);
  expect(c.enemies.filter(e => e.active)).toHaveLength(120);
  c.encounters.bossState = 'summon-windup'; c.encounters.bossTime = 1;
  c.update(1/60, origin);
  expect(c.enemies.filter(e => e.active)).toHaveLength(120);
  expect(c.encounters.bossState).toBe('summon');
});
