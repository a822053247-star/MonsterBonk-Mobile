import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem, calculateCreatureStats } from '../src/party';

const STEP = 1 / 60;
function fixture() {
  const party = new PartySystem();
  party.reset(['yanrong', 'bubblesalamander', 'sproutspike']);
  party.placeCompanions([], 32.3);
  const combat = new Combat();
  combat.party = party;
  return { party, combat };
}

test('formal roster starts with one, permits duplicates, caps three and supports future four', () => {
  const party = new PartySystem();
  expect(party.members).toHaveLength(1);
  expect(party.add('yanrong')).toBeDefined();
  expect(party.add('yanrong')).toBeDefined();
  expect(party.add('yanrong')).toBeUndefined();
  expect(() => party.reset([])).toThrow();
  expect(() => party.reset(['yanrong', 'yanrong', 'yanrong', 'yanrong'])).toThrow();
  const future = new PartySystem(4);
  future.reset(['yanrong', 'yanrong', 'yanrong', 'yanrong']);
  expect(future.members).toHaveLength(4);
});

test('companions follow a moving leader around cover and remain separate within the boundary', () => {
  const { party } = fixture();
  const obstacles = [{ x: 0, z: -3, radius: 1 }, { x: 5, z: -2, radius: 1.2 }];
  for (let tick = 0; tick < 1800; tick++) {
    const t = tick * STEP;
    const leader = { x: Math.sin(t * 0.2) * 24, z: Math.cos(t * 0.2) * 3 };
    party.syncLeader(leader, Math.PI / 2);
    party.follow(STEP, obstacles, 32.3);
    expect(party.leader.x).toBe(leader.x);
    for (const member of party.members.slice(1)) {
      expect(Math.hypot(member.x - leader.x, member.z - leader.z)).toBeLessThan(7.1);
      expect(Math.hypot(member.x - leader.x, member.z - leader.z)).toBeGreaterThan(1.1);
      expect(Math.hypot(member.x, member.z)).toBeLessThanOrEqual(32.3);
      for (const obstacle of obstacles) expect(Math.hypot(member.x - obstacle.x, member.z - obstacle.z)).toBeGreaterThanOrEqual(obstacle.radius + 0.47);
    }
    const a = party.members[1], b = party.members[2];
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.95);
  }
  // Simulate losing the leader across cover: bounded safe recovery, no interpolated streak.
  party.syncLeader({ x: 31.5, z: 0 }, 0);
  party.follow(STEP, obstacles, 32.3);
  for (const member of party.members.slice(1)) {
    expect(Math.hypot(member.x - 31.5, member.z)).toBeLessThan(5);
    expect(member.previousX).toBe(member.x);
    expect(member.previousZ).toBe(member.z);
  }
});

test('three independent emitters use their own origin, target and cooldown without a duplicate player shot', () => {
  const { party, combat } = fixture();
  combat.spawn('tank', 0, 6, 0);
  combat.update(STEP, party.leader);
  expect(combat.shotsFired).toBe(3);
  for (const member of party.members) {
    const shot = combat.projectiles.find(p => p.active && p.sourceId === member.id)!;
    expect(shot).toBeDefined();
    expect(shot.previousX).toBe(member.x);
    expect(shot.previousZ).toBe(member.z);
    expect(member.targetId).toBeGreaterThan(0);
    expect(member.shotsFired).toBe(1);
  }
  expect(new Set(party.members.map(m => m.attackCooldown)).size).toBe(3);
  for (let tick = 0; tick < 60; tick++) combat.update(STEP, party.leader);
  expect(party.members.every(m => m.shotsFired >= 2)).toBe(true);
  expect(combat.hits).toBeGreaterThan(0);
  expect(combat.projectiles.length).toBe(COMBAT_LIMITS.projectiles);
});

test('cover and range are checked from each member rather than from the leader', () => {
  const { party, combat } = fixture();
  Object.assign(party.members[1], { x: 20, z: 0 });
  const far = combat.spawn('tank', 23, 0, 0)!;
  const near = combat.spawn('tank', 0, 6, 0)!;
  combat.update(STEP, party.leader);
  expect(party.leader.targetId).toBe(near.id);
  expect(party.members[1].targetId).toBe(far.id);
  const covered = new Combat([{ x: 2, z: 0, radius: 1 }]);
  covered.party = party;
  party.reset(['yanrong', 'bubblesalamander', 'sproutspike']);
  covered.spawn('tank', 5, 0, 0);
  covered.update(STEP, party.leader);
  expect(covered.shotsFired).toBe(0);
});

test('only leader contact hurts shared HP, only leader collects XP, death freezes every emitter', () => {
  const { party, combat } = fixture();
  const companion = party.members[1];
  combat.spawn('tank', companion.x, companion.z, 0);
  combat.update(STEP, party.leader);
  expect(combat.hp).toBe(100);
  // A drop beside a distant partner is not collected remotely.
  Object.assign(companion, { x: 15, z: 0 });
  Object.assign(combat.orbs[0], { active: true, x: 15, z: 0, value: 3 });
  combat.update(STEP, party.leader);
  expect(combat.xp).toBe(0);
  combat.spawn('tank', 0, 0, 0);
  combat.hp = 1; combat.invulnerability = 0;
  combat.update(STEP, party.leader);
  expect(combat.hp).toBe(0);
  const frozen = { combat: combat.inspect(), party: party.inspect() };
  for (let i = 0; i < 120; i++) combat.update(STEP, party.leader);
  expect({ combat: combat.inspect(), party: party.inspect() }).toEqual(frozen);
  combat.reset();
  expect(combat.hp).toBe(100);
  expect(party.members).toHaveLength(3);
  expect(party.members.every(m => m.attackCooldown === 0 && m.shotsFired === 0 && m.targetId === 0)).toBe(true);
  expect(combat.inspect()).toMatchObject({ projectiles: 0, kills: 0, orbs: [], enemies: [] });
});

test('existing upgrade choice freezes all attacks and central stats apply after picking', () => {
  const { party, combat } = fixture();
  combat.spawn('tank', 0, 6, 0);
  combat.update(STEP, party.leader);
  combat.progression.gainExperience(8);
  const frozen = party.inspect();
  combat.update(1, party.leader);
  expect(party.inspect()).toEqual(frozen);
  expect(combat.chooseUpgrade(combat.progression.offers[0])).toBe(true);
  for (const member of party.members) expect(calculateCreatureStats(member, combat.stats).range).toBeGreaterThanOrEqual(10.5);
});
