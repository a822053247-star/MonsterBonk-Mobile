export type Ruleset = 'classic' | 'horn-trial';

/** Experimental values only. Classic movement, enemies and progression stay intact. */
export const HORN = { damage: 32, radius: 0.9, knockback: 9, stagger: 0.42, goal: 6 } as const;
export const POUNCE = { range: 7.5, windup: 0.7, duration: 0.34, speed: 18, recovery: 1, cooldown: 1.4, hp: 54 } as const;
export interface DashStep { active: boolean; started: boolean; fromX: number; fromZ: number; dx: number; dz: number }
export type EnemyIntent = 'chase' | 'windup' | 'pounce' | 'recover';
