import type { EnemyKind } from './combat';

export const ENEMY_MOTION = {
  normal: { cadence: 7, bob: .055, lean: .035, squash: .025 },
  fast: { cadence: 6, bob: .065, lean: .045, squash: .035 },
  tank: { cadence: 6, bob: .035, lean: .022, squash: .018 },
} as const;
export interface EnemyPose { bob: number; lean: number; squash: number }
/** Writes a reused render pose. Simulation positions and collision radii are never inputs/outputs. */
export function enemyPose(kind: EnemyKind, phase: number, amount: number, result: EnemyPose) {
  const rule = ENEMY_MOTION[kind], blend = Math.max(0, Math.min(1, amount));
  result.bob = Math.abs(Math.sin(phase)) * rule.bob * blend;
  result.lean = Math.sin(phase) * rule.lean * blend;
  result.squash = Math.sin(phase * 2) * rule.squash * blend;
  return result;
}
