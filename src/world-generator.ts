import { GroundNavigation, type GroundObstacle } from './navigation';
import { fixedWorldLayout, ROAD_WIDTH, SAMPLE_PATHS, sampleObstacles, type MapTree, type MapRock, type TerrainRegion, type WorldLayout } from './world-layout';

export const MAP_VERSION = 1;
export const MAP_BOUNDARY = 32.3;
const MAX_ATTEMPTS = 8;
const SPAWN_RADIUS = 8;

// Sample the fixed curves once; the placement margin exceeds curve chord error.
const roadSegments: number[][] = [];
for (const road of SAMPLE_PATHS) {
  let start: readonly number[] = road.start;
  for (const c of road.curves) {
    let previous = start;
    for (let i = 1; i <= 32; i++) {
      const t = i / 32, u = 1 - t;
      const next = [u ** 3 * start[0] + 3 * u ** 2 * t * c[0] + 3 * u * t ** 2 * c[2] + t ** 3 * c[4],
        u ** 3 * start[1] + 3 * u ** 2 * t * c[1] + 3 * u * t ** 2 * c[3] + t ** 3 * c[5]];
      roadSegments.push([previous[0], previous[1], next[0], next[1]]);
      previous = next;
    }
    start = [c[4], c[5]];
  }
}

function roadDistance(x: number, z: number) {
  let best = Infinity;
  for (const [ax, az, bx, bz] of roadSegments) {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2);
  }
  return Math.sqrt(best);
}

function randomFor(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export interface LayoutValidation {
  valid: boolean; issues: string[]; walkable: number; reachable: number; openRatio: number;
}

/** Reject malformed, blocked-start, obstructed-road and disconnected layouts. */
export function validateLayout(layout: WorldLayout): LayoutValidation {
  const obstacles = sampleObstacles(layout);
  const issues: string[] = [];
  if (obstacles.length > 64) issues.push('obstacle-budget');
  for (const o of obstacles) {
    if (![o.x, o.z, o.radius].every(Number.isFinite) || o.radius <= 0) { issues.push('invalid-obstacle'); continue; }
    if (Math.hypot(o.x, o.z) - o.radius < SPAWN_RADIUS) issues.push('blocked-spawn');
    if (Math.hypot(o.x, o.z) + o.radius > MAP_BOUNDARY - .95) issues.push('outside-boundary');
    if (roadDistance(o.x, o.z) < o.radius + ROAD_WIDTH / 2) issues.push('blocked-road');
  }
  if (issues.length) return { valid: false, issues: [...new Set(issues)], walkable: 0, reachable: 0, openRatio: 0 };
  const audit = new GroundNavigation(obstacles, MAP_BOUNDARY).audit({ x: 0, z: 0 });
  const openRatio = audit.walkable / audit.inside;
  if (audit.walkable !== audit.reachable) issues.push('disconnected-ground');
  if (openRatio < .72) issues.push('insufficient-battle-space');
  return { valid: !issues.length, issues, walkable: audit.walkable, reachable: audit.reachable, openRatio };
}

function candidate(seed: string): WorldLayout {
  const random = randomFor(seed);
  const kinds: TerrainRegion['kind'][] = ['grove', 'rocky', 'pond', random() < .35 ? 'pond' : 'clearing'];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const regions = [[-16, -14], [16, -15], [-17, 17], [16, 18]].map(([x, z], i) => ({
    x: x + (random() - .5) * 3, z: z + (random() - .5) * 3, kind: kinds[i],
  }));
  const water: GroundObstacle[] = [], trees: MapTree[] = [], rocks: MapRock[] = [];
  const occupied: GroundObstacle[] = [];
  const fits = (o: GroundObstacle, shore = 0) => Math.hypot(o.x, o.z) - o.radius >= SPAWN_RADIUS + .4
    && Math.hypot(o.x, o.z) + o.radius <= MAP_BOUNDARY - 1.3
    && roadDistance(o.x, o.z) >= o.radius + ROAD_WIDTH / 2 + .15 + shore;
  for (const region of regions.filter(r => r.kind === 'pond')) {
    const radius = 3.3 + random() * 1.2, angle = random() * Math.PI * 2;
    const main = { x: region.x, z: region.z, radius };
    const lobe = { x: region.x + Math.sin(angle) * 2.4, z: region.z + Math.cos(angle) * 2.4, radius: radius * .64 };
    // Both lobes are placed together; overlapping water is intentional.
    if (fits(main, .7) && fits(lobe, .7)) { water.push(main, lobe); occupied.push(main, lobe); }
  }
  const place = (region: TerrainRegion, radius: number): GroundObstacle | undefined => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = region.kind === 'pond' ? 7 + random() * 3 : region.kind === 'clearing' ? 5.5 + random() * 3 : random() * 8.5;
      const o = { x: region.x + Math.sin(angle) * distance, z: region.z + Math.cos(angle) * distance, radius };
      if (!fits(o) || occupied.some(other => Math.hypot(o.x - other.x, o.z - other.z) < o.radius + other.radius + 3.2)) continue;
      occupied.push(o);
      return o;
    }
    return undefined;
  };
  for (const region of regions) {
    const treeCount = region.kind === 'grove' ? 10 + Math.floor(random() * 3) : region.kind === 'clearing' ? 5 : 4;
    for (let i = 0; i < treeCount; i++) {
      const point = place(region, .65);
      if (point) trees.push([point.x, point.z, Math.floor(random() * 3)]);
    }
    const rockCount = region.kind === 'rocky' ? 4 + Math.floor(random() * 3) : region.kind === 'pond' ? 2 : 1;
    for (let i = 0; i < rockCount; i++) {
      const point = place(region, .8);
      if (point) rocks.push([point.x, point.z]);
    }
  }
  return { water, trees, rocks, regions };
}

export interface GeneratedWorld {
  seed: string; version: number; attempt: number; fallback: boolean;
  layout: WorldLayout; validation: LayoutValidation;
}

/** Pure, deterministic and bounded. No renderer, global RNG or network required. */
export function generateWorld(input: string | number): GeneratedWorld {
  const seed = Array.from(String(input).trim()).slice(0, 64).join('') || '0';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const layout = candidate('map-v' + MAP_VERSION + ':' + seed + ':' + attempt);
    // Do not silently lose a region when its water or props could not fit.
    if (layout.water.length !== layout.regions.filter(r => r.kind === 'pond').length * 2 || layout.trees.length < 18 || layout.rocks.length < 5) continue;
    const validation = validateLayout(layout);
    if (validation.valid) return { seed, version: MAP_VERSION, attempt, fallback: false, layout, validation };
  }
  const fixed = fixedWorldLayout();
  // The old sample includes distant decorative props outside the playable disk.
  const layout: WorldLayout = { ...fixed,
    trees: fixed.trees.filter(([x, z]) => Math.hypot(x, z) + .65 <= MAP_BOUNDARY - .95),
    rocks: fixed.rocks.filter(([x, z]) => Math.hypot(x, z) + .8 <= MAP_BOUNDARY - .95),
  };
  const validation = validateLayout(layout);
  if (!validation.valid) throw new Error('Fixed map safety check failed: ' + validation.issues.join(', '));
  return { seed, version: MAP_VERSION, attempt: MAX_ATTEMPTS, fallback: true, layout, validation };
}
