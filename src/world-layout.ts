import type { GroundObstacle } from './navigation';

export type MapTree = readonly [number, number, number];
export type MapRock = readonly [number, number];
export interface TerrainRegion { x: number; z: number; kind: 'grove' | 'rocky' | 'pond' | 'clearing' }
export interface WorldLayout {
  trees: readonly MapTree[]; rocks: readonly MapRock[];
  water: readonly GroundObstacle[]; regions: readonly TerrainRegion[];
}

export const SAMPLE_POND = { x: 14, z: -7, radius: 5.3 } as const;
export const WATER_LOBES = [SAMPLE_POND, { x: 17.5, z: -8.5, radius: 2.8 }] as const;
export const SAMPLE_TREES = [
  [-11, -3, 0], [-14, -5, 1], [-10, -8, 2], [-16, -1, 0], [-16, -10, 1],
  [-7, -17, 0], [6, -21, 1], [5, -16, 2], [-10, -22, 2],
  [25, -17, 0], [27, -8, 1], [26, 0, 2], [19, -23, 1],
  [-17, 12, 0], [-21, 10, 1], [-19, 17, 2],
  [15, 15, 0], [20, 17, 1], [22, 12, 2],
  [-28, -15, 0], [-25, -22, 1], [-17, -29, 2], [9, -29, 0],
  [28, 3, 1], [29, 11, 2], [7, 29, 0], [-8, 28, 1], [-28, 2, 2],
] as const;
export const SAMPLE_ROCKS = [[-12, -12], [-16, -13], [8, -16], [22, -1], [25, -20], [-23, 15], [18, 21]] as const;
export const ROAD_WIDTH = 4.8;
export const SAMPLE_PATHS = [
  { start: [-29, 7], curves: [[-19, 7, -12, 5, -5, 5], [2, 5, 5, 3, 9, 3], [17, 3, 23, 7, 29, 7]] },
  { start: [-4, 5], curves: [[-6, -1, -6, -6, -4, -11], [-2, -17, -1, -23, -3, -29]] },
  { start: [1, 4], curves: [[1, 12, -3, 22, 1, 29]] },
] as const;

/** Rendering, path validation, navigation and collision share one layout. */
export function fixedWorldLayout(): WorldLayout {
  return { trees: SAMPLE_TREES, rocks: SAMPLE_ROCKS, water: WATER_LOBES, regions: [] };
}

export function sampleObstacles(layout = fixedWorldLayout()): GroundObstacle[] {
  return [
    ...layout.water.map(o => ({ ...o })),
    ...layout.trees.map(([x, z]) => ({ x, z, radius: .65 })),
    ...layout.rocks.map(([x, z]) => ({ x, z, radius: .8 })),
  ];
}
