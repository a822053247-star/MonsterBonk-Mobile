import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import type { SkillId } from '../src/progression';
import type { BaseAttackId } from '../src/fusion';
import { COMBAT_CLARITY } from '../src/combat-clarity';

const origin = { x: 0, z: 0 };
function fixture(species: SpeciesId = 'yanrong') {
  const rolls: number[] = [], c = new Combat([], 32, () => rolls.shift() ?? .999);
  c.party = new PartySystem(); c.party.reset([species]); c.fusionEnabled = true; c.reset();
  const learn = (id: SkillId) => {
    const p = c.progression, candidates = p.skills.filter(s => p.ranks[s.id] < s.maxRank);
    const index = candidates.findIndex(s => s.id === id); expect(index).toBeGreaterThanOrEqual(0);
    for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + .1) / (i + 1));
    p.gainExperience(p.threshold - p.experience);
    expect(p.offers).toContain(id); expect(c.chooseUpgrade(id)).toBe(true);
  };
  const equipAll = () => {
    for (const id of ['spark', 'bubble', 'leaf'] as const) if (!c.runBuild.has(id)) learn(`${id}-weapon`);
  };
  const fire = (id: BaseAttackId) => {
    c.clearTransientEffects();
    for (const a of c.runBuild.attacks) a.cooldown = a.attackId === id ? 0 : 100;
    const target = c.spawn('tank', 5, 0, 0)!;
    c.update(.001, origin);
    const shot = c.projectiles.find(s => s.active && s.attackId === id)!;
    for (const a of c.runBuild.attacks) a.cooldown = 100;
    return { target, shot };
  };
  return { c, learn, equipAll, fire };
}

test('all three creatures acquire all weapons and five fusions through real upgrades', () => {
  for (const species of ['yanrong', 'bubblesalamander', 'sproutspike'] as const) {
    const f = fixture(species); f.equipAll();
    f.learn('split-on-hit'); f.learn('area'); f.learn('chain');
    expect(f.c.runBuild.attacks).toHaveLength(3);
    expect(f.c.runBuild.acquire('leaf')).toBe(false);
    expect(f.c.fusions.map(r => r.id).sort()).toEqual(['burst-seed', 'deep-bubble', 'chain-bubble', 'thorn-scatter', 'jump-thorn'].sort());
    for (const id of ['spark', 'bubble', 'leaf'] as const) {
      for (const s of f.c.projectiles) s.active = false;
      const { shot } = f.fire(id);
      expect(shot.species).toBe(species);
      expect(shot.fusionIds?.length).toBe(id === 'spark' ? 1 : 2);
    }
  }
});

test('upgrade pool filters irrelevant modifiers and acquisition keeps side cooldowns staggered', () => {
  const f = fixture();
  expect(f.c.progression.skills.some(s => s.id === 'area' || s.id === 'chain')).toBe(false);
  const maxLevel = f.c.progression.maxLevel;
  f.learn('leaf-weapon');
  expect(f.c.progression.skills.some(s => s.id === 'chain')).toBe(true);
  expect(f.c.progression.skills.some(s => s.id === 'area')).toBe(false);
  f.learn('bubble-weapon');
  expect(f.c.progression.skills.some(s => s.id === 'area')).toBe(true);
  // Full slots exclude all five unowned flame-sweep ranks as well as the unclaimed single-weapon badge.
  expect(f.c.progression.maxLevel).toBe(maxLevel - 6);
  expect(f.c.progression.skills.some(s => s.id === 'flame-sweep-weapon')).toBe(false);
  expect(f.c.runBuild.attacks.map(a => a.cooldown)).toEqual([0, .31, .62]);
  f.c.spawn('tank', 9, 0, 0);
  f.c.update(.001, origin);
  expect(f.c.runBuild.attacks.map(a => a.shotsFired)).toEqual([1, 0, 0]);
  f.c.update(.31, origin);
  expect(f.c.runBuild.attacks.map(a => a.shotsFired)).toEqual([1, 1, 0]);
  expect(f.c.runBuild.attacks[1].cooldown).toBeCloseTo(.54 * 1.6);
  f.c.update(.31, origin);
  expect(f.c.runBuild.attacks[2].shotsFired).toBe(1);
  expect(f.c.runBuild.attacks[2].cooldown).toBeCloseTo(.62 * 1.9);
});

test('water expansion and two chain hops coexist with one damage ledger', () => {
  const f = fixture(); f.equipAll(); f.learn('area'); f.learn('chain');
  const { target, shot } = f.fire('bubble');
  const splash = f.c.spawn('tank', 5, 1.8, 0)!;
  const next = f.c.spawn('tank', 8.1, 0, 0)!, last = f.c.spawn('tank', 11, 0, 0)!;
  const beyond = f.c.spawn('tank', 14, 0, 0)!;
  Object.assign(shot, { x: target.x, z: target.z }); f.c.update(.001, origin);
  expect(target.hp).toBe(85); expect(splash.hp).toBeCloseTo(93.25);
  expect(shot.hopTargetId).toBe(next.id);
  for (let i = 0; i < 80 && shot.active; i++) f.c.update(.01, origin);
  expect(shot.hitIds).toEqual([target.id, next.id, last.id]);
  expect(new Set(shot.damageIds).size).toBe(shot.damageIds!.length);
  expect(splash.hp).toBeCloseTo(93.25); expect(beyond.hp).toBe(100);
  expect(shot.active).toBe(false); expect(shot.bounces).toBe(0);
});

test('leaf scatters only once while its main shot chains, never recursively deriving children', () => {
  const f = fixture(); f.equipAll(); f.learn('split-on-hit'); f.learn('chain');
  const { target, shot } = f.fire('leaf');
  const next = f.c.spawn('tank', 7.5, 0, 0)!, last = f.c.spawn('tank', 10, 0, 0)!;
  Object.assign(shot, { x: target.x, z: target.z }); f.c.update(.001, origin);
  expect(f.c.childShots).toBe(3); expect(shot.hopTargetId).toBe(next.id);
  for (let i = 0; i < 80 && shot.active; i++) f.c.update(.01, origin);
  expect(shot.hitIds).toEqual([target.id, next.id, last.id]);
  expect(f.c.childShots).toBe(3);
  expect(f.c.projectiles.every(s => (s.generation ?? 0) <= 1)).toBe(true);
});

test('24-slot saturation preserves direct damage and main priority; death/restart clear all weapons and effects', () => {
  const f = fixture(); f.equipAll(); f.learn('split-on-hit'); f.learn('chain');
  const { target, shot } = f.fire('leaf');
  for (const s of f.c.projectiles) if (s !== shot) Object.assign(s, { active: true, x: -25, z: -25, vx: 0, vz: 0, life: 10, generation: 0, elemental: false, burst: false });
  Object.assign(shot, { x: target.x, z: target.z }); f.c.update(.001, origin);
  expect(target.hp).toBe(84); expect(f.c.childShots).toBe(0);
  expect(f.c.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);
  // Exactly one free slot: main takes it, both side weapons wait.
  for (const a of f.c.runBuild.attacks) a.cooldown = 0;
  const before = f.c.runBuild.attacks.map(a => a.shotsFired);
  f.c.update(COMBAT_CLARITY.volleyGap+.001, origin);
  expect(f.c.runBuild.attacks.map((a, i) => a.shotsFired - before[i])).toEqual([1, 0, 0]);
  f.c.hp = 0; const dead = JSON.stringify(f.c.inspect()); f.c.update(1, origin);
  expect(JSON.stringify(f.c.inspect())).toBe(dead);
  f.c.reset();
  expect(f.c.runBuild.attacks.map(a => a.attackId)).toEqual(['spark']);
  expect(f.c.fusions).toEqual([]); expect(f.c.projectiles.some(s => s.active)).toBe(false);
  expect(f.c.effects.some(e => e.active)).toBe(false);
});
