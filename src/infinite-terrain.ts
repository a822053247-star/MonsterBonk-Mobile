import type { Obstacle } from './world';

export const TERRAIN_PIXELS_PER_UNIT = 16;
type TerrainContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const lerp = (a: number, b: number, t: number) => (1 - t) * a + t * b;

export const CHUNK_SIZE = 64;
const HALF = CHUNK_SIZE / 2;
const TERRAIN_STEP = .125;
const CONTOUR_STEP = .5;
const EDGE_DISPLACEMENT = .1325;
const GRASS = '#359b46';
const SAND = '#c5b354';
const SOIL = '#c49d49';
type Surface = 'grass' | 'soil' | 'sand';
const SURFACE_COLORS: Record<Surface, string> = { grass: GRASS, soil: SOIL, sand: SAND };

export interface MeadowProp { x: number; z: number; variant: number; scale: number }
export interface InfiniteChunkLayout {
  cx: number; cz: number; seed: string; obstacles: Obstacle[];
  trees: MeadowProp[]; rocks: MeadowProp[]; cacti: MeadowProp[];
  flowers: MeadowProp[]; grass: MeadowProp[];
}

export function chunkCoordinates(x: number, z: number) {
  return { cx: Math.floor((x + HALF) / CHUNK_SIZE), cz: Math.floor((z + HALF) / CHUNK_SIZE) };
}

function seedHash(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function hashAt(seed: number, x: number, z: number) {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function noise(seed: number, x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const top = lerp(hashAt(seed, ix, iz), hashAt(seed, ix + 1, iz), u);
  const bottom = lerp(hashAt(seed, ix, iz + 1), hashAt(seed, ix + 1, iz + 1), u);
  return lerp(top, bottom, v);
}

function contourField(seed: number, x: number, z: number) {
  return filteredContour(seed, Math.round(x / CONTOUR_STEP), Math.round(z / CONTOUR_STEP));
}

function rawContour(seed: number, x: number, z: number) {
  return noise(seed, x / 26, z / 26) * .76 +
    noise(seed ^ 0x7f4a, x / 9, z / 9) * .19 + noise(seed ^ 0x12ef, x / 3, z / 3) * .05;
}

type ContourPoint = { x: number; z: number; raw: number; value?: number };
const contourCaches = new Map<number, Map<string, ContourPoint>>();
const MIN_SAND_VERTICES = 64;

/** Reject small connected sand islands in absolute world coordinates. Bounded
 * searches cross chunk borders, so loading order and texture seams cannot change
 * the verdict. Cache storage is capped independently of travel distance. */
function filteredContour(seed: number, x: number, z: number, raw?: number) {
  let cache = contourCaches.get(seed);
  if (!cache) {
    if (contourCaches.size >= 2) contourCaches.delete(contourCaches.keys().next().value!);
    cache = new Map(); contourCaches.set(seed, cache);
  }
  if (cache.size > 65_536) cache.clear();
  const pointAt = (px: number, pz: number, supplied?: number) => {
    const key = px + ':' + pz;
    let p = cache!.get(key);
    if (!p) {
      p = { x: px, z: pz, raw: supplied ?? rawContour(seed, px * CONTOUR_STEP, pz * CONTOUR_STEP) };
      if (p.raw <= .53) p.value = p.raw;
      cache!.set(key, p);
    }
    return p;
  };
  const first = pointAt(x, z, raw);
  if (first.value !== undefined) return first.value;
  const queue = [first], seen = new Set<ContourPoint>(queue);
  let large = false;
  search: for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const next = pointAt(p.x + dx, p.z + dz);
      if (next.raw <= .53 || seen.has(next)) continue;
      if (next.value !== undefined) { large = next.value > .53; break search; }
      seen.add(next); queue.push(next);
      if (queue.length >= MIN_SAND_VERTICES) { large = true; break search; }
    }
  }
  for (const p of queue) p.value = large ? p.raw : Math.min(.52, 1.06 - p.raw);
  return first.value!;
}

function edgeTerrain(seed: number, x: number, z: number, field: number, gradient: number): Surface {
  // Edge decoration may nibble an existing sand region, but cannot introduce a
  // new sand pixel into grass or resurrect a sand island removed by the filter.
  if (field <= .53) return 'grass';
  // Rounded larger lobes plus short, uneven grass tips and nicks, all in world
  // space. Apply detail only along the contour, never as noise over the whole map.
  // Scale by the local slope so diagonal and vertical edges receive the same
  // world-space detail as shallow edges, without oversized teeth on flat contours.
  if (Math.abs(field - .53) < gradient * EDGE_DISPLACEMENT) {
    // Keep the perturbation slope below the underlying contour slope. Stronger
    // high-frequency offsets can fold one boundary into detached sand flecks.
    field += Math.min(0, gradient * ((noise(seed ^ 0x5f37, x / .7, z / .7) - .5) * .24 +
      (noise(seed ^ 0x91ab, x / .19, z / .19) - .5) * .025));
  }
  if (field <= .53) return 'grass';
  // Exposed ochre soil sits between the grass lip and the open sand. Vary its
  // width independently of the grass silhouette so it breaks, widens and tucks
  // into little notches instead of becoming a uniform stroke around the region.
  if (field - .53 < gradient * .3) {
    const width = Math.max(0, -.04 + noise(seed ^ 0x3c6e, x / .9, z / .9) * .32);
    if (field - .53 < gradient * width) return 'soil';
  }
  return 'sand';
}

function terrainAt(seed: number, x: number, z: number): Surface {
  const wx = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP;
  const wz = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
  const left = Math.floor(wx / CONTOUR_STEP) * CONTOUR_STEP;
  const top = Math.floor(wz / CONTOUR_STEP) * CONTOUR_STEP;
  const u = (wx - left) / CONTOUR_STEP, v = (wz - top) / CONTOUR_STEP;
  const a = contourField(seed, left, top), b = contourField(seed, left + CONTOUR_STEP, top);
  const c = contourField(seed, left, top + CONTOUR_STEP), d = contourField(seed, left + CONTOUR_STEP, top + CONTOUR_STEP);
  const field = lerp(lerp(a, b, u), lerp(c, d, u), v);
  const dx = lerp(b - a, d - c, v) / CONTOUR_STEP;
  const dz = lerp(c - a, d - b, u) / CONTOUR_STEP;
  return edgeTerrain(seed, wx, wz, field, Math.sqrt(dx * dx + dz * dz));
}

export function sampleInfiniteTerrain(seed: string, x: number, z: number) {
  return terrainAt(seedHash(seed), x, z) === 'grass' ? 'grass' : 'sand';
}

export function sampleInfiniteSurface(seed: string, x: number, z: number): Surface {
  return terrainAt(seedHash(seed), x, z);
}

/** Sparse, seeded scenery. Only trunks and rocks participate in collision. */
function* layoutSteps(seed: string, cx: number, cz: number): Generator<void, InfiniteChunkLayout> {
  const layout: InfiniteChunkLayout = { cx, cz, seed, obstacles: [], trees: [], rocks: [], cacti: [], flowers: [], grass: [] };
  const hash = seedHash(seed), left = cx * CHUNK_SIZE - HALF, top = cz * CHUNK_SIZE - HALF;
  for (let z = 4; z < CHUNK_SIZE; z += 8) {
    yield;
    for (let x = 4; x < CHUNK_SIZE; x += 8) {
      yield;
      const gx = Math.floor((left + x) / 8), gz = Math.floor((top + z) / 8);
      const px = x + (hashAt(hash ^ 0xab31, gx, gz) - .5) * 4;
      const pz = z + (hashAt(hash ^ 0xcd53, gx, gz) - .5) * 4;
      const wx = left + px, wz = top + pz;
      if (Math.hypot(wx, wz) < 8) continue;
      const chance = hashAt(hash ^ 0xfe72, gx, gz);
      const surface = sampleInfiniteSurface(seed, wx, wz);
      const prop = { x: px, z: pz, variant: Math.floor(hashAt(hash ^ 0x71da, gx, gz) * 3),
        scale: .85 + hashAt(hash ^ 0x8ace, gx, gz) * .3 };
      if (surface === 'grass' && chance < .43) {
        layout.trees.push(prop);
        layout.obstacles.push({ x: wx, z: wz, radius: .65 * prop.scale });
      } else if (surface === 'sand' && chance < .43) {
        layout.cacti.push(prop);
        layout.obstacles.push({ x: wx, z: wz, radius: .5 * prop.scale });
      } else if (chance > .76) {
        layout.rocks.push(prop);
        layout.obstacles.push({ x: wx, z: wz, radius: .42 * prop.scale });
      }
    }
  }
  for (let z = 2; z < CHUNK_SIZE; z += 4) {
    yield;
    for (let x = 2; x < CHUNK_SIZE; x += 4) {
      yield;
      const gx = Math.floor((left + x) / 4), gz = Math.floor((top + z) / 4);
      const px = x + (hashAt(hash ^ 0x4391, gx, gz) - .5) * 2;
      const pz = z + (hashAt(hash ^ 0xb461, gx, gz) - .5) * 2;
      const wx = left + px, wz = top + pz;
      if (sampleInfiniteSurface(seed, wx, wz) !== 'grass' ||
        layout.obstacles.some(o => Math.hypot(o.x - wx, o.z - wz) < o.radius + .65)) continue;
      const chance = hashAt(hash ^ 0xd692, gx, gz);
      const prop = { x: px, z: pz, variant: 0, scale: .8 + hashAt(hash ^ 0x2459, gx, gz) * .4 };
      if (chance >= .12 && chance < .28) layout.flowers.push(prop);
      else if (chance >= .28 && chance < .48) layout.grass.push(prop);
    }
  }
  return layout;
}

export function generateInfiniteChunk(seed: string, cx: number, cz: number): InfiniteChunkLayout {
  const steps = layoutSteps(seed, cx, cz);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** Cache the small noise lattice once per bake rather than hashing per texel. */
function chunkNoise(seed: number, left: number, top: number, scale: number) {
  const minX = Math.floor(left / scale), minZ = Math.floor(top / scale);
  const width = Math.floor((left + CHUNK_SIZE) / scale) - minX + 2;
  const height = Math.floor((top + CHUNK_SIZE) / scale) - minZ + 2;
  const lattice = new Float64Array(width * height);
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++)
    lattice[z * width + x] = hashAt(seed, minX + x, minZ + z);
  return (x: number, z: number) => {
    const sx = x / scale, sz = z / scale, ix = Math.floor(sx), iz = Math.floor(sz);
    const fx = sx - ix, fz = sz - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const index = (iz - minZ) * width + ix - minX;
    return lerp(
      lerp(lattice[index], lattice[index + 1], u),
      lerp(lattice[index + width], lattice[index + width + 1], u), v);
  };
}

export function* terrainSteps(seedText: string, cx: number, cz: number, ctx: TerrainContext): Generator<void, InfiniteChunkLayout> {
  const layout = yield* layoutSteps(seedText, cx, cz);
  const size = CHUNK_SIZE * TERRAIN_PIXELS_PER_UNIT;
  ctx.imageSmoothingEnabled = false;
  const seed = seedHash(layout.seed);
  const left = layout.cx * CHUNK_SIZE - HALF, top = layout.cz * CHUNK_SIZE - HALF;
  const broad = chunkNoise(seed, left, top, 26);
  const medium = chunkNoise(seed ^ 0x7f4a, left, top, 9);
  const fine = chunkNoise(seed ^ 0x12ef, left, top, 3);
  // Share contour vertices between finer raster samples. This keeps the finer,
  // irregular silhouette inexpensive when recycling nine distant chunks at once.
  const vertices = CHUNK_SIZE / CONTOUR_STEP + 1;
  const contour = new Float64Array(vertices * vertices);
  for (let z = 0; z < vertices; z++) {
    yield;
    for (let x = 0; x < vertices; x++) {
      if (x % 8 === 0) yield;
      const wx = left + x * CONTOUR_STEP, wz = top + z * CONTOUR_STEP;
      const raw = broad(wx, wz) * .76 + medium(wx, wz) * .19 + fine(wx, wz) * .05;
      contour[z * vertices + x] = filteredContour(seed, Math.round(wx / CONTOUR_STEP), Math.round(wz / CONTOUR_STEP), raw);
    }
  }
  const step = TERRAIN_STEP * TERRAIN_PIXELS_PER_UNIT;
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, size, size);
  // Paint contiguous color runs, including the independently shaped soil fringe.
  for (let z = 0; z < size; z += step) {
    yield;
    let start = 0;
    let current: Surface = 'grass';
    const gz = z / (CONTOUR_STEP * TERRAIN_PIXELS_PER_UNIT), iz = Math.floor(gz), v = gz - iz;
    for (let x = 0; x <= size; x += step) {
      const wx = left + x / TERRAIN_PIXELS_PER_UNIT, wz = top + z / TERRAIN_PIXELS_PER_UNIT;
      let surface: Surface | null = null;
      if (x < size) {
        const gx = x / (CONTOUR_STEP * TERRAIN_PIXELS_PER_UNIT), ix = Math.floor(gx), u = gx - ix;
        const i = iz * vertices + ix;
        const field = lerp(
          lerp(contour[i], contour[i + 1], u),
          lerp(contour[i + vertices], contour[i + vertices + 1], u), v);
        const dx = lerp(contour[i + 1] - contour[i],
          contour[i + vertices + 1] - contour[i + vertices], v) / CONTOUR_STEP;
        const dz = lerp(contour[i + vertices] - contour[i],
          contour[i + vertices + 1] - contour[i + 1], u) / CONTOUR_STEP;
        surface = edgeTerrain(seed, wx, wz, field, Math.sqrt(dx * dx + dz * dz));
      }
      if (surface !== current) {
        if (current !== 'grass' && x > start) {
          ctx.fillStyle = SURFACE_COLORS[current];
          ctx.fillRect(start, z, x - start, step);
        }
        start = x;
        if (surface) current = surface;
      }
    }
  }
  // Sparse flat ground marks, never sprites or collision objects. Each motif stays
  // inside its world-aligned 2x2 cell so neighboring chunks need no blending.
  const pixel = 2;
  for (let z = 0; z < CHUNK_SIZE; z += 2) {
    yield;
    for (let x = 0; x < CHUNK_SIZE; x += 2) {
      yield;
      const wx = left + x, wz = top + z;
      const random = hashAt(seed ^ 0x6a09, wx / 2, wz / 2);
      if (random > .58) continue;
      const px = x * TERRAIN_PIXELS_PER_UNIT + 4 + Math.floor(hashAt(seed, wx, wz) * 9) * pixel;
      const pz = z * TERRAIN_PIXELS_PER_UNIT + 4 + Math.floor(hashAt(seed ^ 0xbb67, wx, wz) * 9) * pixel;
      const kind = terrainAt(seed, left + px / TERRAIN_PIXELS_PER_UNIT, top + pz / TERRAIN_PIXELS_PER_UNIT);
      if (kind === 'soil') continue;
      if (terrainAt(seed, left + (px + 8) / TERRAIN_PIXELS_PER_UNIT, top + (pz + 8) / TERRAIN_PIXELS_PER_UNIT) !== kind) continue;
      if (kind === 'grass') {
        // Separate, tapered blades rather than a joined U-shaped ground stamp.
        // Small shifts in count, height and lean avoid a repeated pictogram.
        const variation = hashAt(seed ^ 0x83e1, wx, wz);
        const blades = 1 + Math.floor(variation * 3);
        ctx.fillStyle = random < .2 ? '#409846' : '#328e40';
        for (let blade = 0; blade < blades; blade++) {
          const height = 2 + Math.floor(hashAt(seed ^ (blade + 0x392a), wx, wz) * 3);
          const bx = px + blade * 3;
          const by = pz + 5 - (blade % 2);
          const lean = variation < .5 ? -1 : 1;
          ctx.fillRect(bx, by - height + 1, 1, height);
          ctx.fillRect(bx + lean, by - height, 1, 2);
        }
      } else {
        ctx.fillStyle = random < .16 ? '#b8a04c' : '#c29f4d';
        ctx.fillRect(px, pz + pixel, pixel * 4, pixel);
        ctx.fillRect(px + pixel, pz, pixel * 2, pixel * 3);
      }
    }
  }
  return layout;
}

