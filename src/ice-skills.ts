import type { Enemy } from './combat';
import type { RelicDamageSource } from './relics';

export const ICE_SKILL_IDS = ['shatter-ring', 'glacier-trail'] as const;
export type IceSkill = typeof ICE_SKILL_IDS[number];
export const ICE_SKILL_NAMES = { 'shatter-ring': '碎冰震环', 'glacier-trail': '冰川滑痕' } as const;
export const ICE_LIMITS = { rings: 2, trails: 24, stride: 1, tick: .5, ringDuration: .6 } as const;
export function iceSkillStats(id: IceSkill, rank: number) {
  const n = Math.max(0, Math.min(4, Math.floor(rank) - 1));
  return id === 'shatter-ring'
    ? { damage: 24 * (1 + .2 * n), radius: 3.4 + .3 * n, duration: .6, interval: 5 - .2 * n }
    : { damage: 5 * (1 + .2 * n), radius: .6 + .05 * n, duration: 3 + .4 * n, interval: .5 };
}
interface Point { x: number; z: number }
interface IceHost {
  origin(): Point; enemies(): readonly Enemy[]; radius(enemy: Enemy): number;
  covered(x: number, z: number, tx: number, tz: number): boolean;
  source(damage: number): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  sound(): void;
}
export interface IcePatch extends Point {
  active: boolean; age: number; born: number; duration: number; radius: number; damage: number;
  serial: number; angle: number; source?: RelicDamageSource;
}
export interface IceRing extends IcePatch { waveRadius: number; hits: Int32Array }

/** Bounded ice skills; movement, damage cadence and status are independent of render quality. */
export class IceSkills {
  readonly rings: IceRing[] = Array.from({ length: ICE_LIMITS.rings }, () => ({ active: false, age: 0, born: 0,
    duration: .6, radius: 0, damage: 0, serial: 0, angle: 0, x: 0, z: 0, waveRadius: 0, hits: new Int32Array(256) }));
  readonly trails: IcePatch[] = Array.from({ length: ICE_LIMITS.trails }, () => ({ active: false, age: 0, born: 0,
    duration: 3, radius: .6, damage: 0, serial: 0, angle: 0, x: 0, z: 0 }));
  readonly telemetry = { rings: 0, trails: 0, ringHits: 0, trailHits: 0, shatters: 0, replaced: 0 };
  private elapsed = 0;
  private ringClock = 0;
  private serial = 0;
  private previous?: Point;
  private distance = 0;
  private nextTick = ICE_LIMITS.tick as number;
  constructor(private host: IceHost) {}
  castRing(rank: number, multiplier = 1) {
    const cast = this.rings.find(c => !c.active);
    if (!cast || !(rank > 0) || !Number.isFinite(rank) || !(multiplier > 0) || !Number.isFinite(multiplier)) return false;
    const stats = iceSkillStats('shatter-ring', rank), p = this.host.origin();
    Object.assign(cast, stats, p, { active: true, age: 0, born: this.elapsed, serial: ++this.serial, waveRadius: 0,
      damage: stats.damage * multiplier, source: this.host.source(stats.damage * multiplier) });
    cast.hits.fill(0); this.telemetry.rings++; this.host.sound(); return true;
  }
  private patch(p: Point, angle: number, rank: number, multiplier: number) {
    let cast = this.trails.find(c => !c.active);
    if (!cast) { cast = this.trails.reduce((a, b) => a.serial < b.serial ? a : b); this.telemetry.replaced++; }
    const stats = iceSkillStats('glacier-trail', rank);
    Object.assign(cast, stats, p, { active: true, age: 0, born: this.elapsed, serial: ++this.serial, angle,
      damage: stats.damage * multiplier, source: this.host.source(stats.damage * multiplier) });
    this.telemetry.trails++;
  }
  update(dt: number, ranks: Partial<Record<IceSkill, number>>, multiplier: number) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.elapsed += dt; this.ringClock -= dt;
    const p = this.host.origin(), ringRank = ranks['shatter-ring'] ?? 0, trailRank = ranks['glacier-trail'] ?? 0;
    if (ringRank > 0 && this.ringClock <= 0 && this.castRing(ringRank, multiplier))
      this.ringClock = iceSkillStats('shatter-ring', ringRank).interval;
    if (this.previous && trailRank > 0) {
      const dx = p.x - this.previous.x, dz = p.z - this.previous.z, movement = Math.hypot(dx, dz);
      if (movement > 4) this.distance = 0;
      else if (movement > 0) {
        let along = ICE_LIMITS.stride - this.distance;
        while (along <= movement + 1e-8) {
          this.patch({ x: this.previous.x + dx * along / movement, z: this.previous.z + dz * along / movement },
            Math.atan2(dz, dx), trailRank, multiplier); along += ICE_LIMITS.stride;
        }
        this.distance = (this.distance + movement) % ICE_LIMITS.stride;
      }
    } else this.distance = 0;
    this.previous = { ...p };
    for (const ring of this.rings) {
      if (!ring.active) continue;
      const before = ring.waveRadius;
      ring.age = Math.min(ring.duration, this.elapsed - ring.born);
      ring.waveRadius = ring.radius * Math.min(1, ring.age / .4);
      for (const [i, enemy] of this.host.enemies().entries()) {
        if (!this.eligible(enemy) || ring.hits[i] === enemy.id) continue;
        const distance = Math.hypot(enemy.x - ring.x, enemy.z - ring.z), radius = this.host.radius(enemy);
        if (distance - radius > ring.waveRadius + .16 || distance + radius < before - .16
          || this.host.covered(ring.x, ring.z, enemy.x, enemy.z)) continue;
        ring.hits[i] = enemy.id;
        const frozen = (enemy.freezeTime ?? 0) > 0;
        const damage = ring.damage * (frozen ? 1.5 : 1) * this.rankFactor(enemy);
        this.host.damage(enemy, damage, { ...ring.source!, rootDamage: damage });
        this.telemetry.ringHits++; if (frozen) this.telemetry.shatters++;
      }
      if (ring.age >= ring.duration) ring.active = false;
    }
    // One shared terrain tick per enemy, even at intersections of many patches.
    while (this.nextTick <= this.elapsed + 1e-8) {
      for (const enemy of this.host.enemies()) {
        if (!this.eligible(enemy)) continue;
        let best: IcePatch | undefined;
        for (const patch of this.trails) {
          if (!patch.active || patch.born > this.nextTick || patch.born + patch.duration < this.nextTick - 1e-8) continue;
          const dx = enemy.x - patch.x, dz = enemy.z - patch.z, c = Math.cos(patch.angle), s = Math.sin(patch.angle);
          const along = dx * c + dz * s, across = -dx * s + dz * c;
          if (Math.hypot(Math.max(0, Math.abs(along) - .65), across) > patch.radius + this.host.radius(enemy)
            || this.host.covered(patch.x, patch.z, enemy.x, enemy.z)) continue;
          if (!best || patch.damage > best.damage) best = patch;
        }
        if (best) {
          const damage = best.damage * this.rankFactor(enemy);
          this.host.damage(enemy, damage, { ...best.source!, rootDamage: damage }); this.telemetry.trailHits++;
        }
      }
      this.nextTick += ICE_LIMITS.tick;
    }
    for (const patch of this.trails) if (patch.active) {
      patch.age = this.elapsed - patch.born; if (patch.age >= patch.duration) patch.active = false;
    }
  }
  private eligible(enemy: Enemy) { return enemy.active && enemy.spawnTime <= 0 && enemy.hp > 0; }
  private rankFactor(enemy: Enemy) { return enemy.rank === 'boss' ? .4 : enemy.rank === 'elite' ? .7 : 1; }
  clear() {
    for (const c of [...this.rings, ...this.trails]) { c.active = false; c.source = undefined; }
    this.previous = undefined; this.distance = 0; this.nextTick = this.elapsed + ICE_LIMITS.tick; this.ringClock = 0;
  }
  reset() {
    this.elapsed = this.serial = 0; this.clear();
    for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0;
  }
  inspect() { return { ...this.telemetry, activeRings: this.rings.filter(c => c.active).length,
    activeTrails: this.trails.filter(c => c.active).length, capacity: ICE_LIMITS }; }
}
