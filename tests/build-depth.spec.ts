import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem } from '../src/party';
import type { BaseAttackId } from '../src/fusion';
import type { SkillId } from '../src/progression';

const origin = { x: 0, z: 0 };
function fixture() {
  const rolls: number[] = [], c = new Combat([], 32, () => rolls.shift() ?? .999);
  c.party = new PartySystem(); c.fusionEnabled = true; c.reset();
  const learn = (id: SkillId) => {
    const p = c.progression, candidates = p.skills.filter(s => p.ranks[s.id] < s.maxRank);
    const index = candidates.findIndex(s => s.id === id); expect(index).toBeGreaterThanOrEqual(0);
    for (let i = candidates.length - 1; i > 0; i--) rolls.push(((i === index ? 0 : i) + .1) / (i + 1));
    rolls.push(.01); // Allow the rare slot after the deterministic shuffle.
    p.gainExperience(p.threshold - p.experience);
    expect(p.offers).toContain(id); expect(c.chooseUpgrade(id)).toBe(true);
  };
  const fire = (id: BaseAttackId = 'spark') => {
    for (const s of c.projectiles) s.active = false;
    for (const e of c.enemies) e.active = false;
    for (const a of c.runBuild.attacks) a.cooldown = a.attackId === id ? 0 : 100;
    const target = c.spawn('tank', 6, 0, 0)!;
    c.update(.001, origin);
    let shot = c.projectiles.find(s => s.active && s.attackId === id);
    for (let i = 0; !shot && i < 40; i++) { c.update(.01, origin); shot = c.projectiles.find(s => s.active && s.attackId === id); }
    expect(shot).toBeTruthy();
    for (const a of c.runBuild.attacks) a.cooldown = 100;
    return { target, shot: shot! };
  };
  const impact = (shot: Combat['projectiles'][number], target: Combat['enemies'][number]) => {
    Object.assign(shot, { x: target.x, z: target.z }); c.update(.001, origin);
  };
  return { c, learn, fire, impact };
}

test('weapon upgrades use real cards, cap at five and do not duplicate slots', () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) f.learn('spark-weapon');
  expect(f.c.runBuild.attacks.map(a => a.level)).toEqual([5]);
  expect(f.c.progression.ranks['spark-weapon']).toBe(5);
  expect(f.c.progression.skills.filter(s => f.c.progression.ranks[s.id] < s.maxRank).some(s => s.id === 'spark-weapon')).toBe(false);
  const { shot } = f.fire(); expect(shot.damage).toBeCloseTo(18 * 1.8);
  f.learn('bubble-weapon'); f.learn('bubble-weapon');
  expect(f.c.runBuild.attacks.map(a => a.level)).toEqual([5, 2]);
});

test('single-weapon specialization loses its bonus when a side weapon is equipped', () => {
  const f = fixture(); f.learn('specialist-badge');
  const solo = f.fire(); expect(solo.shot.damage).toBeCloseTo(28.8);
  f.learn('bubble-weapon');
  expect(solo.shot.damage).toBeCloseTo(28.8); // In-flight volleys retain their snapshot.
  expect(f.fire().shot.damage).toBe(18);
  expect(f.c.runBuild.relics).toEqual(['specialist-badge']);
});

test('overload and berserk expand real splash while slowing fire, and evolution is exclusive', () => {
  const f = fixture(); f.learn('split-on-hit');
  const clock = f.c.runBuild.attacks[0]; clock.cooldown = .4;
  f.learn('overload-core'); expect(clock.cooldown).toBeCloseTo(.48);
  f.learn('berserk-route'); expect(clock.cooldown).toBeCloseTo(.6);
  expect(f.c.progression.skills.some(s => s.id === 'pursuit-route')).toBe(false);
  expect(f.c.runBuild.evolve('pursuit-route')).toBe(false);
  const { shot, target } = f.fire(), neighbor = f.c.spawn('tank', 6, 2.8, 0)!;
  f.impact(shot, target);
  expect(neighbor.hp).toBeCloseTo(94.6);
  expect(f.c.effects.find(e => e.active && e.kind === 'burst')!.radius).toBeCloseTo(1.35 * 1.5 * 1.35);
});

test('hunter and shattered core change child motion/count with real damage costs and bounded generation', () => {
  const f = fixture(); f.learn('split-on-hit'); f.learn('hunter-eye'); f.learn('shattered-core');
  const { shot, target } = f.fire(); f.impact(shot, target);
  const children = f.c.projectiles.filter(s => s.active && s.generation === 1);
  expect(children).toHaveLength(3);
  expect(children.every(s => s.homing && !s.burst && !s.scatter)).toBe(true);
  expect(children[0].damage).toBeCloseTo(18 * .35 * .8 * .75);
  const child = children[1], speed = Math.hypot(child.vx, child.vz), before = child.vz;
  f.c.spawn('tank', child.x + 1, child.z + 2, 0); f.c.update(.05, origin);
  expect(child.vz).not.toBe(before); expect(Math.hypot(child.vx, child.vz)).toBeCloseTo(speed);
  expect(f.c.childShots).toBe(3); expect(f.c.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);
});

test('pursuit route creates homing fire children at the cost of explosion radius', () => {
  const f = fixture(); f.learn('split-on-hit'); f.learn('pursuit-route');
  const { shot, target } = f.fire(); f.impact(shot, target);
  expect(f.c.projectiles.filter(s => s.active && s.generation === 1).every(s => s.homing)).toBe(true);
  expect(f.c.effects.find(e => e.active && e.kind === 'burst')!.radius).toBeCloseTo(1.35 * .75);
  expect(f.c.progression.skills.some(s => s.id === 'berserk-route')).toBe(false);
});

test('tidal pearl extends water control and reduces direct hits without reducing splash', () => {
  const f = fixture(); f.learn('bubble-weapon'); f.learn('area'); f.learn('tidal-pearl');
  const { shot, target } = f.fire('bubble'), neighbor = f.c.spawn('tank', 6, 2, 0)!;
  f.impact(shot, target);
  expect(target.hp).toBeCloseTo(100 - 15 * .85); expect(target.slowTime).toBeCloseTo(2.4);
  expect(neighbor.hp).toBeCloseTo(100 - 15 * .45); expect(neighbor.slowTime).toBeCloseTo(2.4);
});

test('echo extends leaf chain reach and increases damage decay at each extra hop', () => {
  const f = fixture(); f.learn('leaf-weapon'); f.learn('chain'); f.learn('echo-rune');
  const { shot, target } = f.fire('leaf');
  const second = f.c.spawn('tank', 10.2, 0, 0)!, third = f.c.spawn('tank', 14.4, 0, 0)!;
  f.impact(shot, target); expect(shot.hopTargetId).toBe(second.id);
  expect(shot.damage).toBeCloseTo(16 * .7 * .7);
  for (let i = 0; i < 80 && shot.active; i++) f.c.update(.01, origin);
  expect(shot.hitIds).toEqual([target.id, second.id, third.id]);
  expect(third.hp).toBeCloseTo(100 - 16 * .7 * .7 ** 2);
});

test('reset clears levels/relics/evolution; legacy card pools never receive build rewards', () => {
  const f = fixture(); f.learn('spark-weapon'); f.learn('split-on-hit'); f.learn('pursuit-route'); f.learn('shattered-core');
  f.c.reset();
  expect(f.c.runBuild.relics).toEqual([]); expect(f.c.runBuild.evolution).toBeUndefined();
  expect(f.c.runBuild.attacks.map(a => a.level)).toEqual([1]);
  f.c.fusionEnabled = false; f.c.reset();
  expect(f.c.progression.skills).toHaveLength(8);
  expect(f.c.progression.skills.some(s => s.category || s.id.endsWith('-weapon'))).toBe(false);
});

test('large experience queues keep rare offers bounded and finish without an empty upgrade trap', () => {
  let seed = 29;
  const c = new Combat([], 32, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
  c.party = new PartySystem(); c.fusionEnabled = true; c.reset();
  c.progression.gainExperience(1_000_000);
  let choices = 0, rareOffers = 0;
  while (c.progression.awaitingChoice && choices++ < 100) {
    const p = c.progression;
    expect(p.offers.length).toBeGreaterThan(0);
    const rare = p.offers.filter(id => p.skills.find(s => s.id === id)?.category);
    expect(rare.length).toBeLessThanOrEqual(1); rareOffers += rare.length;
    for (const id of p.offers) expect(p.ranks[id]).toBeLessThan(p.skills.find(s => s.id === id)!.maxRank);
    expect(c.chooseUpgrade(p.offers[0])).toBe(true);
  }
  expect(rareOffers).toBeGreaterThan(0);
  expect(choices).toBeLessThan(100); expect(c.progression.awaitingChoice).toBe(false);
  expect(c.runBuild.attacks.every(a => a.level === 5)).toBe(true);
});
