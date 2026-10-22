import type { Combat } from './combat';
import { ELITE_QUAKE_DURATION } from './elite-quake';
import { ENCOUNTER_RULES } from './enemy-challenge';

export const QUAKE_DRILL = { capacity: 6, halfWidth: 10, halfDepth: 6, speed: 4.6, interval: 3.4 } as const;
interface DrillZone { active: boolean; x: number; z: number; age: number; radius: number; impacted: boolean }
type DamageHost = Pick<Combat, 'hp' | 'invulnerability' | 'hurtFlash' | 'hitPlayer' | 'anchorX' | 'anchorZ'>;

/** Preview-only dodge exercise. Each warning locks its own origin and radius. */
export class QuakeDrill {
  readonly player = { x: 4.5, z: 1.5 };
  readonly safePoint = { x: 0, z: 0 };
  readonly zones: DrillZone[] = Array.from({ length: QUAKE_DRILL.capacity }, () => ({ active: false, x: 0, z: 0, age: 0, radius: 4.6, impacted: false }));
  radius = 4.6;
  count = 3;
  automatic = true;
  elapsed = 0;
  volleys = 0;
  dodged = 0;
  hits = 0;
  nextVolley = .65;
  private seed = 37;
  private movement = { x: 0, z: 0 };
  constructor(private host: DamageHost) {}
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  get alive() { return this.host.hp > 0; }
  get canTrigger() { return this.alive && this.zones.every(zone => !zone.active); }
  trigger() {
    if (!this.canTrigger) return false;
    const radius = Math.max(2.5, Math.min(5.5, this.radius));
    const count = Math.max(1, Math.min(QUAKE_DRILL.capacity, Math.floor(this.count)));
    // Reserve a reachable pocket outside every circle, rather than carpeting the entire arena.
    const angle = Math.atan2(-this.player.z, -this.player.x);
    const safe = this.safePoint;
    safe.x = this.player.x + Math.cos(angle) * (radius + .3);
    safe.z = this.player.z + Math.sin(angle) * (radius + .3);
    if (Math.abs(safe.z) > 5.2) { safe.x = this.player.x + (this.player.x >= 0 ? -1 : 1) * (radius + .3); safe.z = this.player.z; }
    for (let i = 0; i < count; i++) {
      let x = this.player.x, z = this.player.z;
      if (i) {
        let found = false;
        for (let attempt = 0; attempt < 64; attempt++) {
          x = (this.random() * 2 - 1) * 7.7; z = (this.random() * 2 - 1) * 3.8;
          if (Math.hypot(x - safe.x, z - safe.z) >= radius + 1
            && this.zones.slice(0, i).every(zone => Math.hypot(x - zone.x, z - zone.z) >= 2.4)) { found = true; break; }
        }
        if (!found) { x = safe.x >= 0 ? -7.7 : 7.7; z = safe.z >= 0 ? -3.8 : 3.8; }
      }
      Object.assign(this.zones[i], { active: true, x, z, age: -i * .12, radius, impacted: false });
    }
    this.volleys++; this.nextVolley = this.elapsed + QUAKE_DRILL.interval;
    return true;
  }
  update(dt: number, input = this.movement) {
    if (!Number.isFinite(dt) || dt <= 0 || !this.alive) return;
    let left = dt;
    while (left > 1e-8 && this.alive) {
      const step = Math.min(left, 1 / 120); left -= step; this.elapsed += step;
      this.host.invulnerability = Math.max(0, this.host.invulnerability - step);
      this.host.hurtFlash = Math.max(0, this.host.hurtFlash - step);
      const length = Math.max(1, Math.hypot(input.x, input.z));
      this.player.x = Math.max(-9.5, Math.min(9.5, this.player.x + input.x / length * QUAKE_DRILL.speed * step));
      this.player.z = Math.max(-5.5, Math.min(5.5, this.player.z + input.z / length * QUAKE_DRILL.speed * step));
      this.host.anchorX = this.player.x; this.host.anchorZ = this.player.z;
      if (this.automatic && this.elapsed >= this.nextVolley) this.trigger();
      for (const zone of this.zones) {
        if (!zone.active) continue;
        zone.age += step;
        if (!zone.impacted && zone.age + 1e-8 >= ENCOUNTER_RULES.eliteWindup) {
          zone.age = Math.max(zone.age, ENCOUNTER_RULES.eliteWindup);
          zone.impacted = true;
          if (Math.hypot(this.player.x - zone.x, this.player.z - zone.z) < zone.radius) {
            const hp = this.host.hp; this.host.hitPlayer(ENCOUNTER_RULES.elitePulseDamage);
            if (this.host.hp < hp) this.hits++;
          } else this.dodged++;
        }
        if (zone.age >= ENCOUNTER_RULES.eliteWindup + ELITE_QUAKE_DURATION) zone.active = false;
      }
    }
  }
  reset() {
    this.host.hp = 100; this.host.invulnerability = this.host.hurtFlash = 0;
    this.player.x = 4.5; this.player.z = 1.5;
    this.host.anchorX = this.player.x; this.host.anchorZ = this.player.z;
    this.elapsed = this.volleys = this.dodged = this.hits = 0; this.nextVolley = .65; this.seed = 37;
    for (const zone of this.zones) { zone.active = false; zone.impacted = false; zone.age = 0; }
  }
  inspect() { return { player: { ...this.player }, hp: this.host.hp, elapsed: this.elapsed, volleys: this.volleys,
    hits: this.hits, dodged: this.dodged, radius: this.radius, count: this.count,
    zones: this.zones.filter(zone => zone.active).map(zone => ({ ...zone })) }; }
}
