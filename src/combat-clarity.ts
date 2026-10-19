import type { CombatEffect } from './combat';

/** Project tuning inspired by readable ball volleys, not BALL x PIT's exact stats. */
export const COMBAT_CLARITY = { shotGap: .08, volleyGap: .18, impactSpacing: 1.1, maxImpacts: 6, projectileSize: .65, childSize: .38, impactSize: 1.55 } as const;
const PRIORITY: Partial<Record<CombatEffect['kind'], number>> = { burst: 4, water: 3, thorn: 2, hit: 1 };

/** Presentation only. Dropped duplicate visuals never drop damage or status events. */
export function readableEffects(effects: readonly CombatEffect[]) {
  const active = effects.filter(e => e.active);
  const impacts = active.filter(e => PRIORITY[e.kind]).sort((a, b) => PRIORITY[b.kind]! - PRIORITY[a.kind]! || (a.duration - a.time) - (b.duration - b.time));
  const selected: CombatEffect[] = [];
  for (const effect of impacts) {
    if (selected.length >= COMBAT_CLARITY.maxImpacts) break;
    if (selected.some(other => Math.hypot(other.x - effect.x, other.z - effect.z) < COMBAT_CLARITY.impactSpacing)) continue;
    selected.push(effect);
  }
  return active.filter(e => !PRIORITY[e.kind]).concat(selected);
}
