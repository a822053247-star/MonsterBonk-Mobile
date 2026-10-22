import type { Enemy } from './combat';
import type { RelicDamageSource } from './relics';

export const WATER_EVOLUTION_IDS = ['tsunami-sanctuary', 'astral-wheel', 'abyss-crown'] as const;
export type WaterEvolutionId = typeof WATER_EVOLUTION_IDS[number];
export const WATER_EVOLUTIONS = {
  'tsunami-sanctuary': { title: '海啸圣域', main: 'azure-burst', support: 'still-sea', requirement: '苍蓝震爆5级＋静海法阵3级', benefit: '震爆 → 残留领域 → 收尾冲击', description: '每8秒锁定敌群震爆，留下持续4秒的减速领域，结束后再扩张一圈冲击。' },
  'astral-wheel': { title: '星海天轮', main: 'star-tide', support: 'ice-radiance', requirement: '星潮脉冲5级＋冰棱放射3级', benefit: '三重扩张圆环 · 旋转冰棱齐射', description: '每6秒展开三道圆环，每圈起势后从中心补发12道冰棱；逐轮旋转方向，光束间保留空隙。' },
  'abyss-crown': { title: '深海王冠', main: 'returning-ring', support: 'abyss-vortex', requirement: '回流水环5级＋深渊漩涡3级', benefit: '随身外圈聚怪 · 内核周期重击', description: '随角色移动，外圈缓慢聚拢普通怪、弱吸引精英，首领不位移；内圈每0.8秒重击一次。' },
} as const;
export type AoeRanks = Partial<Record<string, number>>;
export function isWaterEvolution(id: string): id is WaterEvolutionId { return (WATER_EVOLUTION_IDS as readonly string[]).includes(id); }
export function evolutionReady(id: WaterEvolutionId, ranks: AoeRanks) {
  const recipe = WATER_EVOLUTIONS[id];
  return !(ranks[id]! > 0) && (ranks[recipe.main] ?? 0) >= 5 && (ranks[recipe.support] ?? 0) >= 3;
}
export function consumedByEvolution(id: string, ranks: AoeRanks) {
  return WATER_EVOLUTION_IDS.some(e => (ranks[e] ?? 0) > 0 && (WATER_EVOLUTIONS[e].main === id || WATER_EVOLUTIONS[e].support === id));
}

export const WATER_EVOLUTION_LIMITS = { sanctuary: 2, wheel: 2, crown: 1, waves: 3, beams: 12, enemies: 256 } as const;
interface Sweep { radius: number; previous: number; fired: boolean; hits: Int32Array; rayHits: Int32Array }
export interface EvolutionCast {
  active: boolean; kind: WaterEvolutionId; castId: number; x: number; z: number; age: number;
  duration: number; radius: number; damage: number; nextTick: number; detonated: boolean;
  closing: number; previousClosing: number; hits: Int32Array; finishHits: Int32Array;
  waves: Sweep[]; source?: RelicDamageSource;
}
interface Host {
  enemies(): readonly Enemy[]; origin(): { x: number; z: number }; nextCastId(): number;
  source(damage: number, castId: number): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  move(enemy: Enemy, dx: number, dz: number): void; slow(enemy: Enemy): void;
  sound(kind: 'water' | 'shockwave'): void; feedback(kills: number): void;
}
/** Finite evolution stages, independent of GPU capacity and presentation clocks. */
export class WaterEvolution {
  readonly casts: EvolutionCast[] = WATER_EVOLUTION_IDS.flatMap(kind => Array.from({ length: kind === 'abyss-crown' ? 1 : 2 }, () => ({
    active: false, kind, castId: 0, x: 0, z: 0, age: 0, duration: 0, radius: 0, damage: 0, nextTick: 0,
    detonated: false, closing: 0, previousClosing: 0, hits: new Int32Array(256), finishHits: new Int32Array(256),
    waves: Array.from({ length: 3 }, () => ({ radius: 0, previous: 0, fired: false, hits: new Int32Array(256), rayHits: new Int32Array(256) })),
  })));
  private clocks: Record<WaterEvolutionId, number> = { 'tsunami-sanctuary': 0, 'astral-wheel': 0, 'abyss-crown': 0 };
  readonly telemetry = { casts: 0, hits: 0, kills: 0, denied: 0, rayRounds: 0 };
  constructor(private host: Host) {}
  private cluster() {
    const p = this.host.origin(), candidates = this.host.enemies().filter(e => this.eligible(e) && Math.hypot(e.x - p.x, e.z - p.z) <= 14);
    let best: Enemy | undefined, score = -1;
    for (let i = 0; i < candidates.length; i += Math.max(1, Math.ceil(candidates.length / 16))) {
      const e = candidates[i]; let count = 0;
      for (const other of candidates) if (Math.hypot(e.x - other.x, e.z - other.z) <= 5.6) count++;
      if (count > score) { score = count; best = e; }
    }
    return best ? { x: best.x, z: best.z } : undefined;
  }
  cast(kind: WaterEvolutionId, multiplier = 1, position?: { x: number; z: number }) {
    if (!isWaterEvolution(kind) || !Number.isFinite(multiplier) || multiplier <= 0) return false;
    const p = position ?? (kind === 'tsunami-sanctuary' ? this.cluster() : this.host.origin());
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    const c = this.casts.find(c => c.kind === kind && !c.active);
    if (!c) { this.telemetry.denied++; return false; }
    Object.assign(c, { active: true, castId: this.host.nextCastId(), x: p.x, z: p.z, age: 0,
      duration: kind === 'tsunami-sanctuary' ? 5.3 : kind === 'astral-wheel' ? 2.8 : 4,
      radius: kind === 'tsunami-sanctuary' ? 5.6 : kind === 'astral-wheel' ? 8 : 6.2,
      damage: multiplier, nextTick: kind === 'abyss-crown' ? .8 : .66, detonated: false, closing: 0, previousClosing: 0 });
    c.hits.fill(0); c.finishHits.fill(0);
    for (const w of c.waves) { w.radius = w.previous = 0; w.fired = false; w.hits.fill(0); w.rayHits.fill(0); }
    c.source = this.host.source(32 * multiplier, c.castId); this.telemetry.casts++;
    return true;
  }
  update(dt: number, ranks: AoeRanks, multiplier: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const kills = this.telemetry.kills;
    for (const id of WATER_EVOLUTION_IDS) {
      if (!((ranks[id] ?? 0) > 0)) continue;
      this.clocks[id] -= dt;
      if (this.clocks[id] <= 0 && (id !== 'abyss-crown' || !this.casts.some(c => c.active && c.kind === id)) && this.cast(id, multiplier))
        this.clocks[id] = id === 'tsunami-sanctuary' ? 8 : id === 'astral-wheel' ? 6 : 0;
    }
    for (const c of this.casts) {
      if (!c.active) continue;
      const before = c.age; c.age = Math.min(c.duration, c.age + dt);
      if (c.kind === 'tsunami-sanctuary') {
        if (!c.detonated && c.age >= .16) { c.detonated = true; this.disk(c, c.radius, 112, c.hits); this.host.sound('water'); }
        while (c.nextTick <= Math.min(c.age, 4.16) + 1e-8) {
          this.disk(c, c.radius, 18, undefined, true); c.nextTick += .5;
        }
        if (c.age > 4.16) {
          c.previousClosing = c.closing; c.closing = Math.min(7.2, (c.age - 4.16) / .85 * 7.2);
          this.ring(c, c.previousClosing, c.closing, c.finishHits, 64);
          if (before <= 4.16) this.host.sound('shockwave');
        }
      } else if (c.kind === 'astral-wheel') {
        for (let i = 0; i < 3; i++) {
          const age = c.age - i * .65, w = c.waves[i]; if (age <= 0) continue;
          if (w.radius < c.radius) {
            w.previous = w.radius; w.radius = Math.min(c.radius, age / .9 * c.radius);
            this.ring(c, w.previous, w.radius, w.hits, 36);
            if (w.previous === 0) this.host.sound('water');
          }
          if (!w.fired && age + 1e-8 >= .18) {
            w.fired = true; const source = this.eventSource(c, 32), angle = i * Math.PI / 12, step = Math.PI * 2 / 12;
            this.each((e, index) => {
              if (w.rayHits[index] === e.id) return;
              const dx = e.x - c.x, dz = e.z - c.z, distance = Math.hypot(dx, dz), a = Math.atan2(dz, dx) - angle;
              const offset = a - Math.round(a / step) * step, along = Math.cos(offset) * distance;
              if (along < .4 || along > c.radius || Math.abs(Math.sin(offset) * distance) > .3) return;
              w.rayHits[index] = e.id; this.hit(c, e, 32, source);
            });
            this.telemetry.rayRounds++; this.host.sound('shockwave');
          }
        }
      } else {
        Object.assign(c, this.host.origin());
        this.each(e => {
          if (e.rank === 'boss') return;
          const dx = c.x - e.x, dz = c.z - e.z, distance = Math.hypot(dx, dz);
          if (distance <= 2.4 || distance > c.radius) return;
          const movement = Math.min(distance - 2.4, (e.rank === 'elite' ? .2 : .9) * (c.age - before));
          this.host.move(e, dx / distance * movement, dz / distance * movement);
        });
        while (c.nextTick <= c.age + 1e-8) { this.disk(c, 2.4, 52, undefined, true); c.nextTick += .8; this.host.sound('shockwave'); }
      }
      if (c.age >= c.duration) c.active = false;
    }
    if (this.telemetry.kills - kills >= 8) this.host.feedback(this.telemetry.kills - kills);
  }
  private eligible(e: Enemy) { return e.active && e.hp > 0 && e.spawnTime <= 0; }
  private each(visit: (e: Enemy, index: number) => void) {
    const enemies = this.host.enemies();
    for (const boss of [false, true]) for (let i = 0; i < enemies.length; i++)
      if (this.eligible(enemies[i]) && (enemies[i].rank === 'boss') === boss) visit(enemies[i], i);
  }
  private eventSource(c: EvolutionCast, damage: number): RelicDamageSource {
    return { ...c.source!, rootDamage: damage * c.damage, areaBudget: { nodes: 0, hits: new Map(), shared: c.source!.areaBudget!.shared } };
  }
  private disk(c: EvolutionCast, radius: number, damage: number, ids?: Int32Array, slow = false) {
    const source = this.eventSource(c, damage);
    this.each((e, i) => {
      if (Math.hypot(e.x - c.x, e.z - c.z) > radius || ids?.[i] === e.id) return;
      if (ids) ids[i] = e.id; this.hit(c, e, damage, source); if (e.active && slow) this.host.slow(e);
    });
  }
  private ring(c: EvolutionCast, before: number, after: number, ids: Int32Array, damage: number) {
    const source = this.eventSource(c, damage);
    this.each((e, i) => {
      const distance = Math.hypot(e.x - c.x, e.z - c.z);
      if (ids[i] === e.id || distance < Math.max(0, before - .25) || distance > after + .25) return;
      ids[i] = e.id; this.hit(c, e, damage, source);
    });
  }
  private hit(c: EvolutionCast, e: Enemy, damage: number, source: RelicDamageSource) {
    this.host.damage(e, damage * c.damage * (e.rank === 'boss' ? .4 : e.rank === 'elite' ? .7 : 1), source);
    this.telemetry.hits++; if (e.hp <= 0) this.telemetry.kills++;
  }
  clear() { for (const c of this.casts) { c.active = false; c.source = undefined; } }
  reset() { this.clear(); for (const id of WATER_EVOLUTION_IDS) this.clocks[id] = 0; for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0; }
  inspect() { return { ...this.telemetry, capacity: this.casts.length, active: this.casts.filter(c => c.active).map(c => ({ kind: c.kind, castId: c.castId, age: c.age, x: c.x, z: c.z, closing: c.closing, radius: c.radius, reactionNodes: c.source?.areaBudget?.shared?.nodes ?? 0 })) }; }
}
