import type { Enemy } from './combat';
import type { RelicDamageSource } from './relics';
import type { SpawnViewport } from './spawn-layout';

export const AREA_RULES = {
  novaCapacity: 2, visualCapacity: 1, warning: .45, duration: 1.15, interval: 12, damage: 90,
  eliteMultiplier: .7, bossMultiplier: .4, chainNodes: 24,
} as const;
export const BARRAGE_RULES = {
  casts: 4, lanes: 96, minCount: 12, maxCount: 24, speed: 24, lifetime: 1.8,
  roundGap: .12, maxRounds: 3, targetsPerLane: 3, targetsPerCast: 72,
  decay: .8, interval: 5.5, damage: 22, radius: .23,
} as const;
export type BarragePattern = 'ring' | 'fan' | 'cross';
export interface BarrageLane {
  castId: number; active: boolean; launchAt: number; x: number; z: number;
  previousX: number; previousZ: number; vx: number; vz: number; age: number; hits: number;
}
export interface BarrageCast {
  active: boolean; castId: number; age: number; damage: number; duration: number;
  pattern: BarragePattern; hits: Set<number>; source?: RelicDamageSource; kills: number;
}
export interface NovaCast {
  active: boolean; castId: number; age: number; detonated: boolean; damage: number;
  view: SpawnViewport; source?: RelicDamageSource; hits: Set<number>; kills: number;
}
export interface AreaHost {
  nextCastId(): number;
  enemies(): readonly Enemy[];
  view(): SpawnViewport;
  source(damage: number, castId: number): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  feedback(kills: number, explosion: boolean): void;
  origin(): { x: number; z: number };
  aim(): number;
  intersection(lane: BarrageLane, enemy: Enemy): number;
}

/** Pure simulation. Accepted casts never depend on texture loading or visual capacity. */
export class AreaAttacks {
  readonly novas: NovaCast[] = Array.from({ length: AREA_RULES.novaCapacity }, () => ({
    active: false, castId: 0, age: 0, detonated: false, damage: 0,
    view: { x: 0, z: 0, halfWidth: 14, halfDepth: 12 }, hits: new Set(), kills: 0,
  }));
  private novaClock = 0;
  private barrageClock = 0;
  private patternIndex = 0;
  readonly barrages: BarrageCast[] = Array.from({ length: BARRAGE_RULES.casts }, () => ({
    active: false, castId: 0, age: 0, damage: 0, duration: 0, pattern: 'ring', hits: new Set(), kills: 0,
  }));
  readonly lanes: BarrageLane[] = Array.from({ length: BARRAGE_RULES.lanes }, () => ({
    castId: 0, active: false, launchAt: 0, x: 0, z: 0, previousX: 0, previousZ: 0, vx: 0, vz: 0, age: 0, hits: 0,
  }));
  readonly telemetry = { casts: 0, hits: 0, kills: 0, denied: 0 };
  constructor(private host: AreaHost) {}

  /** Reserve all lanes atomically, including future rounds. Full pool refuses the cast without consuming cooldown. */
  castBarrage(pattern: BarragePattern, count = 24, rounds = 3, damage: number = BARRAGE_RULES.damage) {
    if (!['ring', 'fan', 'cross'].includes(pattern) || !Number.isFinite(count) || !Number.isFinite(rounds)
      || !Number.isFinite(damage) || damage <= 0) return false;
    count = Math.max(BARRAGE_RULES.minCount, Math.min(BARRAGE_RULES.maxCount, Math.floor(count)));
    rounds = Math.max(1, Math.min(BARRAGE_RULES.maxRounds, Math.floor(rounds)));
    const cast = this.barrages.find(c => !c.active), free = this.lanes.filter(l => l.castId === 0);
    if (!cast || free.length < count) { this.telemetry.denied++; return false; }
    const castId = this.host.nextCastId(), origin = this.host.origin(), aim = this.host.aim();
    Object.assign(cast, { active: true, castId, age: 0, damage, pattern, kills: 0,
      duration: BARRAGE_RULES.lifetime + (rounds - 1) * BARRAGE_RULES.roundGap, source: this.host.source(damage, castId) });
    cast.hits.clear();
    for (let i = 0; i < count; i++) {
      const angle = pattern === 'ring' ? i / count * Math.PI * 2 : pattern === 'fan'
        ? aim - Math.PI / 3 + i / (count - 1) * Math.PI * 2 / 3
        : aim + (i % 4) * Math.PI / 2 + (Math.floor(i / 4) / Math.max(1, Math.ceil(count / 4) - 1) - .5) * .35;
      Object.assign(free[i], { castId, active: false, launchAt: (i % rounds) * BARRAGE_RULES.roundGap,
        x: origin.x, z: origin.z, previousX: origin.x, previousZ: origin.z,
        vx: Math.sin(angle) * BARRAGE_RULES.speed, vz: Math.cos(angle) * BARRAGE_RULES.speed, age: 0, hits: 0 });
    }
    this.telemetry.casts++;
    return true;
  }

  castNova(damage: number = AREA_RULES.damage) {
    const cast = this.novas.find(c => !c.active);
    if (!cast || !Number.isFinite(damage) || damage <= 0) { this.telemetry.denied++; return false; }
    cast.active = true; cast.castId = this.host.nextCastId(); cast.age = 0; cast.detonated = false;
    cast.damage = damage; cast.view = { ...this.host.view() }; cast.hits.clear(); cast.kills = 0;
    cast.source = this.host.source(damage, cast.castId);
    this.telemetry.casts++;
    return true;
  }

  update(dt: number, novaRank: number, multiplier: number, barrageRank = 0) {
    if (dt <= 0) return;
    if (novaRank > 0) {
      this.novaClock -= dt;
      if (this.novaClock <= 0 && this.castNova(AREA_RULES.damage * multiplier * (1 + .25 * (novaRank - 1))))
        this.novaClock = AREA_RULES.interval;
    }
    if (barrageRank > 0) {
      this.barrageClock -= dt;
      const patterns: BarragePattern[] = ['ring', 'fan', 'cross'];
      if (this.barrageClock <= 0 && this.castBarrage(patterns[this.patternIndex % patterns.length],
        12 + (barrageRank - 1) * 6, barrageRank, BARRAGE_RULES.damage * multiplier)) {
        this.barrageClock = BARRAGE_RULES.interval; this.patternIndex++;
      }
    }
    for (const cast of this.novas) {
      if (!cast.active) continue;
      cast.age += dt;
      if (!cast.detonated && cast.age >= AREA_RULES.warning) {
        cast.detonated = true;
        cast.view = { ...this.host.view() };
        const v = cast.view;
        // Snapshot eligibility, then settle bosses last: boss victory clears all remaining enemies.
        const targets = this.host.enemies().filter(e => e.active && e.hp > 0 && e.spawnTime <= 0
          && Math.abs(e.x - v.x) <= v.halfWidth && Math.abs(e.z - v.z) <= v.halfDepth);
        for (const bossPass of [false, true]) for (const enemy of targets) {
          if ((enemy.rank === 'boss') !== bossPass || cast.hits.has(enemy.id)) continue;
          cast.hits.add(enemy.id);
          this.host.damage(enemy, cast.damage * (enemy.rank === 'boss' ? AREA_RULES.bossMultiplier
            : enemy.rank === 'elite' ? AREA_RULES.eliteMultiplier : 1), cast.source!);
          this.telemetry.hits++;
          if (enemy.hp <= 0) { cast.kills++; this.telemetry.kills++; }
        }
        this.host.feedback(cast.kills, true);
      }
      if (cast.age >= AREA_RULES.duration) cast.active = false;
    }
    this.updateBarrages(dt);
  }

  private updateBarrages(dt: number) {
    for (const cast of this.barrages) {
      if (!cast.active) continue;
      cast.age += dt;
      for (const lane of this.lanes) {
        if (lane.castId !== cast.castId || cast.age <= lane.launchAt || lane.hits >= BARRAGE_RULES.targetsPerLane || lane.age >= BARRAGE_RULES.lifetime) continue;
        const step = Math.min(dt, cast.age - lane.launchAt, BARRAGE_RULES.lifetime - lane.age);
        lane.active = true; lane.previousX = lane.x; lane.previousZ = lane.z;
        lane.x += lane.vx * step; lane.z += lane.vz * step; lane.age += step;
        while (lane.hits < BARRAGE_RULES.targetsPerLane && cast.hits.size < BARRAGE_RULES.targetsPerCast) {
          let nearest: Enemy | undefined, first = Infinity;
          for (const enemy of this.host.enemies()) {
            if (!enemy.active || enemy.hp <= 0 || enemy.spawnTime > 0 || cast.hits.has(enemy.id)) continue;
            const t = this.host.intersection(lane, enemy);
            if (t < first || t === first && t !== Infinity && enemy.id < (nearest?.id ?? Infinity)) { first = t; nearest = enemy; }
          }
          if (!nearest) break;
          cast.hits.add(nearest.id);
          this.host.damage(nearest, cast.damage * BARRAGE_RULES.decay ** lane.hits
            * (nearest.rank === 'boss' ? AREA_RULES.bossMultiplier : nearest.rank === 'elite' ? AREA_RULES.eliteMultiplier : 1), cast.source!);
          lane.hits++; this.telemetry.hits++;
          if (nearest.hp <= 0) { cast.kills++; this.telemetry.kills++; }
        }
        if (lane.hits >= BARRAGE_RULES.targetsPerLane || lane.age >= BARRAGE_RULES.lifetime) lane.active = false;
      }
      if (cast.age >= cast.duration || cast.hits.size >= BARRAGE_RULES.targetsPerCast) {
        if (cast.kills >= 8) this.host.feedback(cast.kills, false);
        cast.active = false;
        for (const lane of this.lanes) if (lane.castId === cast.castId) { lane.castId = 0; lane.active = false; }
      }
    }
  }

  clear() {
    for (const cast of this.novas) { cast.active = false; cast.hits.clear(); cast.source = undefined; }
    for (const cast of this.barrages) { cast.active = false; cast.hits.clear(); cast.source = undefined; }
    for (const lane of this.lanes) { lane.active = false; lane.castId = 0; }
  }
  reset() {
    this.clear(); this.novaClock = this.barrageClock = this.patternIndex = 0;
    for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0;
  }
  inspect() { return { ...this.telemetry, reservedLanes: this.lanes.filter(l => l.castId > 0).length,
    activeLanes: this.lanes.filter(l => l.active).length,
    barrages: this.barrages.filter(c => c.active).map(c => ({ castId: c.castId, pattern: c.pattern, age: c.age, hits: c.hits.size })),
    novas: this.novas.filter(c => c.active).map(c => ({
    castId: c.castId, age: c.age, detonated: c.detonated, hits: c.hits.size, kills: c.kills, view: c.view,
  })) }; }
}
