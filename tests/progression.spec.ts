import { test, expect } from '@playwright/test';
import { Combat, WEAPON } from '../src/combat';
import { Progression, SKILLS, MAX_LEVEL, emptyRanks, calculateStats, experienceThreshold, upgradePreview, type SkillId } from '../src/progression';

const STEP = 1 / 60;
function build(obstacles: { x: number; z: number; radius: number }[] = []) {
  const rolls: number[] = [];
  const combat = new Combat(obstacles, 32.3, () => rolls.shift() ?? 0.999);
  const learn = (id: SkillId) => {
    const progression = combat.progression;
    const candidates = SKILLS.filter((skill) => progression.ranks[skill.id] < skill.maxRank);
    const index = candidates.findIndex((skill) => skill.id === id);
    for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + 0.1) / (i + 1));
    progression.gainExperience(progression.threshold - progression.experience);
    expect(progression.offers).toContain(id);
    expect(combat.chooseUpgrade(id)).toBe(true);
  };
  return { combat, learn };
}
const advance = (combat: Combat, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) combat.update(STEP, { x: 0, z: 0 });
};

test('exact XP boundaries and overflow preserve every earned level and choice', () => {
  const progression = new Progression(() => 0.9);
  expect(progression.gainExperience(7)).toBe(0);
  expect(progression.level).toBe(1);
  expect(progression.gainExperience(1)).toBe(1);
  expect(progression.inspect()).toMatchObject({ level: 2, experience: 0, totalExperience: 8, pendingChoices: 1 });
  expect(progression.offers).toHaveLength(3);
  expect(progression.pick(progression.offers[0])).toBe(true);
  expect(progression.awaitingChoice).toBe(false);
  expect(progression.gainExperience(12 + 16 + 5)).toBe(2);
  expect(progression.inspect()).toMatchObject({ level: 4, experience: 5, totalExperience: 41, pendingChoices: 2, choiceLevel: 3 });
  progression.pick(progression.offers[0]);
  expect(progression.pendingChoices).toBe(1);
  expect(progression.choiceLevel).toBe(4);
  progression.pick(progression.offers[0]);
  expect(progression.experience).toBe(5);
});

test('all cards are unique, below their cap and selectable; max level never deadlocks', () => {
  const progression = new Progression(() => 0.75);
  progression.gainExperience(1_000_000);
  expect(progression.level).toBe(MAX_LEVEL);
  expect(progression.pendingChoices).toBe(MAX_LEVEL - 1);
  let sawSmallOffer = false, choices = 0;
  while (progression.awaitingChoice) {
    const offers = [...progression.offers];
    const eligible = SKILLS.filter((skill) => progression.ranks[skill.id] < skill.maxRank);
    expect(offers.length).toBe(Math.min(3, eligible.length));
    expect(new Set(offers).size).toBe(offers.length);
    for (const id of offers) expect(eligible.some((skill) => skill.id === id)).toBe(true);
    if (offers.length < 3) sawSmallOffer = true;
    expect(progression.pick(offers[0])).toBe(true);
    choices++;
    expect(choices).toBeLessThan(MAX_LEVEL);
  }
  expect(sawSmallOffer).toBe(true);
  for (const skill of SKILLS) expect(progression.ranks[skill.id]).toBe(skill.maxRank);
  expect(progression.offers).toEqual([]);
  expect(progression.pick('damage')).toBe(false);
  expect(progression.gainExperience(50)).toBe(0);
  expect(progression.experience).toBe(0);
  expect(progression.threshold).toBe(Infinity);
  expect(progression.totalExperience).toBe(1_000_050);
});

test('invalid XP, stale choices and unoffered skills do not change progression', () => {
  const progression = new Progression(() => 0.99);
  const initial = progression.inspect();
  for (const amount of [NaN, Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1]) expect(progression.gainExperience(amount)).toBe(0);
  expect(progression.inspect()).toEqual(initial);
  expect(progression.pick('damage')).toBe(false);
  progression.gainExperience(8);
  const unoffered = SKILLS.find((skill) => !progression.offers.includes(skill.id))!.id;
  const offered = progression.inspect();
  expect(progression.pick(unoffered)).toBe(false);
  expect(progression.inspect()).toEqual(offered);
  progression.pick(progression.offers[0]);
  const chosen = progression.inspect();
  expect(progression.pick('damage')).toBe(false);
  expect(progression.inspect()).toEqual(chosen);
});

test('data-driven stacks use additive base bonuses and independent spell ranks', () => {
  const ranks = { ...emptyRanks(), damage: 2, haste: 3, multishot: 2, vitality: 4, movement: 3, range: 2, orbit: 2, shockwave: 1 };
  const stats = calculateStats(ranks);
  expect(stats).toMatchObject({ damageMultiplier: 1.4, attackRateMultiplier: 1.45, projectileCount: 3, maxHp: 180, moveMultiplier: 1.3, rangeMultiplier: 1.3, orbitCount: 2, orbitDamage: 18, shockDamage: 24, shockInterval: 4.5 });
  expect(Object.isFrozen(stats)).toBe(true);
  for (const skill of SKILLS) {
    expect(skill.maxRank).toBeGreaterThan(0);
    if (skill.effect.type === 'spell') expect(skill.effect.levels.length).toBe(skill.maxRank);
    expect(upgradePreview(skill, emptyRanks())).toBeTruthy();
    expect(upgradePreview(skill, { ...emptyRanks(), [skill.id]: skill.maxRank })).toBeUndefined();
  }
  expect(experienceThreshold(2)).toBeGreaterThan(experienceThreshold(1));
});

test('damage, multishot and range upgrades affect real projectiles and pool limits', () => {
  const { combat, learn } = build();
  for (let i = 0; i < 5; i++) { learn('damage'); learn('range'); learn('haste'); }
  for (let i = 0; i < 3; i++) learn('multishot');
  combat.spawn('tank', 17, 0, 0);
  combat.update(STEP, { x: 0, z: 0 });
  const shots = combat.projectiles.filter((shot) => shot.active);
  expect(shots).toHaveLength(4);
  expect(combat.shotsFired).toBe(4);
  expect(new Set(shots.map((shot) => shot.vz)).size).toBe(4);
  expect(shots.some((shot) => Math.abs(shot.vz) < 1e-9)).toBe(true);
  for (const shot of shots) {
    expect(shot.damage).toBeCloseTo(36);
    expect(shot.life * WEAPON.speed).toBeGreaterThan(17);
  }
  expect(combat.findTarget({ x: 0, z: 0 })?.kind).toBe('tank');
  expect(combat.projectiles.length).toBe(24);
});

test('haste increases actual volleys per second; vitality increases max HP and heals', () => {
  const baseline = build(), faster = build();
  for (let i = 0; i < 5; i++) faster.learn('haste');
  for (const { combat } of [baseline, faster]) { combat.spawn('tank', 7, 0, 0)!.hp = 100_000; advance(combat, 2); }
  expect(faster.combat.shotsFired).toBeGreaterThan(baseline.combat.shotsFired * 1.5);
  const health = build();
  health.combat.hp = 40;
  health.learn('vitality');
  expect(health.combat.maxHp).toBe(120);
  expect(health.combat.hp).toBe(60);
  health.learn('damage');
  expect(health.combat.hp).toBe(60);
  for (let i = 0; i < 4; i++) health.learn('vitality');
  expect(health.combat.maxHp).toBe(200);
  expect(health.combat.hp).toBe(140);
});

test('orbit damages enemies, uses seconds-based hit immunity and resets cleanly', () => {
  const { combat, learn } = build([{ x: 1, z: 0, radius: 0.4 }]);
  learn('orbit');
  const enemy = combat.spawn('tank', 2.2, 0, 0)!;
  combat.update(STEP, { x: 0, z: 0 });
  expect(enemy.hp).toBe(88);
  expect(enemy.orbitCooldown).toBeGreaterThan(0.5);
  advance(combat, 0.2);
  expect(enemy.hp).toBe(88);
  expect(combat.orbitAngle).toBeGreaterThan(0);
  combat.reset();
  expect(combat.stats.orbitCount).toBe(0);
  expect(combat.orbitAngle).toBe(0);
});

test('shockwave expands, hits each enemy once, repeats and freezes throughout upgrade choice', () => {
  const { combat, learn } = build([{ x: 1.5, z: 0, radius: 0.4 }]);
  learn('shockwave');
  const near = combat.spawn('tank', 3, 0, 0)!;
  const far = combat.spawn('tank', 7, 0, 0)!;
  advance(combat, 0.4);
  expect(near.hp).toBe(76);
  expect(far.hp).toBe(100);
  expect(combat.shockwaves.some((wave) => wave.active)).toBe(true);
  combat.progression.gainExperience(combat.progression.threshold);
  const paused = combat.inspect(), elapsed = combat.elapsed;
  advance(combat, 5);
  expect(combat.inspect()).toEqual(paused);
  expect(combat.elapsed).toBe(elapsed);
  combat.chooseUpgrade(combat.progression.offers[0]);
  advance(combat, 0.3);
  expect(near.hp).toBe(76);
  // Use a separate empty arena for cadence: killed enemy pool slots can be reused.
  const repeating = build();
  repeating.learn('shockwave');
  advance(repeating.combat, 0.7);
  expect(repeating.combat.shockwaves.every((wave) => !wave.active)).toBe(true);
  advance(repeating.combat, 3.9);
  expect(repeating.combat.shockwaves.some((wave) => wave.active && wave.age < 0.2)).toBe(true);
});

test('reset clears level, accumulated XP, choices, stats and both learned skills', () => {
  const { combat, learn } = build();
  for (const id of ['damage', 'vitality', 'movement', 'orbit', 'shockwave'] as const) learn(id);
  advance(combat, 0.1);
  combat.progression.gainExperience(500);
  combat.reset();
  expect(combat.progression.inspect()).toMatchObject({ level: 1, totalExperience: 0, experience: 0, pendingChoices: 0, offers: [], ranks: emptyRanks() });
  expect(combat.stats).toEqual(calculateStats(emptyRanks()));
  expect(combat.hp).toBe(100);
  expect(combat.shockwaves.every((wave) => !wave.active)).toBe(true);
});
