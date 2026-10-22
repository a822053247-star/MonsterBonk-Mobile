import type { Enemy, ExperienceOrb } from './combat';
import type { RelicDamageSource } from './relics';

export const POSITION_IDS = ['abyss-vortex', 'ice-radiance', 'spore-trail', 'tidal-recall'] as const;
export type PositionSkill = typeof POSITION_IDS[number];
export const POSITION_NAMES: Record<PositionSkill, string> = {
  'abyss-vortex': '深渊漩涡', 'ice-radiance': '冰棱放射', 'spore-trail': '孢火足迹', 'tidal-recall': '潮汐回收',
};
export const POSITION_LIMITS = { enemies: 256, vortex: 2, radiance: 2, trails: 16, recall: 2, beams: 16, tick: .5, stride: 1.2 } as const;
export function positionStats(id: PositionSkill, rank: number) {
  const n = Math.max(1, Math.min(5, Math.floor(rank))) - 1;
  switch (id) {
    case 'abyss-vortex': return { radius: 3.2 + n * .25, damage: 7.5 * (1 + n * .2), duration: 3 + n * .25, interval: 6.5, beams: 0 };
    case 'ice-radiance': return { radius: 6 + n * .5, damage: 30 * (1 + n * .2), duration: 1.2, interval: 4.8, beams: 8 + n * 2 };
    case 'spore-trail': return { radius: 1.2 + n * .1, damage: 6 * (1 + n * .2), duration: 2.8 + n * .3, interval: .22, beams: 0 };
    case 'tidal-recall': return { radius: 5 + n * .4, damage: 28 * (1 + n * .18), duration: 1.8, interval: 7, beams: 0 };
  }
}
type Point = { x: number; z: number };
export interface PositionCast extends Point {
  active: boolean; kind: PositionSkill; castId: number; age: number; radius: number; damage: number; duration: number;
  originX: number; originZ: number; previousX: number; previousZ: number; ringRadius: number; previousRadius: number;
  nextTick: number; beams: number; angle: number; mode: 'rays' | 'ring'; fired: boolean;
  hits: Int32Array; returnHits: Int32Array; source?: RelicDamageSource;
}
interface PositionHost {
  enemies(): readonly Enemy[]; orbs(): readonly ExperienceOrb[]; origin(): Point;
  spellCenter(): Point; aim(): number; nextCastId(): number;
  source(damage: number, castId: number, element: 'water' | 'spore'): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  move(enemy: Enemy, dx: number, dz: number): void;
  sound(kind: 'water' | 'shockwave' | 'thorn'): void;
  feedback(kills: number): void;
}
/** Distinct bounded simulation for pull fields, gapped rays, walking trails and two-pass recall waves. */
export class PositionAoe {
  readonly casts: PositionCast[] = POSITION_IDS.flatMap(kind => Array.from({ length: kind === 'spore-trail' ? POSITION_LIMITS.trails : 2 }, () => ({
    active: false, kind, castId: 0, age: 0, x: 0, z: 0, originX: 0, originZ: 0, previousX: 0, previousZ: 0,
    radius: 0, ringRadius: 0, previousRadius: 0, damage: 0, duration: 0, nextTick: .5, beams: 0, angle: 0,
    mode: 'rays' as const, fired: false, hits: new Int32Array(256), returnHits: new Int32Array(256),
  })));
  private clocks = Object.fromEntries(POSITION_IDS.map(id => [id, 0])) as Record<PositionSkill, number>;
  private elapsed = 0;
  private radianceSerial = 0;
  private walking = false;
  private previousOrigin: Point = { x: 0, z: 0 };
  private trailDistance = 0;
  private trailIds = new Int32Array(256);
  private trailReady = new Float64Array(256);
  readonly telemetry = { casts: 0, hits: 0, kills: 0, denied: 0, replacedTrails: 0, orbsPulled: 0 };
  constructor(private host: PositionHost) {}
  private cluster() {
    const p = this.host.origin(), candidates = this.host.enemies().filter(e => this.eligible(e) && Math.hypot(e.x - p.x, e.z - p.z) <= 14);
    let best: Enemy | undefined, score = -1;
    for (let i = 0; i < candidates.length; i += Math.max(1, Math.ceil(candidates.length / 16))) {
      const e = candidates[i]; let count = 0;
      for (const other of candidates) if (Math.hypot(e.x - other.x, e.z - other.z) <= 3.6) count++;
      if (count > score) { best = e; score = count; }
    }
    return best ? { x: best.x, z: best.z } : undefined;
  }
  cast(kind: PositionSkill, rank = 1, multiplier = 1, position?: Point) {
    if (!POSITION_IDS.includes(kind) || !Number.isFinite(rank) || rank <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return false;
    const target = position ?? (kind === 'abyss-vortex' ? this.cluster() : kind === 'ice-radiance' ? this.host.spellCenter() : this.host.origin());
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return false;
    let cast = this.casts.find(c => c.kind === kind && !c.active);
    if (!cast && kind === 'spore-trail') {
      cast = this.casts.filter(c => c.kind === kind).reduce((a, b) => a.age > b.age || a.age === b.age && a.castId < b.castId ? a : b);
      this.telemetry.replacedTrails++;
    }
    if (!cast) { this.telemetry.denied++; return false; }
    const stats = positionStats(kind, rank);
    Object.assign(cast, { active: true, castId: this.host.nextCastId(), age: 0, x: target.x, z: target.z,
      originX: target.x, originZ: target.z, previousX: target.x, previousZ: target.z, ringRadius: 0, previousRadius: 0,
      radius: stats.radius, damage: stats.damage * multiplier, duration: stats.duration, nextTick: .5,
      beams: stats.beams, angle: this.host.aim(), mode: kind === 'ice-radiance' && this.radianceSerial++ % 2 ? 'ring' : 'rays', fired: false });
    cast.hits.fill(0); cast.returnHits.fill(0);
    cast.source = this.host.source(cast.damage, cast.castId, kind === 'spore-trail' ? 'spore' : 'water');
    this.telemetry.casts++;
    if (kind !== 'spore-trail') this.host.sound('water');
    return true;
  }
  update(dt: number, ranks: Partial<Record<PositionSkill, number>>, multiplier: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt; const kills = this.telemetry.kills, origin = this.host.origin();
    for (const id of POSITION_IDS) {
      this.clocks[id] -= dt;
      if (id === 'spore-trail' || !(ranks[id]! > 0)) continue;
      if (this.clocks[id] <= 0 && this.cast(id, ranks[id], multiplier)) this.clocks[id] = positionStats(id, ranks[id]!).interval;
    }
    if (this.walking && (ranks['spore-trail'] ?? 0) > 0) {
      const distance = Math.hypot(origin.x - this.previousOrigin.x, origin.z - this.previousOrigin.z);
      // Teleports/restarts cannot paint a corridor; ordinary movement and dashes leave a bounded trail.
      if (distance <= 4) this.trailDistance += distance; else this.trailDistance = 0;
      if (this.trailDistance >= POSITION_LIMITS.stride && this.clocks['spore-trail'] <= 0
        && this.cast('spore-trail', ranks['spore-trail'], multiplier, this.previousOrigin)) {
        this.trailDistance %= POSITION_LIMITS.stride; this.clocks['spore-trail'] = .22;
      }
    } else this.trailDistance = 0;
    this.previousOrigin = { ...origin }; this.walking = true;
    for (const cast of this.casts) {
      if (!cast.active) continue;
      const previousAge = cast.age; cast.age = Math.min(cast.duration, cast.age + dt);
      if (cast.kind === 'abyss-vortex') {
        for (const enemy of this.host.enemies()) {
          if (!this.eligible(enemy) || enemy.rank === 'boss') continue;
          const dx = cast.x - enemy.x, dz = cast.z - enemy.z, distance = Math.hypot(dx, dz);
          if (distance < .25 || distance > cast.radius) continue;
          const movement = Math.min(distance - .25, (enemy.rank === 'elite' ? .25 : 1.2) * dt);
          this.host.move(enemy, dx / distance * movement, dz / distance * movement);
        }
      }
      if (cast.kind === 'abyss-vortex' || cast.kind === 'spore-trail') {
        while (cast.nextTick <= cast.age + 1e-8) {
          const source = this.tickSource(cast), tickTime = this.elapsed - cast.age + cast.nextTick;
          this.eachEnemy((enemy, i) => {
            if (Math.hypot(enemy.x - cast.x, enemy.z - cast.z) > cast.radius) return;
            if (cast.kind === 'spore-trail') {
              if (this.trailIds[i] === enemy.id && this.trailReady[i] > tickTime + 1e-8) return;
              this.trailIds[i] = enemy.id; this.trailReady[i] = tickTime + .5;
            }
            this.hit(cast, enemy, source);
          });
          cast.nextTick += .5;
        }
      } else if (cast.kind === 'ice-radiance' && cast.mode === 'rays') {
        if (!cast.fired && cast.age >= .24) {
          cast.fired = true; const source = this.tickSource(cast);
          this.eachEnemy((enemy, i) => {
            if (cast.hits[i] === enemy.id) return;
            const dx = enemy.x - cast.x, dz = enemy.z - cast.z, distance = Math.hypot(dx, dz);
            const step = Math.PI * 2 / cast.beams, a = Math.atan2(dz, dx) - cast.angle;
            const offset = a - Math.round(a / step) * step, along = Math.cos(offset) * distance;
            if (along < .4 || along > cast.radius || Math.abs(Math.sin(offset) * distance) > .3) return;
            cast.hits[i] = enemy.id; this.hit(cast, enemy, source);
          });
          this.host.sound('shockwave');
        }
      } else {
        const recall = cast.kind === 'tidal-recall', half = cast.duration / 2;
        // Process the turning point even when one large step crosses both phases.
        const ages = recall && previousAge < half && cast.age > half ? [half, cast.age] : [cast.age];
        for (const age of ages) {
          cast.previousX = cast.x; cast.previousZ = cast.z; cast.previousRadius = cast.ringRadius;
          const returning = recall && age > half;
          if (recall) {
            const progress = returning ? (age - half) / half : age / half;
            cast.ringRadius = cast.radius * (returning ? 1 - progress : progress);
            if (returning) { cast.x = cast.originX + (origin.x - cast.originX) * progress; cast.z = cast.originZ + (origin.z - cast.originZ) * progress; }
          } else cast.ringRadius = cast.radius * Math.max(0, Math.min(1, (age - .2) / .75));
          if (!recall && age <= .2) continue;
          const ids = returning ? cast.returnHits : cast.hits, source = this.tickSource(cast);
          this.eachEnemy((enemy, i) => {
            if (ids[i] === enemy.id || !this.ringPassed(cast, enemy)) return;
            ids[i] = enemy.id; this.hit(cast, enemy, source);
          });
          if (returning) for (const orb of this.host.orbs()) {
            if (orb.active && !orb.magnetized && this.ringPassed(cast, orb)) { orb.magnetized = true; this.telemetry.orbsPulled++; }
          }
        }
        if (recall && previousAge <= half && cast.age > half) this.host.sound('water');
      }
      if (cast.age >= cast.duration) cast.active = false;
    }
    if (this.telemetry.kills - kills >= 8) this.host.feedback(this.telemetry.kills - kills);
  }
  private ringPassed(cast: PositionCast, p: Point) {
    const before = Math.hypot(p.x - cast.previousX, p.z - cast.previousZ) - cast.previousRadius;
    const after = Math.hypot(p.x - cast.x, p.z - cast.z) - cast.ringRadius;
    return before * after <= 0 || Math.abs(after) <= .25;
  }
  private eligible(e: Enemy) { return e.active && e.hp > 0 && e.spawnTime <= 0; }
  private eachEnemy(visit: (enemy: Enemy, index: number) => void) {
    const enemies = this.host.enemies();
    for (const boss of [false, true]) for (let i = 0; i < enemies.length; i++) if (this.eligible(enemies[i]) && (enemies[i].rank === 'boss') === boss) visit(enemies[i], i);
  }
  private tickSource(cast: PositionCast): RelicDamageSource {
    return { ...cast.source!, areaBudget: { nodes: 0, hits: new Map(), shared: cast.source!.areaBudget!.shared } };
  }
  private hit(cast: PositionCast, enemy: Enemy, source: RelicDamageSource) {
    this.host.damage(enemy, cast.damage * (enemy.rank === 'boss' ? (cast.kind === 'tidal-recall' ? .6 : cast.kind === 'ice-radiance' ? .55 : .45) : enemy.rank === 'elite' ? .7 : 1), source);
    this.telemetry.hits++; if (enemy.hp <= 0) this.telemetry.kills++;
  }
  clear() {
    for (const cast of this.casts) { cast.active = false; cast.source = undefined; cast.hits.fill(0); cast.returnHits.fill(0); }
    this.walking = false; this.trailDistance = 0; this.trailIds.fill(0); this.trailReady.fill(0);
  }
  reset() {
    this.clear(); this.elapsed = this.radianceSerial = 0;
    for (const id of POSITION_IDS) this.clocks[id] = 0;
    for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0;
  }
  inspect() { return { ...this.telemetry, capacity: this.casts.length, active: this.casts.filter(c => c.active).map(c => ({ kind: c.kind, castId: c.castId,
    x: c.x, z: c.z, age: c.age, mode: c.mode, radius: c.radius, ringRadius: c.ringRadius, beams: c.beams, reactionNodes: c.source?.areaBudget?.shared?.nodes ?? 0 })) }; }
}
