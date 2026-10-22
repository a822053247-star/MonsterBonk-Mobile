import type { Enemy } from './combat';
import type { RelicDamageSource } from './relics';

export const DREAM_RULES = { markDuration: 4, resonanceDuration: 4, resonanceCap: 6, linkRange: 4,
  linkTargets: 3, transfer: .65, bloom: 1.6, bloomRadius: 2.2, effects: 64, queued: 64, wavesPerTick: 32 } as const;
export const isDreamWeapon = (id?: string) => id === 'dream-dart' || id === 'resonance-seed';
export function seedPierces(level: number) { return 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0); }
export function dreamEchoStats(rank: number) {
  const n = Math.max(0, Math.min(4, Math.floor(rank) - 1));
  return { damage: 16 * (1 + n * .2), radius: 2 + n * .12, interval: 4.6 - n * .2, extension: 1 + n * .15 };
}
interface DreamHost {
  enemies(): readonly Enemy[]; origin(): { x: number; z: number }; stopped(): boolean;
  radius(enemy: Enemy): number; covered(x: number, z: number, tx: number, tz: number): boolean;
  source(damage: number): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  sound(): void;
}
interface DreamEvent { active: boolean; kind: 'impact' | 'bloom' | 'pulse' | 'link'; x: number; z: number;
  tx: number; tz: number; age: number; duration: number; radius: number; seed: number }
interface DreamWave { kind: 'bloom' | 'pulse' | 'resonance'; x: number; z: number; radius: number; damage: number;
  source: RelicDamageSource; targets?: number[]; extension?: number }

/** Marks belong to enemy IDs; derived waves are queued, so deaths never recurse through damage. */
export class DreamCombat {
  readonly events: DreamEvent[] = Array.from({ length: DREAM_RULES.effects }, () => ({ active: false,
    kind: 'impact', x: 0, z: 0, tx: 0, tz: 0, age: 0, duration: .3, radius: 0, seed: 0 }));
  readonly telemetry = { dreamHits: 0, seedHits: 0, blooms: 0, transfers: 0, transferHits: 0, pulses: 0, extensions: 0, denied: 0 };
  private pending: DreamWave[] = [];
  private echoClock = 0;
  private serial = 0;
  constructor(private host: DreamHost) {}
  tickEnemy(enemy: Enemy, dt: number) {
    enemy.dreamTime = Math.max(0, (enemy.dreamTime ?? 0) - dt);
    if (!enemy.dreamTime) enemy.dreamStacks = 0;
    enemy.resonanceTime = Math.max(0, (enemy.resonanceTime ?? 0) - dt);
    if (!enemy.resonanceTime) enemy.resonanceSource = undefined;
  }
  hit(enemy: Enemy, damage: number, source: RelicDamageSource) {
    if (!enemy.active || enemy.spawnTime > 0 || source.suppressRelics || source.behavior || source.flowerDerived
      || source.kind !== 'hit' || !isDreamWeapon(source.attackId)) return;
    this.effect('impact', enemy.x, enemy.z, .6);
    if (source.attackId === 'dream-dart') {
      this.telemetry.dreamHits++;
      enemy.dreamStacks = Math.min(3, (enemy.dreamStacks ?? 0) + 1); enemy.dreamTime = DREAM_RULES.markDuration;
      if (enemy.dreamStacks === 3) {
        enemy.dreamStacks = 0; enemy.dreamTime = 0;
        const radius = DREAM_RULES.bloomRadius * Math.min(1.6, source.rules.areaMultiplier);
        if (this.enqueue({ kind: 'bloom', x: enemy.x, z: enemy.z, radius, damage: damage * DREAM_RULES.bloom,
          source: this.derived(source, 'bloom') })) {
          this.telemetry.blooms++; this.effect('bloom', enemy.x, enemy.z, radius); this.host.sound();
        }
      }
    } else {
      this.telemetry.seedHits++; enemy.resonanceTime = DREAM_RULES.resonanceDuration;
      enemy.resonanceSource = { ...source, rootDamage: damage };
    }
  }
  killed(enemy: Enemy, source?: RelicDamageSource) {
    if ((enemy.resonanceTime ?? 0) > 0 && enemy.resonanceSource && source?.flowerDerived !== 'resonance') {
      const targets = this.host.enemies().filter(e => e !== enemy && e.active && e.hp > 0 && e.spawnTime <= 0
        && (e.resonanceTime ?? 0) > 0 && Math.hypot(e.x - enemy.x, e.z - enemy.z) <= DREAM_RULES.linkRange
        && !this.host.covered(enemy.x, enemy.z, e.x, e.z))
        .sort((a, b) => Math.hypot(a.x - enemy.x, a.z - enemy.z) - Math.hypot(b.x - enemy.x, b.z - enemy.z) || a.id - b.id)
        .slice(0, DREAM_RULES.linkTargets).map(e => e.id);
      const snapshot = enemy.resonanceSource;
      if (targets.length && this.enqueue({ kind: 'resonance', x: enemy.x, z: enemy.z, radius: DREAM_RULES.linkRange,
        damage: (snapshot.rootDamage ?? 0) * DREAM_RULES.transfer, targets, source: this.derived(snapshot, 'resonance') }))
        this.telemetry.transfers++;
    }
    this.resetEnemy(enemy);
  }
  update(dt: number, echoRank: number, multiplier: number) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    for (const event of this.events) if (event.active) { event.age += dt; if (event.age >= event.duration) event.active = false; }
    if (this.host.stopped()) { this.clear(); return; }
    this.echoClock -= dt;
    if (echoRank > 0 && this.echoClock <= 0) {
      const p = this.host.origin(), stats = dreamEchoStats(echoRank);
      const target = this.host.enemies().filter(e => e.active && e.hp > 0 && e.spawnTime <= 0
        && ((e.dreamTime ?? 0) > 0 || (e.resonanceTime ?? 0) > 0)
        && Math.hypot(e.x - p.x, e.z - p.z) <= 10 && !this.host.covered(p.x, p.z, e.x, e.z))
        .sort((a, b) => (b.dreamStacks ?? 0) - (a.dreamStacks ?? 0)
          || Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z) || a.id - b.id)[0];
      if (target) {
        const radius = stats.radius + (target.dreamStacks ?? 0) * .55, damage = stats.damage * multiplier;
        if (this.enqueue({ kind: 'pulse', x: target.x, z: target.z, radius, damage, extension: stats.extension,
          source: this.derived(this.host.source(damage), 'pulse') })) {
          this.effect('pulse', target.x, target.z, radius); this.telemetry.pulses++;
          this.echoClock = stats.interval; this.host.sound();
        }
      }
    }
    // Each processed wave may schedule bounded death transfers, but never calls this loop recursively.
    for (let count = 0; count < DREAM_RULES.wavesPerTick && this.pending.length && !this.host.stopped(); count++) {
      const wave = this.pending.shift()!;
      for (const enemy of this.host.enemies()) {
        if (this.host.stopped()) break;
        if (!enemy.active || enemy.hp <= 0 || enemy.spawnTime > 0) continue;
        if (wave.targets ? !wave.targets.includes(enemy.id) || !(enemy.resonanceTime! > 0)
          : Math.hypot(enemy.x - wave.x, enemy.z - wave.z) > wave.radius + this.host.radius(enemy)) continue;
        if (Math.hypot(enemy.x - wave.x, enemy.z - wave.z) > wave.radius + this.host.radius(enemy)
          || this.host.covered(wave.x, wave.z, enemy.x, enemy.z)) continue;
        if (wave.kind === 'resonance') {
          this.telemetry.transferHits++;
          const event = this.effect('link', wave.x, wave.z, 0);
          if (event) { event.tx = enemy.x; event.tz = enemy.z; }
        }
        const damage = wave.damage * (enemy.rank === 'boss' ? .4 : enemy.rank === 'elite' ? .7 : 1);
        this.host.damage(enemy, damage, { ...wave.source, rootDamage: damage });
        if (wave.kind === 'pulse' && enemy.active && (enemy.resonanceTime ?? 0) > 0) {
          enemy.resonanceTime = Math.min(DREAM_RULES.resonanceCap, enemy.resonanceTime! + wave.extension!);
          this.telemetry.extensions++;
        }
      }
    }
  }
  private derived(source: RelicDamageSource, kind: NonNullable<RelicDamageSource['flowerDerived']>): RelicDamageSource {
    return { ...source, flowerDerived: kind, kind: 'explosion', suppressRelics: true, behavior: true,
      primary: false, areaBudget: undefined, generation: source.generation + 1 };
  }
  private enqueue(wave: DreamWave) {
    if (this.pending.length >= DREAM_RULES.queued) { this.telemetry.denied++; return false; }
    this.pending.push(wave); return true;
  }
  private effect(kind: DreamEvent['kind'], x: number, z: number, radius: number) {
    const event = this.events.find(e => !e.active);
    if (event) Object.assign(event, { active: true, kind, x, z, tx: x, tz: z, age: 0, radius,
      duration: kind === 'pulse' ? .64 : kind === 'bloom' ? .48 : .28, seed: ++this.serial });
    return event;
  }
  resetEnemy(enemy: Enemy) { enemy.dreamStacks = enemy.dreamTime = enemy.resonanceTime = 0; enemy.resonanceSource = undefined; }
  clear() {
    this.pending.length = 0; this.echoClock = 0;
    for (const event of this.events) event.active = false;
    for (const enemy of this.host.enemies()) this.resetEnemy(enemy);
  }
  reset() { this.clear(); this.serial = 0; for (const k of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[k] = 0; }
  inspect() { return { ...this.telemetry, pending: this.pending.length, effects: this.events.filter(e => e.active).length,
    marks: this.host.enemies().filter(e => e.active && ((e.dreamTime ?? 0) > 0 || (e.resonanceTime ?? 0) > 0))
      .map(e => ({ id: e.id, stacks: e.dreamStacks ?? 0, dream: e.dreamTime ?? 0, resonance: e.resonanceTime ?? 0 })) }; }
}
