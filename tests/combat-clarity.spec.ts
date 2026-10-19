import { test, expect } from '@playwright/test';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { readableEffects } from '../src/combat-clarity';

test('even a single multishot weapon spaces its shots over time', () => {
  const c = new Combat([], 32, () => .999);
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  c.grantUpgrade('multishot'); c.spawn('tank', 9, 0, 0)!.hp = 100000;
  c.update(.001, { x: 0, z: 0 }); expect(c.shotsFired).toBe(1);
  c.update(.08, { x: 0, z: 0 }); expect(c.shotsFired).toBe(2);
});

test('three ready weapons and multishot emit distinguishable bullets instead of same-frame stacks', () => {
  const c = new Combat([], 32, () => .999);
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  for (const id of ['bubble-weapon', 'leaf-weapon', 'multishot', 'multishot', 'multishot', 'haste', 'haste', 'haste', 'haste', 'haste'] as const) expect(c.grantUpgrade(id)).toBe(true);
  c.spawn('tank', 9, 0, 0)!.hp = 100000;
  const emitted: number[] = [];
  for (let tick = 0; tick < 480; tick++) {
    const before = c.shotsFired;
    c.update(1 / 120, { x: 0, z: 0 });
    const count = c.shotsFired - before;
    expect(count).toBeLessThanOrEqual(1);
    if (count) emitted.push(tick / 120);
  }
  expect(emitted.length).toBeGreaterThan(6);
  expect(c.runBuild.attacks.every(a => a.shotsFired > 0)).toBe(true);
  for (let i = 1; i < emitted.length; i++) expect(emitted[i] - emitted[i - 1]).toBeGreaterThanOrEqual(.07);
});

test('overlapping impact visuals keep the major explosion and leave combat state untouched', () => {
  const c = new Combat();
  for (const [i, kind] of (['hit', 'water', 'thorn', 'burst'] as const).entries()) Object.assign(c.effects[i], { active: true, x: 5, z: 0, time: .2, duration: .4, kind });
  const before = JSON.stringify(c.inspect());
  expect(readableEffects(c.effects).map(e => e.kind)).toEqual(['burst']);
  expect(JSON.stringify(c.inspect())).toBe(before);
});

test('pause/upgrade freezes a partially emitted volley and wave cleanup discards it', () => {
  const c = new Combat([], 32, () => .999);
  c.party = new PartySystem(); c.fusionEnabled = true; c.automaticSpawning = false; c.reset();
  c.grantUpgrade('multishot'); c.spawn('tank', 9, 0, 0)!.hp = 10000;
  c.update(.001, { x: 0, z: 0 }); expect(c.inspect().firing.remaining).toBe(1);
  c.progression.gainExperience(8);
  const before = JSON.stringify(c.inspect()); c.update(1, { x: 0, z: 0 });
  expect(JSON.stringify(c.inspect())).toBe(before);
  c.clearWave(); expect(c.inspect().firing.remaining).toBe(0);
  c.reset(); expect(c.inspect().firing.gap).toBe(0);
});
