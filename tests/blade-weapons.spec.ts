import { test, expect } from '@playwright/test';
import { Combat, type WeaponSnapshot } from '../src/combat';
import { PartySystem } from '../src/party';
import { ATTACKS } from '../src/run-build';
import { bladeStats, type BladeId } from '../src/blade-weapons';
import { weaponCapabilities } from '../src/content/weapon-traits';
import { matchesTarget } from '../src/content/relic-effects';

function fixture() {
  const c = new Combat([], 100, () => .5);
  c.party = new PartySystem(); c.party.reset(['yanrong']); c.fusionEnabled = true; c.reset();
  c.automaticSpawning = false;
  for (const a of c.runBuild.attacks) a.cooldown = 10000;
  return c;
}
function snapshot(c: Combat, id: BladeId, level = 1): WeaponSnapshot {
  const rules = c.runBuild.rules(id), stats = bladeStats(id, level);
  return { attackId: id, damage: ATTACKS[id].damage, range: id === 'thorn-wheel' ? stats.radius : stats.range,
    rules, fusions: [], blade: { level, tempo: 1 } };
}
function target(c: Combat, x: number, z = 0) {
  const e = c.spawn('normal', x, z, 0)!; e.hp = 10000; return e;
}

test('both weapons use three slots, five levels, upgrade cards and correct elemental modifiers', () => {
  const c = fixture();
  for (const id of ['thorn-wheel', 'tidal-blade'] as const) {
    expect(c.grantUpgrade(`${id}-weapon`)).toBe(true);
    for (let i = 1; i < 5; i++) expect(c.grantUpgrade(`${id}-weapon`)).toBe(true);
    expect(c.grantUpgrade(`${id}-weapon`)).toBe(false);
  }
  expect(c.runBuild.attacks).toHaveLength(3);
  expect(c.grantUpgrade('bubble-weapon')).toBe(false);
  expect(bladeStats('thorn-wheel', 5)).toMatchObject({ count: 3, push: true, expand: true });
  expect(bladeStats('tidal-blade', 5).range).toBeGreaterThan(bladeStats('tidal-blade', 1).range);
  expect(weaponCapabilities('thorn-wheel').tags).toEqual(['grass', 'melee']);
  expect(matchesTarget('water-weapon', 'tidal-blade', c.runBuild.relicContext)).toBe(true);
  expect(matchesTarget('fire-weapon', 'tidal-blade', c.runBuild.relicContext)).toBe(false);
  expect(matchesTarget('grass-weapon', 'thorn-wheel', c.runBuild.relicContext)).toBe(true);
  expect(c.progression.skills.find(s => s.id === 'thorn-wheel-weapon')!.benefit).toContain('周期扩圈');
});

test('wheel cuts only its orbit, caps repeat hits and cannot damage through cover', () => {
  const c = fixture(), rim = target(c, 2.4), center = target(c, 0), far = target(c, 7);
  expect(c.blades.cast(snapshot(c, 'thorn-wheel'))).toBe(true);
  c.blades.update(.01);
  expect(rim.hp).toBe(9986); expect(center.hp).toBe(10000); expect(far.hp).toBe(10000);
  c.blades.update(.2); expect(rim.hp).toBe(9986);
  c.blades.clear(); c.obstacles = [{ x: 1.2, z: 0, radius: .5 }];
  c.blades.cast(snapshot(c, 'thorn-wheel')); c.blades.update(.01);
  expect(rim.hp).toBe(9986);
});

test('tide pierces a group, hits once per direction and applies water status', () => {
  const c = fixture(), a = target(c, 3), b = target(c, 5), outside = target(c, 4, 3);
  c.blades.cast(snapshot(c, 'tidal-blade'), { x: 8, z: 0 });
  c.blades.update(.55);
  expect(a.hp).toBe(9974); expect(b.hp).toBe(9974); expect(outside.hp).toBe(10000);
  expect(a.slowTime).toBeGreaterThan(0); expect(a.wetTime).toBeGreaterThan(0);
  c.blades.update(.8);
  expect(a.hp).toBe(9948); expect(b.hp).toBe(9948);
  expect(c.blades.inspect().active).toHaveLength(0);
  expect(c.blades.telemetry.returns).toBe(1);
  expect(c.blades.telemetry.outboundHits).toBe(2); expect(c.blades.telemetry.returnHits).toBe(2);
});

test('return path follows a moving player and clears on death/reset', () => {
  const c = fixture(), returnTarget = target(c, 4, 2);
  c.blades.cast(snapshot(c, 'tidal-blade'), { x: 8, z: 0 });
  c.blades.update(8 / 12);
  expect(returnTarget.hp).toBe(10000);
  c.anchorZ = 4; c.blades.update(.7);
  expect(returnTarget.hp).toBe(9974);
  expect(c.blades.inspect().active).toHaveLength(0);
  c.blades.cast(snapshot(c, 'thorn-wheel')); c.blades.update(.01);
  c.hitPlayer(10000);
  expect(c.blades.wheels.every(p => !p.active)).toBe(true);
  expect(c.blades.casts.every(p => !p.active)).toBe(true);
  c.reset(); expect(c.blades.telemetry.casts).toBe(0);
});

test('normal combat casts blades despite a full projectile pool, with bounded echoes and cleanup', () => {
  const c = fixture(); c.grantUpgrade('thorn-wheel-weapon'); c.grantUpgrade('tidal-blade-weapon');
  target(c, 5);
  for (const p of c.projectiles) Object.assign(p, { active: true, life: 100, damage: 0, x: -30, z: -30 });
  for (const a of c.runBuild.attacks) if (a.attackId !== 'spark') a.cooldown = 0;
  c.update(.01, { x: 0, z: 0 });
  expect(c.blades.telemetry.casts).toBe(2);
  const copied = snapshot(c, 'thorn-wheel');
  expect(c.blades.cast(copied, undefined, true)).toBe(true);
  expect(c.blades.cast(copied, undefined, true)).toBe(false);
  c.clearTransientEffects();
  expect(c.blades.inspect().active).toHaveLength(0);
  expect(c.blades.impacts.every(p => !p.active)).toBe(true);
});

test('real blade casts participate in bone-dice echoes without recursive cast counting', () => {
  const c = fixture(); c.grantUpgrade('thorn-wheel-weapon'); c.grantUpgrade('tidal-blade-weapon');
  c.grantUpgrade('draft-echo-bone-dice'); c.invulnerability = 10000;
  const enemy = target(c, 4); enemy.hp = 1000000;
  for (let i = 0; i < 120 * 9; i++) {
    enemy.x = enemy.previousX = 4; enemy.z = enemy.previousZ = 0;
    c.update(1 / 120, { x: 0, z: 0 });
  }
  expect(c.relicTelemetry.echoes).toBeGreaterThan(0);
  const primaryCasts = c.runBuild.attacks.filter(a => a.attackId !== 'spark').reduce((n, a) => n + a.shotsFired, 0);
  expect(c.blades.telemetry.casts).toBe(primaryCasts + c.relicTelemetry.echoes);
  expect(c.relicTelemetry.echoes).toBeLessThanOrEqual(Math.floor(primaryCasts / 5));
});
