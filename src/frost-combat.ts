import type { Enemy } from './combat';
import type { RelicDamageSource } from './relics';
import { sourceHasAttack } from './weapon-pair-fusion';

export const FROST_RULES = { chillDuration: 1.6, chillSlow: .65, freeze: 1.25, eliteFreeze: .45, immunity: 2.5, effects: 48 } as const;
export function frostStats(level: number) {
  const n = Math.max(0, Math.min(4, Math.floor(level) - 1));
  return { pierces: n >= 4 ? 2 : n >= 2 ? 1 : 0, interval: .72 - n * .02 };
}
interface FrostEvent { active: boolean; kind: 'impact' | 'freeze' | 'thaw' | 'resist'; x: number; z: number; age: number; seed: number }

/** Enemy-owned timers survive pool reuse only until resetEnemy; no render clock controls freezing. */
export class FrostCombat {
  readonly events: FrostEvent[] = Array.from({ length: FROST_RULES.effects }, () => ({ active: false, kind: 'impact', x: 0, z: 0, age: 0, seed: 0 }));
  readonly telemetry = { iceHits: 0, freezes: 0, eliteFreezes: 0, bossResists: 0, thaws: 0 };
  constructor(private enemies: () => readonly Enemy[], private onFreeze: (enemy: Enemy) => void, private sound: () => void) {}
  hit(enemy: Enemy, source: RelicDamageSource) {
    if (source.suppressRelics || source.behavior || source.kind !== 'hit' && source.kind !== 'explosion') return;
    const ice = source.attackId === 'frost-crystal', water = sourceHasAttack(source, 'bubble');
    if (!ice && !water) return;
    if (ice) { this.telemetry.iceHits++; this.effect('impact', enemy); }
    if (!enemy.active || enemy.hp <= 0 || enemy.spawnTime > 0) return;
    if (ice) enemy.chillTime = FROST_RULES.chillDuration;
    if (!(enemy.chillTime! > 0) || !(enemy.wetTime! > 0) || enemy.freezeTime! > 0 || enemy.freezeImmuneTime! > 0) return;
    enemy.wetTime = 0;
    if (enemy.rank === 'boss') {
      enemy.chillTime = FROST_RULES.chillDuration; enemy.freezeImmuneTime = FROST_RULES.immunity;
      this.telemetry.bossResists++; this.effect('resist', enemy); return;
    }
    const duration = enemy.rank === 'elite' ? FROST_RULES.eliteFreeze : FROST_RULES.freeze;
    enemy.chillTime = 0; enemy.freezeTime = enemy.freezeDuration = duration;
    enemy.freezeImmuneTime = duration + FROST_RULES.immunity;
    enemy.knockX = enemy.knockZ = enemy.walkX = enemy.walkZ = enemy.walkAmount = 0;
    enemy.intent = 'recover'; enemy.intentTime = .3; enemy.stagger = 0;
    enemy.grassAttackX = enemy.grassAttackZ = undefined; enemy.grassHit = true;
    enemy.grassCycle = enemy.grassRollDistance = 0;
    this.telemetry.freezes++; if (enemy.rank === 'elite') this.telemetry.eliteFreezes++;
    this.onFreeze(enemy); this.effect('freeze', enemy); this.sound();
  }
  /** Return whether this tick started frozen, so a thaw never advances a whole coarse tick of attacks. */
  tickEnemy(enemy: Enemy, dt: number) {
    const frozen = (enemy.freezeTime ?? 0) > 0;
    enemy.chillTime = Math.max(0, (enemy.chillTime ?? 0) - dt);
    enemy.freezeTime = Math.max(0, (enemy.freezeTime ?? 0) - dt);
    enemy.freezeImmuneTime = Math.max(0, (enemy.freezeImmuneTime ?? 0) - dt);
    if (frozen) {
      enemy.knockX = enemy.knockZ = enemy.walkX = enemy.walkZ = enemy.walkAmount = 0;
      if (enemy.freezeTime === 0) { this.telemetry.thaws++; this.effect('thaw', enemy); }
    }
    return frozen;
  }
  slowFactor(enemy: Enemy) { return (enemy.chillTime ?? 0) > 0 ? enemy.rank === 'boss' ? .85 : FROST_RULES.chillSlow : 1; }
  update(dt: number) {
    for (const event of this.events) if (event.active) { event.age += dt; if (event.age >= .4) event.active = false; }
  }
  private effect(kind: FrostEvent['kind'], enemy: Enemy) {
    const event = this.events.find(e => !e.active);
    if (event) Object.assign(event, { active: true, kind, x: enemy.x, z: enemy.z, age: 0, seed: enemy.id });
  }
  resetEnemy(enemy: Enemy) { enemy.chillTime = enemy.freezeTime = enemy.freezeDuration = enemy.freezeImmuneTime = 0; }
  clear() { for (const event of this.events) event.active = false; for (const enemy of this.enemies()) this.resetEnemy(enemy); }
  reset() { this.clear(); for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0; }
  inspect() { return { ...this.telemetry, capacity: FROST_RULES.effects, effects: this.events.filter(e => e.active).length,
    frozen: this.enemies().filter(e => e.active && (e.freezeTime ?? 0) > 0).map(e => ({ id: e.id, time: e.freezeTime, immune: e.freezeImmuneTime, rank: e.rank ?? 'normal' })) }; }
}
