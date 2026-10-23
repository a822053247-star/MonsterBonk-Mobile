import type { EnemyKind } from './combat';

export const ENEMY_MOTION = {
  'abyss-lantern': { cadence: 2.5, bob: .04, lean: .025, squash: .008 },
  'mirror-wisp': { cadence: 2.8, bob: .04, lean: .018, squash: 0 },
  'sand-shell': { cadence: 2, bob: 0, lean: .008, squash: .008 },
  'toxic-shroom': { cadence: 3, bob: .025, lean: .02, squash: .02 },
  'thunder-bell': { cadence: 3.5, bob: .045, lean: .025, squash: .01 },
  'frost-fluff': { cadence: 2, bob: 0, lean: .012, squash: 0 },
  'nightshade-bat': { cadence: 3, bob: .04, lean: .025, squash: 0 },
  'molten-fruit': { cadence: 5.5, bob: .13, lean: .07, squash: .07 },
  'moondew-shell': { cadence: 2.2, bob: 0, lean: .008, squash: .025 },
  'scarlet-flower': { cadence: 3.6, bob: .07, lean: .035, squash: .015 },
  'crystal-crawler': { cadence: 2, bob: 0, lean: .006, squash: 0 },
  'spore-floater': { cadence: 4, bob: .09, lean: .055, squash: .025 },
  normal: { cadence: 7, bob: .055, lean: .035, squash: .025 },
  fast: { cadence: 6, bob: .065, lean: .045, squash: .035 },
  tank: { cadence: 3.5, bob: .018, lean: .012, squash: .01 },
  'draft-crystal-swarm': { cadence: 10, bob: .025, lean: .025, squash: .02 },
  'draft-spore-bomber': { cadence: 6, bob: .04, lean: .025, squash: .04 },
  'draft-treasure-runner': { cadence: 8, bob: .065, lean: .045, squash: .03 },
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
