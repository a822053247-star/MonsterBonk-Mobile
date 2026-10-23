import { screenFacing, type Facing8, type ScreenBasis } from './creature-animation';

export const ENEMY_DIRECTION_LAYOUT = { columns: 5, cell: 256, bodyHeight: 200, footY: 240 } as const;
export const ENEMY_DIRECTION_ASSETS = {
  'enemy-abyss-lantern': 'enemies/direction/abyss-lantern/runtime.normalized.png',
  'enemy-mirror-wisp': 'enemies/direction/mirror-wisp/runtime.normalized.png',
  'enemy-sand-shell': 'enemies/direction/sand-shell/runtime.normalized.png',
  'enemy-toxic-shroom': 'enemies/direction/toxic-shroom/runtime.normalized.png',
  'enemy-thunder-bell': 'enemies/direction/thunder-bell/runtime.normalized.png',
  'enemy-frost-fluff': 'enemies/direction/frost-fluff/runtime.normalized.png',
  'enemy-nightshade-bat': 'enemies/direction/nightshade-bat/runtime.normalized.png',
  'enemy-molten-fruit': 'enemies/direction/molten-fruit/runtime.normalized.png',
  'enemy-moondew-shell': 'enemies/direction/moondew-shell/runtime.normalized.png',
  'enemy-scarlet-flower': 'enemies/direction/scarlet-flower/runtime.normalized.png',
  'enemy-crystal-crawler': 'enemies/direction/crystal-crawler/runtime.normalized.png',
  'enemy-spore-floater': 'enemies/direction/spore-floater/runtime.normalized.png',
  'enemy-normal': 'enemies/direction/grass-monster-directions/runtime.normalized.png',
  'enemy-fast': 'enemies/direction/runner-bug-directions/runtime.normalized.png',
  'enemy-tank': 'enemies/direction/rock-armor-bug-directions/runtime.normalized.png',
  'enemy-draft-crystal-swarm': 'enemies/direction/draft-crystal-swarm-directions/runtime.normalized.png',
  'enemy-draft-spore-bomber': 'enemies/direction/draft-spore-bomber-directions/runtime.normalized.png',
  'enemy-draft-treasure-runner': 'enemies/direction/draft-treasure-runner-directions/runtime.normalized.png',
} as const;
export const ENEMY_DIRECTION_FRAMES: Readonly<Record<Facing8, readonly [number, number]>> = {
  down: [0,0], 'down-right': [1,0], right: [2,0], 'up-right': [3,0], up: [4,0],
  'up-left': [3,1], left: [2,1], 'down-left': [1,1],
};
/** Displacement, rather than target bearing: sliding around cover must turn the art. */
export function enemyFacing(dx: number, dz: number, basis: ScreenBasis, previous?: Facing8): Facing8 {
  return Math.hypot(dx,dz) < 1e-5 ? previous ?? 'down' : screenFacing(dx,dz,basis,previous);
}
