import { test, expect } from '@playwright/test';
import { Combat, type WeaponSnapshot } from '../src/combat';
import { PartySystem } from '../src/party';
import { ATTACKS } from '../src/run-build';
import { bladeStats } from '../src/blade-weapons';

function fixture() {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset(['yanrong']);
  c.fusionEnabled = true; c.reset(); c.automaticSpawning = false;
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  return c;
}
function learn(c: Combat, id: 'thorn-wheel' | 'tidal-blade' | 'thunder-bud', level: number) {
  for (let i = 0; i < level; i++) expect(c.grantUpgrade(`${id}-weapon`)).toBe(true);
  const rules = c.runBuild.rules(id);
  return { attackId: id, damage: ATTACKS[id].damage * rules.damageMultiplier, range: 9, rules, fusions: [] } as WeaponSnapshot;
}

test('level-five thunder rewards its extra targets by clearing four 22-HP fodder in one chain', () => {
  const c = fixture(), attack = learn(c, 'thunder-bud', 5); attack.lightning = { level: 5 };
  const enemies = Array.from({ length: 6 }, (_, i) => c.spawn('normal', 3 + i, 0, 0)!);
  for (const e of enemies) e.hp = 22;
  c.thunder.cast(attack, enemies[0]); c.thunder.update(1);
  expect(enemies.filter(e => !e.active)).toHaveLength(4);
  expect(c.thunder.telemetry.hits).toBe(6);
});

test('level-five wheel clears a final-wave basic swarm unit on actual orbital contact', () => {
  const c = fixture(), attack = learn(c, 'thorn-wheel', 5);
  attack.blade = { level: 5, tempo: 1 }; attack.range = bladeStats('thorn-wheel', 5).radius;
  const enemy = c.spawn('normal', attack.range, 0, 0)!; enemy.hp = 22;
  c.blades.cast(attack); c.blades.update(.001);
  expect(enemy.active).toBe(false);
});

test('automatic tide aims through a row instead of an isolated closer target', () => {
  const c = fixture(); learn(c, 'tidal-blade', 1);
  for (const [x, z] of [[2, 2], [4, 0], [5.5, 0], [7, 0]]) c.spawn('normal', x, z, 0)!.hp = 10000;
  c.runBuild.attacks.find(a => a.attackId === 'tidal-blade')!.cooldown = 0;
  c.update(.001, { x: 0, z: 0 });
  const cast = c.blades.casts.find(a => a.active && a.id === 'tidal-blade')!;
  expect(cast.dx).toBeCloseTo(1); expect(cast.dz).toBeCloseTo(0);
});
