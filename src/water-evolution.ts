import type { Enemy, ExperienceOrb } from './combat';
import type { PositionCast } from './position-aoe';
import type { RelicDamageSource } from './relics';
import type { CombinationSound } from './sound-design';

export const WATER_EVOLUTION_IDS = ['tsunami-sanctuary', 'astral-wheel', 'abyss-crown', 'undertow-pyre', 'deep-collapse', 'frost-prism', 'all-tides'] as const;
export type WaterEvolutionId = typeof WATER_EVOLUTION_IDS[number];
export const WATER_EVOLUTIONS = {
  'tsunami-sanctuary': { title: '海啸圣域', main: 'azure-burst', support: 'still-sea', requirement: '苍蓝震爆5级＋静海法阵3级', benefit: '震爆 → 残留领域 → 收尾冲击', description: '每8秒锁定敌群震爆，留下持续4秒的减速领域，结束后再扩张一圈冲击。' },
  'astral-wheel': { title: '星海天轮', main: 'star-tide', support: 'ice-radiance', requirement: '星潮脉冲5级＋冰棱放射3级', benefit: '三重扩张圆环 · 旋转冰棱齐射', description: '每6秒展开三道圆环，每圈起势后从中心补发12道冰棱；逐轮旋转方向，光束间保留空隙。' },
  'abyss-crown': { title: '深海王冠', main: 'returning-ring', support: 'abyss-vortex', requirement: '回流水环5级＋深渊漩涡3级', benefit: '随身外圈聚怪 · 内核周期重击', description: '随角色移动，外圈缓慢聚拢普通怪、弱吸引精英，首领不位移；内圈每0.8秒重击一次。' },
  'undertow-pyre': { title: '逆潮焚径', main: 'spore-trail', support: 'tidal-recall', requirement: '孢火足迹5级＋潮汐回收3级', benefit: '移动铺设毒焰 · 回潮引爆足迹', description: '移动留下毒焰，每7秒释放往返水浪；回潮扫过足迹时引爆并消耗它。每次最多引爆8块，同一目标最多受到2次足迹爆炸。' },
  'deep-collapse': { title: '深海坍缩', main: 'azure-burst', support: 'abyss-vortex', requirement: '苍蓝震爆5级＋深渊漩涡3级', benefit: '先聚拢敌群 · 中心坍缩重击', description: '每7秒在敌群中心放置漩涡，聚拢1.6秒后坍缩重击。普通怪受吸引，精英受弱吸引，首领不位移。' },
  'frost-prism': { title: '极寒棱镜', main: 'still-sea', support: 'ice-radiance', requirement: '静海法阵5级＋冰棱放射3级', benefit: '冰棱齐射 · 反射交叉火力', description: '每6.5秒留下法阵，四轮冰棱到达边缘后各反射一次，斜向穿过阵内。每轮6束，每阶段对目标只命中一次，反射不再派生反射。' },
  'all-tides': { title: '万潮归心', main: 'star-tide', support: 'tidal-recall', requirement: '星潮脉冲5级＋潮汐回收3级', benefit: '三重往返水环 · 归心收束爆发', description: '每7秒释放三道往返水环，各自去程、回程独立命中；回程吸引扫过的经验球，最后一圈归心时在角色周围爆发。' },
} as const;
export type AoeRanks = Partial<Record<string, number>>;
export function isWaterEvolution(id: string): id is WaterEvolutionId { return (WATER_EVOLUTION_IDS as readonly string[]).includes(id); }
export function evolutionReady(id: WaterEvolutionId, ranks: AoeRanks) {
  const recipe = WATER_EVOLUTIONS[id];
  return !(ranks[id]! > 0) && !consumedByEvolution(recipe.main, ranks) && !consumedByEvolution(recipe.support, ranks)
    && (ranks[recipe.main] ?? 0) >= 5 && (ranks[recipe.support] ?? 0) >= 3;
}
export function consumedByEvolution(id: string, ranks: AoeRanks) {
  return WATER_EVOLUTION_IDS.some(e => (ranks[e] ?? 0) > 0 && (WATER_EVOLUTIONS[e].main === id || WATER_EVOLUTIONS[e].support === id));
}

export const WATER_EVOLUTION_LIMITS = { sanctuary: 2, wheel: 2, crown: 1, combinations: 8, waves: 3, beams: 12, enemies: 256, ignitions: 8, ignitionHits: 2 } as const;
export function prismSegment(center: { x: number; z: number }, radius: number, round: number, beam: number, reflected: boolean) {
  const angle = round * .18 + beam * Math.PI / 3;
  return reflected ? { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius,
    angle: angle + Math.PI + Math.PI / 6, length: 2 * radius * Math.cos(Math.PI / 6) }
    : { x: center.x, z: center.z, angle, length: radius };
}
interface Sweep { radius: number; previous: number; x: number; z: number; previousX: number; previousZ: number; fired: boolean; reflected: boolean; hits: Int32Array; rayHits: Int32Array }
export interface EvolutionCast {
  active: boolean; kind: WaterEvolutionId; castId: number; x: number; z: number; age: number;
  duration: number; radius: number; damage: number; nextTick: number; detonated: boolean;
  closing: number; previousClosing: number; hits: Int32Array; finishHits: Int32Array;
  originX: number; originZ: number; triggers: number; ignitionIds: Int32Array; ignitionHits: Uint8Array;
  waves: Sweep[]; source?: RelicDamageSource;
}
interface Host {
  enemies(): readonly Enemy[]; origin(): { x: number; z: number }; nextCastId(): number;
  orbs(): readonly ExperienceOrb[]; trails(): readonly PositionCast[];
  source(damage: number, castId: number, element?: 'spore'): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  move(enemy: Enemy, dx: number, dz: number): void; slow(enemy: Enemy): void;
  sound(kind: 'water' | 'shockwave' | CombinationSound): void; feedback(kills: number): void;
}
/** Finite evolution stages, independent of GPU capacity and presentation clocks. */
export class WaterEvolution {
  readonly casts: EvolutionCast[] = WATER_EVOLUTION_IDS.flatMap(kind => Array.from({ length: kind === 'abyss-crown' ? 1 : 2 }, () => ({
    active: false, kind, castId: 0, x: 0, z: 0, age: 0, duration: 0, radius: 0, damage: 0, nextTick: 0,
    detonated: false, closing: 0, previousClosing: 0, hits: new Int32Array(256), finishHits: new Int32Array(256),
    originX: 0, originZ: 0, triggers: 0, ignitionIds: new Int32Array(256), ignitionHits: new Uint8Array(256),
    waves: Array.from({ length: 4 }, () => ({ radius: 0, previous: 0, x: 0, z: 0, previousX: 0, previousZ: 0, fired: false, reflected: false, hits: new Int32Array(256), rayHits: new Int32Array(256) })),
  })));
  readonly ignitions = Array.from({ length: 8 }, () => ({ active: false, x: 0, z: 0, age: 0 }));
  private clocks = Object.fromEntries(WATER_EVOLUTION_IDS.map(id => [id, 0])) as Record<WaterEvolutionId, number>;
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
    const p = position ?? (['tsunami-sanctuary', 'deep-collapse', 'frost-prism'].includes(kind) ? this.cluster() : this.host.origin());
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    const c = this.casts.find(c => c.kind === kind && !c.active);
    if (!c) { this.telemetry.denied++; return false; }
    Object.assign(c, { active: true, castId: this.host.nextCastId(), x: p.x, z: p.z, age: 0,
      duration: kind === 'tsunami-sanctuary' ? 5.3 : kind === 'astral-wheel' ? 2.8 : kind === 'deep-collapse' ? 2.4 : kind === 'frost-prism' ? 4.6 : kind === 'undertow-pyre' ? 2.5 : kind === 'all-tides' ? 3.05 : 4,
      radius: kind === 'tsunami-sanctuary' ? 5.6 : kind === 'astral-wheel' ? 8 : kind === 'frost-prism' ? 5.4 : kind === 'all-tides' ? 8 : kind === 'undertow-pyre' ? 7.5 : 6.2,
      damage: multiplier, nextTick: kind === 'abyss-crown' ? .8 : kind === 'tsunami-sanctuary' ? .66 : .5, detonated: false, closing: 0, previousClosing: 0,
      originX: p.x, originZ: p.z, triggers: 0 });
    c.hits.fill(0); c.finishHits.fill(0);
    c.ignitionIds.fill(0); c.ignitionHits.fill(0);
    for (const w of c.waves) { w.radius = w.previous = 0; w.x = w.previousX = p.x; w.z = w.previousZ = p.z; w.fired = w.reflected = false; w.hits.fill(0); w.rayHits.fill(0); }
    c.source = this.host.source(32 * multiplier, c.castId); this.telemetry.casts++;
    if (kind === 'deep-collapse') this.host.sound('vortex-charge');
    return true;
  }
  update(dt: number, ranks: AoeRanks, multiplier: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const kills = this.telemetry.kills;
    for (const effect of this.ignitions) if (effect.active) { effect.age += dt; if (effect.age >= .5) effect.active = false; }
    for (const id of WATER_EVOLUTION_IDS) {
      if (!((ranks[id] ?? 0) > 0)) continue;
      this.clocks[id] -= dt;
      if (this.clocks[id] <= 0 && (id !== 'abyss-crown' || !this.casts.some(c => c.active && c.kind === id)) && this.cast(id, multiplier))
        this.clocks[id] = id === 'tsunami-sanctuary' ? 8 : id === 'astral-wheel' ? 6 : id === 'frost-prism' ? 6.5 : id === 'abyss-crown' ? 0 : 7;
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
      } else if (c.kind === 'deep-collapse') {
        const pullTime = Math.max(0, Math.min(c.age, 1.6) - Math.min(before, 1.6));
        this.each(e => {
          const dx = c.x - e.x, dz = c.z - e.z, d = Math.hypot(dx, dz);
          if (e.rank === 'boss' || d <= .3 || d > c.radius) return;
          const step = Math.min(d - .3, (e.rank === 'elite' ? .35 : 1.5) * pullTime);
          this.host.move(e, dx / d * step, dz / d * step);
        });
        while (c.nextTick <= Math.min(c.age, 1.6) + 1e-8) { this.disk(c, c.radius, 10); c.nextTick += .5; }
        if (!c.detonated && c.age >= 1.6) { c.detonated = true; this.disk(c, 5.2, 160, c.hits); this.host.sound('collapse-impact'); }
      } else if (c.kind === 'frost-prism') {
        while (c.nextTick <= Math.min(c.age, 4.2) + 1e-8) { this.disk(c, c.radius, 12, undefined, true); c.nextTick += .5; }
        for (let i = 0; i < 4; i++) {
          const age = c.age - i, w = c.waves[i];
          if (!w.fired && age + 1e-8 >= .25) { w.fired = true; this.prismRays(c, i, false); }
          if (!w.reflected && age + 1e-8 >= .55) { w.reflected = true; this.prismRays(c, i, true); }
        }
      } else if (c.kind === 'undertow-pyre' || c.kind === 'all-tides') {
        this.recall(c, before);
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
  private prismRays(c: EvolutionCast, round: number, reflected: boolean) {
    const ids = reflected ? c.waves[round].rayHits : c.waves[round].hits, damage = reflected ? 32 : 26;
    const source = this.eventSource(c, damage);
    this.each((e, index) => {
      if (ids[index] === e.id) return;
      for (let i = 0; i < 6; i++) {
        const ray = prismSegment(c, c.radius, round, i, reflected), dx = e.x - ray.x, dz = e.z - ray.z;
        const along = dx * Math.cos(ray.angle) + dz * Math.sin(ray.angle);
        const side = -dx * Math.sin(ray.angle) + dz * Math.cos(ray.angle);
        if (along < .25 || along > ray.length || Math.abs(side) > .3) continue;
        ids[index] = e.id; this.hit(c, e, damage, source); break;
      }
    });
    this.telemetry.rayRounds++; this.host.sound(reflected ? 'prism-reflect' : 'prism-shot');
  }
  private swept(w: Sweep, p: { x: number; z: number }) {
    const before = Math.hypot(p.x - w.previousX, p.z - w.previousZ) - w.previous;
    const after = Math.hypot(p.x - w.x, p.z - w.z) - w.radius;
    return before * after <= 0 || Math.abs(after) <= .25;
  }
  private recall(c: EvolutionCast, before: number) {
    const triple = c.kind === 'all-tides', duration = triple ? 1.8 : 2.2, half = duration / 2;
    const origin = this.host.origin();
    for (let i = 0; i < (triple ? 3 : 1); i++) {
      const start = i * .4, from = Math.max(0, before - start), to = Math.min(duration, c.age - start), w = c.waves[i];
      if (to <= 0 || from >= duration || to <= from) continue;
      const stages = from < half && to > half ? [half, to] : [to];
      for (const age of stages) {
        w.previous = w.radius; w.previousX = w.x; w.previousZ = w.z;
        const returning = age > half, progress = returning ? (age - half) / half : age / half;
        w.radius = c.radius * (returning ? 1 - progress : progress);
        w.x = c.originX + (returning ? (origin.x - c.originX) * progress : 0);
        w.z = c.originZ + (returning ? (origin.z - c.originZ) * progress : 0);
        const ids = returning ? w.rayHits : w.hits, source = this.eventSource(c, triple ? 30 : 28);
        this.each((e, index) => {
          if (ids[index] === e.id || !this.swept(w, e)) return;
          ids[index] = e.id; this.hit(c, e, triple ? 30 : 28, source);
        });
        if (returning) {
          for (const orb of this.host.orbs()) if (orb.active && !orb.magnetized && this.swept(w, orb)) orb.magnetized = true;
          if (!triple) this.igniteTrails(c, w);
        }
      }
      if (from <= half && to > half) this.host.sound('tide-return');
      else if (from === 0) this.host.sound('water');
    }
    if (triple && !c.detonated && c.age + 1e-8 >= 2.6) {
      c.detonated = true; Object.assign(c, origin); this.disk(c, 3.5, 90, c.finishHits); this.host.sound('tide-finish');
    }
  }
  private igniteTrails(c: EvolutionCast, w: Sweep) {
    for (const trail of this.host.trails()) {
      if (c.triggers >= WATER_EVOLUTION_LIMITS.ignitions) break;
      if (!trail.active || trail.kind !== 'spore-trail' || !this.swept(w, trail)) continue;
      trail.active = false; trail.source = undefined; c.triggers++;
      const source = this.eventSource(c, 72, true);
      this.each((e, index) => {
        if (Math.hypot(e.x - trail.x, e.z - trail.z) > 2.4) return;
        if (c.ignitionIds[index] !== e.id) { c.ignitionIds[index] = e.id; c.ignitionHits[index] = 0; }
        if (c.ignitionHits[index] >= WATER_EVOLUTION_LIMITS.ignitionHits) return;
        c.ignitionHits[index]++; this.hit(c, e, 72, source);
      });
      // A saturated visual pool only drops decoration, never the explosion above.
      const effect = this.ignitions.find(e => !e.active);
      if (effect) Object.assign(effect, { active: true, x: trail.x, z: trail.z, age: 0 });
      this.host.sound('spore-ignite');
    }
  }
  private each(visit: (e: Enemy, index: number) => void) {
    const enemies = this.host.enemies();
    for (const boss of [false, true]) for (let i = 0; i < enemies.length; i++)
      if (this.eligible(enemies[i]) && (enemies[i].rank === 'boss') === boss) visit(enemies[i], i);
  }
  private eventSource(c: EvolutionCast, damage: number, spore = false): RelicDamageSource {
    return { ...(spore ? this.host.source(damage * c.damage, c.castId, 'spore') : c.source!), rootDamage: damage * c.damage,
      areaBudget: { nodes: 0, hits: new Map(), shared: c.source!.areaBudget!.shared } };
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
  clear() { for (const c of this.casts) { c.active = false; c.source = undefined; } for (const effect of this.ignitions) effect.active = false; }
  reset() { this.clear(); for (const id of WATER_EVOLUTION_IDS) this.clocks[id] = 0; for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0; }
  inspect() { return { ...this.telemetry, capacity: this.casts.length, active: this.casts.filter(c => c.active).map(c => ({ kind: c.kind, castId: c.castId, age: c.age, x: c.x, z: c.z, closing: c.closing, radius: c.radius, reactionNodes: c.source?.areaBudget?.shared?.nodes ?? 0 })) }; }
}
