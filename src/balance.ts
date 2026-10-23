import type { BaseAttackId } from './fusion';

/** Shared simulation/display limits for the six-wave and Endless build. */
export const BUILD_BALANCE = {
  projectileRange: 16, wheelRadius: 4.2, bladeRange: 13, lightningRange: 13,
  explosionRadius: 3.6, steamRadius: 3.5, pairRadius: 2.8,
  extraPelletDamage: .75, temporaryHaste: 1.5, childScale: .6,
} as const;
export const VITAL_CONTRACT={health:.95,limit:3,priceFraction:.6,priceStep:.1} as const;
const PROJECTILE_RADII: Partial<Record<BaseAttackId, readonly [number, number]>> = {
  spark: [.20,.26], bubble: [.24,.34], leaf: [.20,.26],
  'frost-crystal': [.20,.28], 'dream-dart': [.20,.27], 'resonance-seed': [.20,.26],
};
export function weaponProjectileRadius(id: BaseAttackId, level: number) {
  const [first,last] = PROJECTILE_RADII[id] ?? [.2,.26];
  return first + (last-first) * Math.max(0,Math.min(4,Math.floor(level)-1))/4;
}
export function buildExperienceThreshold(level: number, endless = false) {
  const base = level <= 1 ? 6 : 4 * level;
  return Math.ceil(base + (endless ? .08 * Math.max(0, level - 25) ** 2 : 0));
}
export function slotInterval(slot: number) { return slot === 0 ? 1 : slot === 1 ? 1.35 : 1.55; }
export function controlledSpeed(rank: 'elite' | 'boss' | undefined, ...factors: number[]) {
  return Math.max(rank === 'boss' ? .85 : rank === 'elite' ? .55 : .3, Math.min(1,...factors));
}
function safeCycle(index: number) {
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Number.isFinite(index) ? Math.floor(index) : 0));
}
/** Early anchors retained; logarithmic tail keeps rising with diminishing increments. */
export function cycleHealth(index: number, boss = false) {
  const n = safeCycle(index);
  return 1 + (boss ? .28 : .16) * Math.min(n,2)
    + (boss ? .60 : .32) * Math.log1p(Math.max(n-2,0)/2);
}

export function cycleFuelHealth(index: number) { return Math.min(1.8, cycleHealth(index)); }

/** Boss cadence follows the health curve's early steps and logarithmic tail.
 * Only execution/recovery accelerate; authored warning windows stay readable. */
export function cycleBossFrequency(index: number) {
  const n = safeCycle(index);
  return Math.min(1.35, 1 + .04 * Math.min(n,2)
    + .10 * Math.log1p(Math.max(n-2,0)/2));
}

/** Authored prices depend on progress, never wallet size, DPS or player failures. */
export function endlessShopBaseline(index: number) {
  const n = safeCycle(index);
  return 105 + 18 * Math.min(n,2) + 28 * Math.log1p(Math.max(n-2,0)/2);
}
export function endlessShopPrice(base: number, index: number, category: 'normal' | 'relic' | 'evolution' | 'heal' | 'refresh' = 'normal') {
  const unit = endlessShopBaseline(index);
  const weight = category === 'relic' ? 1.4 : category === 'evolution' ? 1.5
    : category === 'heal' ? .7 : category === 'refresh' ? base * 3 / 105
    : Math.max(.9,Math.min(1.2,base/25));
  return Math.ceil(unit * weight / 5) * 5;
}
