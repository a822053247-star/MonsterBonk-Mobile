import type { Combat, EnemyKind } from './combat';

/** Isolated roster: never delegates to the campaign, legacy, or Boss spawners. */
export const ENEMY_TEST_ROSTER: readonly { kind: EnemyKind; cap: number }[] = [
  { kind: 'spore-floater', cap: 2 },
  { kind: 'crystal-crawler', cap: 1 },
  { kind: 'scarlet-flower', cap: 2 },
  { kind: 'moondew-shell', cap: 1 },
  { kind: 'molten-fruit', cap: 2 },
  { kind: 'frost-fluff', cap: 1 },
  { kind: 'nightshade-bat', cap: 3 },
  { kind: 'thunder-bell', cap: 2 },
  { kind: 'toxic-shroom', cap: 2 },
  { kind: 'sand-shell', cap: 2 },
  { kind: 'mirror-wisp', cap: 1 },
  { kind: 'abyss-lantern', cap: 2 },
];

export class EnemyTestMode {
  private spawnClock = 0;
  step(dt: number, combat: Combat, player: { x: number; z: number }) {
    if (dt <= 0 || combat.hp <= 0) return;
    this.spawnClock = Math.max(0, this.spawnClock - dt);
    if (this.spawnClock > 0) return;
    this.spawnClock = 4;
    // One arrival per kind per interval; failed placements retry next interval.
    for (const {kind, cap} of ENEMY_TEST_ROSTER) {
      const alive = combat.enemies.reduce((count, enemy) => count + Number(enemy.active && enemy.kind === kind), 0);
      if (alive < cap) combat.spawnEncounter(kind, player, 8, 11);
    }
  }
}
