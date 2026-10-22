import type { Enemy, WeaponSnapshot } from './combat';
import type { RelicDamageSource } from './relics';

export const THUNDER_LIMITS = { casts: 4, links: 32, impacts: 32, warning: .12, hopDelay: .09, decay: .82 } as const;
export function thunderStats(level: number) {
  const n = Math.max(0, Math.min(4, Math.floor(level) - 1));
  return { targets: [3, 3, 4, 5, 6][n], hopRange: 3.2 + n * .2, interval: 1.3 - n * .05, decay: THUNDER_LIMITS.decay + n * .02 };
}
interface ThunderCast {
  active: boolean; age: number; nextAt: number; x: number; z: number; initialId: number;
  range: number; hopRange: number; targets: number; hops: number; damage: number; decay: number;
  visited: Set<number>; source?: RelicDamageSource;
}
interface ThunderLink { active: boolean; age: number; x: number; z: number; tx: number; tz: number; variant: number }
interface ThunderImpact { active: boolean; age: number; x: number; z: number; enemyId: number }
interface ThunderHost {
  enemies(): readonly Enemy[]; origin(): { x: number; z: number }; stopped(): boolean;
  covered(x: number, z: number, tx: number, tz: number): boolean;
  source(attack: WeaponSnapshot, copied: boolean): RelicDamageSource;
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  sound(): void;
}

/** Delayed chain strikes have their own bounded pool and never revisit an enemy ID. */
export class ThunderWeapon {
  readonly casts: ThunderCast[] = Array.from({ length: THUNDER_LIMITS.casts }, () => ({
    active: false, age: 0, nextAt: 0, x: 0, z: 0, initialId: 0, range: 0, hopRange: 0,
    targets: 0, hops: 0, damage: 0, decay: THUNDER_LIMITS.decay, visited: new Set(),
  }));
  readonly links: ThunderLink[] = Array.from({ length: THUNDER_LIMITS.links }, () => ({ active: false, age: 0, x: 0, z: 0, tx: 0, tz: 0, variant: 0 }));
  readonly impacts: ThunderImpact[] = Array.from({ length: THUNDER_LIMITS.impacts }, () => ({ active: false, age: 0, x: 0, z: 0, enemyId: 0 }));
  readonly telemetry = { casts: 0, hits: 0, denied: 0 };
  constructor(private host: ThunderHost) {}

  cast(attack: WeaponSnapshot, target?: Enemy, copied = false) {
    if (attack.attackId !== 'thunder-bud' || !attack.lightning || !target || this.host.stopped()) return false;
    const origin = this.host.origin();
    if (!this.eligible(target, origin.x, origin.z, attack.range)) return false;
    const cast = this.casts.find(c => !c.active);
    if (!cast) { this.telemetry.denied++; return false; }
    const stats = thunderStats(attack.lightning.level);
    Object.assign(cast, { active: true, age: 0, nextAt: THUNDER_LIMITS.warning,
      x: origin.x, z: origin.z, initialId: target.id, range: attack.range,
      hopRange: Math.min(7, stats.hopRange * attack.rules.rangeMultiplier * attack.rules.chainRangeMultiplier),
      targets: stats.targets, hops: 0, decay: stats.decay, damage: attack.damage * attack.rules.directMultiplier,
      source: this.host.source(attack, copied) });
    cast.visited.clear(); this.telemetry.casts++;
    return true;
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.host.stopped()) { this.clear(); return; }
    for (const link of this.links) if (link.active) { link.age += dt; if (link.age >= .26) link.active = false; }
    for (const impact of this.impacts) if (impact.active) {
      impact.age += dt; if (impact.age >= .34) { impact.active = false; continue; }
      const enemy = this.host.enemies().find(e => e.active && e.id === impact.enemyId);
      if (enemy) { impact.x = enemy.x; impact.z = enemy.z; }
    }
    for (const cast of this.casts) {
      if (!cast.active) continue;
      const previousAge = cast.age; cast.age += dt;
      while (cast.active && cast.age + 1e-8 >= cast.nextAt && !this.host.stopped()) {
        const radius = cast.hops === 0 ? cast.range : cast.hopRange;
        const candidates = this.host.enemies().filter(e => !cast.visited.has(e.id) && this.eligible(e, cast.x, cast.z, radius));
        candidates.sort((a, b) => Math.hypot(a.x - cast.x, a.z - cast.z) - Math.hypot(b.x - cast.x, b.z - cast.z) || a.id - b.id);
        const enemy = cast.hops === 0 ? candidates.find(e => e.id === cast.initialId) ?? candidates[0] : candidates[0];
        if (!enemy) { cast.active = false; break; }
        // Backdate new visual events when one coarse step resolves several hops.
        const age = Math.max(0, cast.age - Math.max(previousAge, cast.nextAt));
        const link = this.links.find(l => !l.active);
        if (link && age < .26) Object.assign(link, { active: true, age, x: cast.x, z: cast.z,
          tx: enemy.x, tz: enemy.z, variant: (this.telemetry.casts + cast.hops) % 4 });
        const impact = this.impacts.find(p => !p.active);
        if (impact && age < .34) Object.assign(impact, { active: true, age, x: enemy.x, z: enemy.z, enemyId: enemy.id });
        cast.visited.add(enemy.id); cast.x = enemy.x; cast.z = enemy.z;
        const damage = cast.damage * (cast.decay * cast.source!.rules.chainDecay) ** cast.hops;
        cast.hops++; cast.nextAt += THUNDER_LIMITS.hopDelay;
        this.host.damage(enemy, damage, cast.source!);
        this.telemetry.hits++; this.host.sound();
        if (cast.hops >= cast.targets || this.host.stopped()) cast.active = false;
      }
      if (this.host.stopped()) break;
    }
  }
  private eligible(e: Enemy, x: number, z: number, radius: number) {
    return e.active && e.hp > 0 && e.spawnTime <= 0 && Math.hypot(e.x - x, e.z - z) <= radius && !this.host.covered(x, z, e.x, e.z);
  }
  clear() {
    for (const cast of this.casts) { cast.active = false; cast.source = undefined; cast.visited.clear(); }
    for (const link of this.links) link.active = false;
    for (const impact of this.impacts) impact.active = false;
  }
  reset() { this.clear(); for (const key of Object.keys(this.telemetry) as (keyof typeof this.telemetry)[]) this.telemetry[key] = 0; }
  inspect() { return { ...this.telemetry, capacity: this.casts.length,
    active: this.casts.filter(c => c.active).map(c => ({ age: c.age, hops: c.hops, targets: c.targets, visited: [...c.visited], copied: !!c.source?.copied })),
    links: this.links.filter(l => l.active).length, impacts: this.impacts.filter(p => p.active).length }; }
}
