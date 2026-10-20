import type { CombatEffect } from './combat';

/** Project tuning inspired by readable ball volleys, not BALL x PIT's exact stats. */
export const COMBAT_CLARITY = { shotGap: .08, volleyGap: .18, impactSpacing: 1.1, maxImpacts: 6, projectileSize: .65, childSize: .38, impactSize: 1.55 } as const;
/** Presentation only; never changes the impact point used for damage or splash. */
export const WATER_IMPACT_VISUAL = { inset: .65, normalScale: .72, tankScale: .82, heightRatio: .72 } as const;

/** Pull the splash into the body while preserving the incoming side and following knockback. */
export function impactVisualPosition(effect: Pick<CombatEffect, 'x' | 'z' | 'kind' | 'anchorX' | 'anchorZ'>, target?: { x: number; z: number }) {
  if (effect.kind !== 'water' || effect.anchorX === undefined || effect.anchorZ === undefined) return { x: effect.x, z: effect.z };
  const x = effect.x + (effect.anchorX - effect.x) * WATER_IMPACT_VISUAL.inset;
  const z = effect.z + (effect.anchorZ - effect.z) * WATER_IMPACT_VISUAL.inset;
  return { x: x + (target?.x ?? effect.anchorX) - effect.anchorX,
    z: z + (target?.z ?? effect.anchorZ) - effect.anchorZ };
}

const PRIORITY: Partial<Record<CombatEffect['kind'], number>> = { steam: 5, burst: 4, water: 3, thorn: 2, hit: 1 };

/** Generous mowing silhouettes. Damage radii and enemy warnings are independent. */
export function impactSize(effect: Pick<CombatEffect, 'kind' | 'radius' | 'chainDepth'>) {
  if (effect.kind === 'burst') return Math.min(effect.chainDepth ? 3.8 : 2.8, Math.max(1, (effect.radius ?? .6) * 2.2));
  return Math.min(2.25, Math.max(1, (effect.radius ?? .6) * 2));
}

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
