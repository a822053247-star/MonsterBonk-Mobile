import type { Enemy, WeaponSnapshot } from './combat';
import type { RelicDamageSource } from './relics';

export const BLADE_IDS = ['thorn-wheel', 'tidal-blade'] as const;
export type BladeId = typeof BLADE_IDS[number];
export const isBlade = (id: string): id is BladeId => BLADE_IDS.includes(id as BladeId);
export const BLADE_LIMITS = { wheels: 2, tides: 4, enemies: 256, impacts: 24, step: 1 / 120 } as const;
export function bladeStats(id: BladeId, level: number) {
  const n = Math.max(0, Math.min(4, Math.floor(level) - 1));
  return id === 'thorn-wheel'
    ? { count: n >= 2 ? 3 : 2, radius: 2.4 + n * .15, bladeRadius: .6 + n * .04,
      speed: 2.4 + n * .12, range: 0, interval: 0, push: n >= 3, expand: n >= 4 }
    : { count: 1, radius: 0, bladeRadius: .65 + n * .07, speed: 12,
      range: 8 + n * .65, interval: 2.1 - n * .1, push: false, expand: false };
}
export interface BladeSpec { level: number; tempo: number }
interface BladeCast {
  active: boolean; id: BladeId; age: number; duration: number; x: number; z: number;
  previousX: number; previousZ: number; dx: number; dz: number; distance: number;
  returning: boolean; rotation: number; radius: number; bladeRadius: number; count: number;
  speed: number; range: number; expand: boolean; push: boolean; damage: number;
  copied: boolean; source?: RelicDamageSource;
  outIds: Int32Array; backIds: Int32Array; hitAt: Float64Array;
}
export interface BladePose { active: boolean; x: number; z: number; previousX: number; previousZ: number; angle: number; size: number; copied: boolean }
interface BladeImpact { active: boolean; id: BladeId; x: number; z: number; age: number; angle: number }
interface BladeHost {
  origin(): { x: number; z: number }; enemies(): readonly Enemy[]; stopped(): boolean;
  radius(enemy: Enemy): number;
  covered(x: number, z: number, tx: number, tz: number): boolean;
  intersection(ax: number, az: number, bx: number, bz: number, enemy: Enemy, radius: number): number;
  source(attack: WeaponSnapshot, copied: boolean): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  sound(id: BladeId): void;
}

/** Bounded ground-plane weapons. Simulation never depends on atlas loading or quality. */
export class BladeWeapons {
  readonly casts: BladeCast[] = BLADE_IDS.flatMap(id => Array.from({ length: id === 'thorn-wheel' ? BLADE_LIMITS.wheels : BLADE_LIMITS.tides }, () => ({
    active: false, id, age: 0, duration: 0, x: 0, z: 0, previousX: 0, previousZ: 0,
    dx: 0, dz: 0, distance: 0, returning: false, rotation: 0, radius: 0, bladeRadius: 0,
    count: 0, speed: 0, range: 0, expand: false, push: false, damage: 0, copied: false,
    outIds: new Int32Array(BLADE_LIMITS.enemies), backIds: new Int32Array(BLADE_LIMITS.enemies),
    hitAt: new Float64Array(BLADE_LIMITS.enemies),
  })));
  readonly wheels: BladePose[] = Array.from({ length: BLADE_LIMITS.wheels * 3 }, () => ({
    active: false, x: 0, z: 0, previousX: 0, previousZ: 0, angle: 0, size: 0, copied: false,
  }));
  readonly impacts: BladeImpact[] = Array.from({ length: BLADE_LIMITS.impacts }, () => ({ active: false, id: 'thorn-wheel', x: 0, z: 0, age: 0, angle: 0 }));
  readonly telemetry = { casts: 0, hits: 0, returns: 0, denied: 0, outboundHits: 0, returnHits: 0 };
  private elapsed = 0;
  private wheelIds = new Int32Array(BLADE_LIMITS.enemies);
  private wheelReady = new Float64Array(BLADE_LIMITS.enemies);
  constructor(private host: BladeHost) {}

  /** Score at most sixteen legal aim directions against the bounded enemy pool. */
  aimTarget(range: number, bladeRadius: number) {
    const origin = this.host.origin();
    const enemies = this.host.enemies().filter(e => e.active && e.hp > 0 && e.spawnTime <= 0
      && Math.hypot(e.x - origin.x, e.z - origin.z) <= range && !this.host.covered(origin.x, origin.z, e.x, e.z));
    enemies.sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z) || a.id - b.id);
    let best: Enemy | undefined, score = -1;
    const stride = Math.max(1, Math.ceil(enemies.length / 16));
    for (let i = 0; i < enemies.length; i += stride) {
      const target = enemies[i], dx = target.x - origin.x, dz = target.z - origin.z, length = Math.hypot(dx, dz);
      if (length < .001) continue;
      let hits = 0;
      for (const enemy of enemies) {
        const x = enemy.x - origin.x, z = enemy.z - origin.z, along = (x * dx + z * dz) / length;
        const radius = bladeRadius + this.host.radius(enemy);
        if (along >= 0 && along <= range + radius && Math.abs(x * dz - z * dx) / length <= radius) hits++;
      }
      if (hits > score) { best = target; score = hits; }
    }
    return best ?? enemies[0];
  }

  cast(attack: WeaponSnapshot, target?: { x: number; z: number }, copied = false) {
    if (!isBlade(attack.attackId) || !attack.blade || this.host.stopped()) return false;
    const id = attack.attackId, origin = this.host.origin(), stats = bladeStats(id, attack.blade.level);
    if (id === 'tidal-blade' && !target) return false;
    // A primary wheel occupies one continuous orbit; echoes use the second reservation.
    const slot = this.casts.find(c => c.id === id && !c.active);
    if (!slot || id === 'thorn-wheel' && !copied && this.casts.some(c => c.active && c.id === id && !c.copied)) {
      this.telemetry.denied++; return false;
    }
    const dx = (target?.x ?? origin.x) - origin.x, dz = (target?.z ?? origin.z + 1) - origin.z;
    const length = Math.max(.001, Math.hypot(dx, dz));
    const tempo = Math.max(.1, attack.blade.tempo);
    Object.assign(slot, { active: true, age: 0, x: origin.x, z: origin.z, previousX: origin.x, previousZ: origin.z,
      dx: dx / length, dz: dz / length, distance: 0, returning: false,
      duration: id === 'thorn-wheel' ? Math.PI * 2 / (stats.speed * tempo) : 4,
      rotation: 0, radius: id === 'thorn-wheel' ? attack.range : 0,
      bladeRadius: stats.bladeRadius * Math.min(1.6, attack.rules.areaMultiplier), count: stats.count,
      speed: stats.speed * (id === 'thorn-wheel' ? tempo : 1), range: attack.range,
      expand: stats.expand, push: stats.push, copied, damage: attack.damage * attack.rules.directMultiplier,
      source: this.host.source(attack, copied) });
    slot.outIds.fill(0); slot.backIds.fill(0); slot.hitAt.fill(0);
    this.telemetry.casts++; this.host.sound(id);
    return true;
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const fx of this.impacts) if (fx.active) { fx.age += dt; if (fx.age >= .32) fx.active = false; }
    for (const pose of this.wheels) pose.active = false;
    if (this.host.stopped()) { this.clear(); return; }
    const origin = this.host.origin();
    let left = dt;
    // Swept short segments follow curved orbits and prevent tunnelling at coarse simulation steps.
    while (left > 1e-8 && !this.host.stopped()) {
      const step = Math.min(left, BLADE_LIMITS.step); left -= step; this.elapsed += step;
      for (let ci = 0; ci < this.casts.length; ci++) {
        const cast = this.casts[ci]; if (!cast.active) continue;
        if (cast.id === 'thorn-wheel') this.stepWheel(cast, ci * 3, step, origin);
        else this.stepTide(cast, step, origin);
        if (this.host.stopped()) break;
      }
    }
  }

  private stepWheel(cast: BladeCast, index: number, dt: number, origin: { x: number; z: number }) {
    const oldAge = cast.age;
    cast.age = Math.min(cast.duration, cast.age + dt);
    const radiusAt = (age: number) => cast.radius + (cast.expand ? .85 * Math.sin(Math.PI * age / cast.duration) ** 4 : 0);
    for (let j = 0; j < cast.count; j++) {
      if (this.host.stopped()) return;
      const pose = this.wheels[index + j], phase = j / cast.count * Math.PI * 2;
      const before = oldAge * cast.speed + phase, after = cast.age * cast.speed + phase;
      const ax = cast.x + Math.cos(before) * radiusAt(oldAge), az = cast.z + Math.sin(before) * radiusAt(oldAge);
      const bx = origin.x + Math.cos(after) * radiusAt(cast.age), bz = origin.z + Math.sin(after) * radiusAt(cast.age);
      Object.assign(pose, { active: true, previousX: ax, previousZ: az, x: bx, z: bz,
        angle: -cast.age * 6 - phase, size: cast.bladeRadius * 2, copied: cast.copied });
      this.contacts(cast, ax, az, bx, bz, origin);
    }
    cast.x = origin.x; cast.z = origin.z; cast.rotation = cast.age * cast.speed;
    if (cast.age >= cast.duration - 1e-8) cast.active = false;
  }

  private stepTide(cast: BladeCast, dt: number, origin: { x: number; z: number }) {
    cast.previousX = cast.x; cast.previousZ = cast.z;
    cast.age += dt;
    let finish = false;
    if (!cast.returning) {
      const distance = Math.min(cast.speed * dt, Math.max(0, cast.range - cast.distance));
      cast.x += cast.dx * distance; cast.z += cast.dz * distance; cast.distance += distance;
    } else {
      const dx = origin.x - cast.x, dz = origin.z - cast.z, distance = Math.hypot(dx, dz);
      const movement = Math.min(distance, cast.speed * 1.35 * dt);
      if (distance > .001) { cast.dx = dx / distance; cast.dz = dz / distance; }
      cast.x += cast.dx * movement; cast.z += cast.dz * movement;
      finish = distance <= movement + .12;
    }
    cast.rotation = -Math.atan2(cast.dz, cast.dx);
    this.contacts(cast, cast.previousX, cast.previousZ, cast.x, cast.z, origin);
    if (!cast.returning && cast.distance >= cast.range - 1e-8) {
      cast.returning = true; this.telemetry.returns++;
    }
    if (finish || cast.age >= cast.duration) cast.active = false;
  }

  private contacts(cast: BladeCast, ax: number, az: number, bx: number, bz: number, origin: { x: number; z: number }) {
    const enemies = this.host.enemies(), wheel = cast.id === 'thorn-wheel';
    for (let i = 0; i < Math.min(enemies.length, BLADE_LIMITS.enemies); i++) {
      if (this.host.stopped()) return;
      const e = enemies[i];
      if (!e.active || e.hp <= 0 || e.spawnTime > 0) continue;
      const ids = cast.returning ? cast.backIds : cast.outIds;
      if (wheel ? (cast.copied ? ids[i] === e.id && cast.hitAt[i] > this.elapsed : this.wheelIds[i] === e.id && this.wheelReady[i] > this.elapsed) : ids[i] === e.id) continue;
      if (this.host.intersection(ax, az, bx, bz, e, cast.bladeRadius + this.host.radius(e)) === Infinity
        || this.host.covered(bx, bz, e.x, e.z) || this.host.covered(origin.x, origin.z, e.x, e.z)) continue;
      ids[i] = e.id; cast.hitAt[i] = this.elapsed + .55;
      if (wheel && !cast.copied) { this.wheelIds[i] = e.id; this.wheelReady[i] = this.elapsed + .55; }
      if (!wheel) e.slowTime = Math.max(e.slowTime ?? 0, cast.source!.rules.slowDuration);
      this.host.damage(e, cast.damage * (e.rank === 'boss' ? .4 : e.rank === 'elite' ? .7 : 1), cast.source!);
      this.telemetry.hits++;
      if (!wheel) this.telemetry[cast.returning ? 'returnHits' : 'outboundHits']++;
      if (wheel && cast.push && e.active && !e.rank) {
        const dx = e.x - origin.x, dz = e.z - origin.z, d = Math.max(.001, Math.hypot(dx, dz));
        e.knockX += dx / d * 1.2; e.knockZ += dz / d * 1.2;
      }
      const fx = this.impacts.find(p => !p.active);
      if (fx) Object.assign(fx, { active: true, id: cast.id, x: e.x, z: e.z, age: 0, angle: cast.rotation });
    }
  }
  clear() {
    for (const cast of this.casts) { cast.active = false; cast.source = undefined; }
    for (const pose of this.wheels) pose.active = false;
    for (const fx of this.impacts) fx.active = false;
    this.wheelIds.fill(0); this.wheelReady.fill(0);
  }
  reset() { this.clear(); this.elapsed = 0; for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0; }
  inspect() { return { ...this.telemetry, capacity: this.casts.length, wheels: this.wheels.filter(p => p.active).length,
    active: this.casts.filter(c => c.active).map(c => ({ id: c.id, age: c.age, x: c.x, z: c.z, returning: c.returning, copied: c.copied })) }; }
}
