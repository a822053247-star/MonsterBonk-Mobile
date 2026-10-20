/** Formal-run content only. Supplied draft IDs remain stable asset/runtime IDs. */
export const CRYSTAL_SWARM = { minGroup: 5, maxGroup: 8, killsPerXp: 3, killsPerCoin: 12, first: 8, interval: 12 } as const;
export const SPORE_BOMBER = { warning: .7, burst: .32, radius: 2.5, enemyDamage: 45, chainMultiplier: 7, playerDamage: 12, capacity: 16, maxAlive: 3, first: 14, interval: 18 } as const;
export const TREASURE_RUNNER = { linger: 1.2, lifetime: 8, coins: 12, xp: 8, rewardDuration: 1.1, rewardCapacity: 8, first: 22 } as const;
export interface SporeExplosion {
  active: boolean; x: number; z: number; createdAt: number; age: number;
  detonated: boolean; sourceEnemyId: number; origin: 'player' | 'spore';
}
export interface TreasureReward { active: boolean; x: number; z: number; age: number; coins: number }
