import type { Enemy } from './combat';
import type { RelicDamageSource } from './relics';

export const WATER_AOE_IDS = ['azure-burst', 'star-tide', 'still-sea', 'returning-ring'] as const;
export type WaterSkill = typeof WATER_AOE_IDS[number];
export const WATER_LIMITS = { enemies: 256, burst: 2, pulse: 2, fields: 2, aura: 1, waves: 3, tick: .5 } as const;
export const WATER_NAMES: Record<WaterSkill, string> = {
  'azure-burst': '苍蓝震爆', 'star-tide': '星潮脉冲', 'still-sea': '静海法阵', 'returning-ring': '回流水环',
};
export function waterStats(id: WaterSkill, rank: number) {
  const level = Math.max(1, Math.min(5, Math.floor(rank))), growth = level - 1;
  switch (id) {
    case 'azure-burst': return { radius: 3.5 + growth * .425, damage: 52 * (1 + growth * .18), interval: 4.5, duration: .9, waves: 1 };
    case 'star-tide': {
      const waves = level >= 5 ? 3 : level >= 3 ? 2 : 1;
      return { radius: 4.2 + growth * .35, damage: 18 * (1 + growth * .15), interval: 5.8, duration: .95 + (waves - 1) * .22, waves };
    }
    case 'still-sea': return { radius: 3.0 + growth * .2, damage: 7 * (1 + growth * .2), interval: 6.5, duration: 4 + growth * .4, waves: 1 };
    case 'returning-ring': return { radius: 1.9 + growth * .2, damage: 5 * (1 + growth * .2), interval: 0, duration: 4, waves: 1 };
  }
}
interface Wave { radius: number; previousRadius: number; hits: Int32Array; source?: RelicDamageSource }
export interface WaterCast {
  active: boolean; kind: WaterSkill; castId: number; x: number; z: number; age: number;
  radius: number; damage: number; duration: number; nextTick: number; waveCount: number;
  detonated: boolean; hits: Int32Array; waves: Wave[]; source?: RelicDamageSource;
}
interface WaterHost {
  enemies(): readonly Enemy[];
  origin(): { x: number; z: number };
  nextCastId(): number;
  source(damage: number, castId: number): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  control(enemy: Enemy, slow: boolean, pushX: number, pushZ: number): void;
  sound(kind: 'water' | 'shockwave'): void;
  feedback(kills: number): void;
}

/** Pure fixed-step simulation: one-shot disk, swept annuli, stationary tick field, following aura. */
export class WaterAoe {
  readonly casts: WaterCast[] = WATER_AOE_IDS.flatMap(kind => Array.from({ length:
    kind === 'azure-burst' ? WATER_LIMITS.burst : kind === 'star-tide' ? WATER_LIMITS.pulse : kind === 'still-sea' ? WATER_LIMITS.fields : WATER_LIMITS.aura,
  }, () => ({ active: false, kind, castId: 0, x: 0, z: 0, age: 0, radius: 0, damage: 0, duration: 0,
    nextTick: WATER_LIMITS.tick as number, waveCount: 1, detonated: false, hits: new Int32Array(WATER_LIMITS.enemies),
    waves: Array.from({ length: WATER_LIMITS.waves }, () => ({ radius: 0, previousRadius: 0, hits: new Int32Array(WATER_LIMITS.enemies) })),
  })));
  private clocks: Record<WaterSkill, number> = { 'azure-burst': 0, 'star-tide': 0, 'still-sea': 0, 'returning-ring': 0 };
  private elapsed = 0;
  private fieldIds = new Int32Array(WATER_LIMITS.enemies);
  private fieldReady = new Float64Array(WATER_LIMITS.enemies);
  readonly telemetry = { casts: 0, hits: 0, kills: 0, denied: 0 };
  constructor(private host: WaterHost) {}

  /** Score at most sixteen candidates against the fixed enemy pool. */
  private cluster(radius: number) {
    const origin = this.host.origin(), enemies = this.host.enemies();
    const candidates = enemies.filter(e => e.active && e.hp > 0 && e.spawnTime <= 0 && Math.hypot(e.x - origin.x, e.z - origin.z) <= 14);
    let best: Enemy | undefined, score = -1, distance = Infinity;
    for (let i = 0; i < candidates.length; i += Math.max(1, Math.ceil(candidates.length / 16))) {
      const candidate = candidates[i], d = Math.hypot(candidate.x - origin.x, candidate.z - origin.z);
      let count = 0;
      for (const enemy of candidates) if (Math.hypot(candidate.x - enemy.x, candidate.z - enemy.z) <= radius) count++;
      if (count > score || count === score && d < distance) { best = candidate; score = count; distance = d; }
    }
    return best ? { x: best.x, z: best.z } : undefined;
  }
  cast(kind: WaterSkill, rank = 1, multiplier = 1, position?: { x: number; z: number }) {
    if (!WATER_AOE_IDS.includes(kind) || !Number.isFinite(rank) || rank <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return false;
    const stats = waterStats(kind, rank);
    const target = position ?? (kind === 'azure-burst' || kind === 'still-sea' ? this.cluster(stats.radius) : this.host.origin());
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return false;
    const cast = this.casts.find(c => c.kind === kind && !c.active);
    if (!cast) { this.telemetry.denied++; return false; }
    Object.assign(cast, { active: true, castId: this.host.nextCastId(), x: target.x, z: target.z, age: 0,
      radius: stats.radius, damage: stats.damage * multiplier, duration: stats.duration, nextTick: WATER_LIMITS.tick,
      waveCount: stats.waves, detonated: false });
    cast.hits.fill(0);
    for (const wave of cast.waves) { wave.radius = wave.previousRadius = 0; wave.hits.fill(0); wave.source = undefined; }
    cast.source = this.host.source(cast.damage, cast.castId);
    this.telemetry.casts++;
    return true;
  }

  update(dt: number, ranks: Partial<Record<WaterSkill, number>>, multiplier: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const killsBefore = this.telemetry.kills;
    this.elapsed += dt;
    for (const kind of WATER_AOE_IDS) {
      const rank = ranks[kind] ?? 0;
      if (rank <= 0) continue;
      this.clocks[kind] -= dt;
      if (kind === 'returning-ring') {
        if (!this.casts.some(c => c.active && c.kind === kind)) this.cast(kind, rank, multiplier);
      } else if (this.clocks[kind] <= 0 && this.cast(kind, rank, multiplier)) this.clocks[kind] = waterStats(kind, rank).interval;
    }
    for (const cast of this.casts) {
      if (!cast.active) continue;
      cast.age = Math.min(cast.duration, cast.age + dt);
      if (cast.kind === 'returning-ring') Object.assign(cast, this.host.origin());
      if (cast.kind === 'azure-burst') {
        if (!cast.detonated && cast.age >= .16) {
          cast.detonated = true; this.disk(cast, this.tickSource(cast), false); this.host.sound('water');
        }
      } else if (cast.kind === 'star-tide') {
        for (let i = 0; i < cast.waveCount; i++) {
          const age = cast.age - i * .22, wave = cast.waves[i];
          if (age <= 0 || wave.radius >= cast.radius) continue;
          const source = wave.source ??= this.tickSource(cast);
          wave.previousRadius = wave.radius;
          wave.radius = Math.min(cast.radius, age / .75 * cast.radius);
          // The complete previous-to-current annular sweep is tested, including coarse simulation steps.
          const enemies = this.host.enemies();
          for (const bossPass of [false, true]) for (let index = 0; index < enemies.length; index++) {
            const e = enemies[index];
            if (!this.eligible(e) || (e.rank === 'boss') !== bossPass || wave.hits[index] === e.id) continue;
            const dx = e.x - cast.x, dz = e.z - cast.z, distance = Math.hypot(dx, dz);
            if (distance < Math.max(0, wave.previousRadius - .25) || distance > wave.radius + .25) continue;
            wave.hits[index] = e.id;
            this.hit(cast, e, source);
            if (e.active) this.host.control(e, false, dx / Math.max(.001, distance) * .35, dz / Math.max(.001, distance) * .35);
          }
          if (wave.previousRadius === 0) this.host.sound('shockwave');
        }
      } else {
        while (cast.nextTick <= cast.age + 1e-8) {
          const source = this.tickSource(cast);
          this.disk(cast, source, true, this.elapsed - cast.age + cast.nextTick);
          cast.nextTick += WATER_LIMITS.tick;
        }
      }
      if (cast.age >= cast.duration) cast.active = false;
    }
    if (this.telemetry.kills - killsBefore >= 8) this.host.feedback(this.telemetry.kills - killsBefore);
  }
  private eligible(enemy: Enemy) { return enemy.active && enemy.hp > 0 && enemy.spawnTime <= 0; }
  private tickSource(cast: WaterCast): RelicDamageSource {
    // Every scheduled tick gets independent hit accounting; all ticks share the cast's reaction-node budget.
    return { ...cast.source!, areaBudget: { nodes: 0, hits: new Map(), shared: cast.source!.areaBudget!.shared } };
  }
  private disk(cast: WaterCast, source: RelicDamageSource, repeated: boolean, tickTime = this.elapsed) {
    const enemies = this.host.enemies();
    for (const bossPass of [false, true]) for (let index = 0; index < enemies.length; index++) {
      const e = enemies[index];
      if (!this.eligible(e) || (e.rank === 'boss') !== bossPass || Math.hypot(e.x - cast.x, e.z - cast.z) > cast.radius) continue;
      if (!repeated && cast.hits[index] === e.id) continue;
      if (cast.kind === 'still-sea') {
        if (this.fieldIds[index] === e.id && this.fieldReady[index] > tickTime + 1e-8) continue;
        this.fieldIds[index] = e.id; this.fieldReady[index] = tickTime + WATER_LIMITS.tick;
      }
      cast.hits[index] = e.id; this.hit(cast, e, source);
      if (e.active && repeated) this.host.control(e, true, 0, 0);
    }
  }
  private hit(cast: WaterCast, enemy: Enemy, source: RelicDamageSource) {
    this.host.damage(enemy, cast.damage * (enemy.rank === 'boss' ? (cast.kind === 'azure-burst' ? .55 : cast.kind === 'star-tide' ? .50 : .45) : enemy.rank === 'elite' ? .7 : 1), source);
    this.telemetry.hits++;
    if (enemy.hp <= 0) this.telemetry.kills++;
  }
  clear() {
    for (const cast of this.casts) { cast.active = false; cast.source = undefined; cast.hits.fill(0); for (const wave of cast.waves) wave.source = undefined; }
    this.fieldIds.fill(0); this.fieldReady.fill(0);
  }
  reset() {
    this.clear(); this.elapsed = 0;
    for (const id of WATER_AOE_IDS) this.clocks[id] = 0;
    this.telemetry.casts = this.telemetry.hits = this.telemetry.kills = this.telemetry.denied = 0;
  }
  inspect() { return { ...this.telemetry, capacity: this.casts.length, active: this.casts.filter(c => c.active).map(c => ({
    kind: c.kind, castId: c.castId, x: c.x, z: c.z, age: c.age, radius: c.radius, waves: c.waveCount,
    reactionNodes: c.source?.areaBudget?.shared?.nodes ?? 0,
  })) }; }
}
