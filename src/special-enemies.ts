/** Formal-run content only. Supplied draft IDs remain stable asset/runtime IDs. */
export const CRYSTAL_SWARM = { minGroup: 5, maxGroup: 8, killsPerXp: 3, killsPerCoin: 12, first: 8, interval: 12 } as const;
export const SPORE_BOMBER = { warning: .7, burst: .32, radius: 2.5, enemyDamage: 45, chainMultiplier: 7, playerDamage: 12, capacity: 16, maxAlive: 3, first: 14, interval: 18 } as const;
export const MOONDEW_SHELL = { interval: 4, radius: 3, healFraction: .06, targets: 3, maxAlive: 1 } as const;
export const TREASURE_RUNNER = { linger: 1.2, lifetime: 8, coins: 12, xp: 8, rewardDuration: 6.8, rewardCapacity: 8, first: 22 } as const;
export interface SporeExplosion {
  active: boolean; x: number; z: number; createdAt: number; age: number;
  detonated: boolean; sourceEnemyId: number; origin: 'player' | 'spore';
}
export interface TreasureItem { title: string; skill?: import("./progression").SkillId }
/** Cumulative probabilities: 45%, 28%, 16%, 8%, 3%. */
export function treasureItemCount(roll: number) { return roll < .45 ? 1 : roll < .73 ? 2 : roll < .89 ? 3 : roll < .97 ? 4 : 5; }
export interface TreasureReward { items: TreasureItem[]; active: boolean; x: number; z: number; age: number; coins: number }

/** Preserve historical modes; multiply existing formal wave/endless scaling only. */
export function treasureHealthMultiplier(wave: number) { return wave <= 3 ? 1.25 : 1.6; }
