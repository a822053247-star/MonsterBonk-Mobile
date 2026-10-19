import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import type { SkillId } from '../src/progression';

const origin = { x: 0, z: 0 }, step = 1 / 60;
function fixture() {
  const rolls: number[] = [], combat = new Combat([], 32.3, () => rolls.shift() ?? .999);
  combat.party = new PartySystem(); combat.fusionEnabled = true; combat.reset();
  const learn = (id: SkillId) => {
    const p = combat.progression, candidates = p.skills.filter(s => p.ranks[s.id] < s.maxRank);
    const index = candidates.findIndex(s => s.id === id);
    for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + .1) / (i + 1));
    p.gainExperience(p.threshold - p.experience);
    expect(p.offers).toContain(id); expect(combat.chooseUpgrade(id)).toBe(true);
  };
  return { combat, learn };
}

test('stage A: real upgrade equips a unique bubble, independent cooldowns and shared haste', () => {
  const { combat, learn } = fixture(); learn('bubble-weapon');
  expect(combat.party!.members.map(m => m.species)).toEqual(['yanrong']);
  expect(combat.runBuild.acquire('bubble')).toBe(false);
  expect(combat.runBuild.attacks.map(a => a.attackId)).toEqual(['spark', 'bubble']);
  combat.spawn('tank', 8, 0, 0);
  combat.update(step, origin);
  expect(combat.runBuild.attacks.map(a => a.shotsFired)).toEqual([1, 0]);
  for (let i = 0; i < 20; i++) combat.update(step, origin);
  expect(combat.runBuild.attacks.map(a => a.shotsFired)).toEqual([1, 1]);
  expect(combat.projectiles.filter(s => s.active).map(s => s.attackId)).toContain('bubble');
  const before = combat.runBuild.attacks.map(a => a.cooldown);
  learn('haste');
  combat.runBuild.attacks.forEach((a, i) => expect(a.cooldown).toBeCloseTo(before[i] / 1.15));
  expect(combat.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);
});

test('stage A: Yanrong bubble damages and slows while spark retains burst seed', () => {
  const { combat, learn } = fixture(); learn('bubble-weapon'); learn('split-on-hit');
  const enemy = combat.spawn('tank', 6, 0, 0)!;
  for (let i = 0; i < 20; i++) combat.update(step, origin);
  const bubble = combat.projectiles.find(s => s.active && s.attackId === 'bubble')!;
  expect(bubble.species).toBe('yanrong'); expect(bubble.burst).toBe(false);
  expect(bubble.fusionIds).toEqual([]);
  for (const shot of combat.projectiles) if (shot !== bubble) shot.active = false;
  for (const weapon of combat.runBuild.attacks) weapon.cooldown = 10;
  Object.assign(bubble, { x: enemy.x - 1.2, z: enemy.z, vx: 18, vz: 0 });
  const hp = enemy.hp;
  combat.update(.05, origin);
  expect(enemy.hp).toBeCloseTo(hp - 15); expect(enemy.slowTime).toBe(1.5);
  enemy.knockX = enemy.knockZ = 0;
  const x = enemy.x; combat.update(.1, origin);
  expect(x - enemy.x).toBeCloseTo(.75 * .7 * .1);
  expect(combat.fusions.map(f => f.id)).toEqual(['burst-seed']);
});

test('stage A: frozen upgrades/death and restart clear build; legacy party has no weapon card', () => {
  const { combat, learn } = fixture(); learn('bubble-weapon');
  combat.progression.gainExperience(combat.progression.threshold);
  const snapshot = JSON.stringify(combat.inspect()); combat.update(1, origin);
  expect(JSON.stringify(combat.inspect())).toBe(snapshot);
  combat.hp = 0; const clocks = combat.runBuild.attacks.map(a => a.cooldown);
  combat.update(1, origin); expect(combat.runBuild.attacks.map(a => a.cooldown)).toEqual(clocks);
  combat.reset(); expect(combat.runBuild.attacks.map(a => a.attackId)).toEqual(['spark']);
  expect(combat.progression.ranks['bubble-weapon']).toBe(0);
  combat.fusionEnabled = false;
  combat.party!.reset(['yanrong', 'bubblesalamander', 'sproutspike']); combat.reset();
  expect(combat.progression.skills.some(s => s.id === 'bubble-weapon')).toBe(false);
  combat.spawn('tank', 8, 0, 0); combat.update(step, origin);
  expect(combat.party!.members.every(m => m.shotsFired > 0)).toBe(true);
});
