import type { Enemy, EnemyKind } from './combat';

/** Ranked enemies occupy their own slot even when they reuse a tank body. */
export type EndlessEnemyType = EnemyKind | 'elite' | 'boss';
export const ENDLESS_TYPE_LIMIT = 4;

export function endlessEnemyType(enemy: Pick<Enemy, 'kind' | 'rank'>): EndlessEnemyType {
  return enemy.rank ?? enemy.kind;
}

/** Fixed incoming roster; surviving previous-wave types retire without refills.
 * Retirees still occupy live slots until killed. No spawn path may add a fifth.
 */
export class EndlessRoster {
  readonly types: readonly EndlessEnemyType[];

  constructor(types: readonly EndlessEnemyType[]) {
    this.types = [...new Set(types)].slice(0, ENDLESS_TYPE_LIMIT);
  }

  allows(type: EndlessEnemyType, enemies: readonly Enemy[]) {
    if (!this.types.includes(type)) return false;
    const live = new Set<EndlessEnemyType>();
    for (const enemy of enemies) if (enemy.active) live.add(endlessEnemyType(enemy));
    return live.has(type) || live.size < ENDLESS_TYPE_LIMIT;
  }
}
