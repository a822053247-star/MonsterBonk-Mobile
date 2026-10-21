import * as THREE from 'three';
import { crop, pixelTexture, PIXELS_PER_UNIT } from './world-sample';
import type { Obstacle } from './world';

export const CHUNK_SIZE = 64;
const HALF = CHUNK_SIZE / 2;
const ACTIVE_RADIUS = 1;
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
  const top = THREE.MathUtils.lerp(hashAt(seed, ix, iz), hashAt(seed, ix + 1, iz), u);
  const bottom = THREE.MathUtils.lerp(hashAt(seed, ix, iz + 1), hashAt(seed, ix + 1, iz + 1), u);
  return THREE.MathUtils.lerp(top, bottom, v);
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
  const field = THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
  const dx = THREE.MathUtils.lerp(b - a, d - c, v) / CONTOUR_STEP;
  const dz = THREE.MathUtils.lerp(c - a, d - b, u) / CONTOUR_STEP;
  return edgeTerrain(seed, wx, wz, field, Math.sqrt(dx * dx + dz * dz));
}

export function sampleInfiniteTerrain(seed: string, x: number, z: number) {
  return terrainAt(seedHash(seed), x, z) === 'grass' ? 'grass' : 'sand';
}

export function sampleInfiniteSurface(seed: string, x: number, z: number): Surface {
  return terrainAt(seedHash(seed), x, z);
}

/** Sparse, seeded scenery. Only trunks and rocks participate in collision. */
export function generateInfiniteChunk(seed: string, cx: number, cz: number): InfiniteChunkLayout {
  const layout: InfiniteChunkLayout = { cx, cz, seed, obstacles: [], trees: [], rocks: [], cacti: [], flowers: [], grass: [] };
  const hash = seedHash(seed), left = cx * CHUNK_SIZE - HALF, top = cz * CHUNK_SIZE - HALF;
  for (let z = 4; z < CHUNK_SIZE; z += 8) for (let x = 4; x < CHUNK_SIZE; x += 8) {
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
  for (let z = 2; z < CHUNK_SIZE; z += 4) for (let x = 2; x < CHUNK_SIZE; x += 4) {
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
  return layout;
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
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(lattice[index], lattice[index + 1], u),
      THREE.MathUtils.lerp(lattice[index + width], lattice[index + width + 1], u), v);
  };
}

function bakeChunkGround(layout: InfiniteChunkLayout, reused?: THREE.Texture) {
  const canvas = (reused?.image as HTMLCanvasElement | undefined) ?? document.createElement('canvas');
  const size = CHUNK_SIZE * PIXELS_PER_UNIT;
  if (!reused) canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
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
  for (let z = 0; z < vertices; z++) for (let x = 0; x < vertices; x++) {
    const wx = left + x * CONTOUR_STEP, wz = top + z * CONTOUR_STEP;
    const raw = broad(wx, wz) * .76 + medium(wx, wz) * .19 + fine(wx, wz) * .05;
    contour[z * vertices + x] = filteredContour(seed, Math.round(wx / CONTOUR_STEP), Math.round(wz / CONTOUR_STEP), raw);
  }
  const step = TERRAIN_STEP * PIXELS_PER_UNIT;
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, size, size);
  // Paint contiguous color runs, including the independently shaped soil fringe.
  for (let z = 0; z < size; z += step) {
    let start = 0;
    let current: Surface = 'grass';
    const gz = z / (CONTOUR_STEP * PIXELS_PER_UNIT), iz = Math.floor(gz), v = gz - iz;
    for (let x = 0; x <= size; x += step) {
      const wx = left + x / PIXELS_PER_UNIT, wz = top + z / PIXELS_PER_UNIT;
      let surface: Surface | null = null;
      if (x < size) {
        const gx = x / (CONTOUR_STEP * PIXELS_PER_UNIT), ix = Math.floor(gx), u = gx - ix;
        const i = iz * vertices + ix;
        const field = THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(contour[i], contour[i + 1], u),
          THREE.MathUtils.lerp(contour[i + vertices], contour[i + vertices + 1], u), v);
        const dx = THREE.MathUtils.lerp(contour[i + 1] - contour[i],
          contour[i + vertices + 1] - contour[i + vertices], v) / CONTOUR_STEP;
        const dz = THREE.MathUtils.lerp(contour[i + vertices] - contour[i],
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
  for (let z = 0; z < CHUNK_SIZE; z += 2) for (let x = 0; x < CHUNK_SIZE; x += 2) {
    const wx = left + x, wz = top + z;
    const random = hashAt(seed ^ 0x6a09, wx / 2, wz / 2);
    if (random > .58) continue;
    const px = x * PIXELS_PER_UNIT + 4 + Math.floor(hashAt(seed, wx, wz) * 9) * pixel;
    const pz = z * PIXELS_PER_UNIT + 4 + Math.floor(hashAt(seed ^ 0xbb67, wx, wz) * 9) * pixel;
    const kind = terrainAt(seed, left + px / PIXELS_PER_UNIT, top + pz / PIXELS_PER_UNIT);
    if (kind === 'soil') continue;
    if (terrainAt(seed, left + (px + 8) / PIXELS_PER_UNIT, top + (pz + 8) / PIXELS_PER_UNIT) !== kind) continue;
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
  if (reused) { reused.needsUpdate = true; return reused; }
  return pixelTexture(canvas);
}

type Chunk = { group: THREE.Group; groundTexture: THREE.Texture; material: THREE.MeshBasicMaterial;
  instances: THREE.InstancedMesh[]; layout: InfiniteChunkLayout };

/** Tiny native pixel sprites complement the challenge-map tree and rock atlas. */
function meadowDetail(kind: 'flower' | 'grass') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const rect = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  };
  if (kind === 'flower') {
    rect('#35723c', 7, 7, 2, 8); rect('#56863a', 4, 10, 3, 2); rect('#78a744', 9, 11, 3, 2);
    rect('#d3a15d', 5, 3, 6, 6); rect('#f5dfa1', 6, 2, 4, 2);
    rect('#f5dfa1', 4, 4, 3, 3); rect('#f5dfa1', 9, 4, 3, 3);
    rect('#f5dfa1', 6, 7, 4, 2); rect('#e4b348', 7, 4, 2, 3);
  } else {
    // A loose fan of curved blades, with thin tips and no rectangular base.
    rect('#307b3b', 7, 11, 2, 4);
    rect('#449343', 6, 9, 1, 4); rect('#449343', 5, 7, 1, 3);
    rect('#579e49', 4, 6, 1, 2); rect('#579e49', 3, 5, 1, 2);
    rect('#529d47', 7, 6, 1, 7); rect('#63a84d', 6, 3, 1, 4);
    rect('#76b255', 6, 2, 1, 2);
    rect('#468b40', 9, 10, 1, 4); rect('#539b46', 10, 8, 1, 3);
    rect('#69a74d', 11, 7, 1, 2); rect('#69a74d', 12, 6, 1, 2);
  }
  return { texture: pixelTexture(canvas), aspect: 1 };
}

/** Nine persistent GPU slots stream in every direction without growing memory. */
export function createInfiniteWorld(initialSeed: string) {
  const group = new THREE.Group();
  group.name = '无尽草场'; group.visible = false;
  const obstacles: Obstacle[] = [];
  const chunks = new Map<string, Chunk>(), recycled: Chunk[] = [];
  const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  spriteGeometry.translate(0, .5, 0);
  const dummy = new THREE.Object3D();
  let art: { texture: THREE.Texture; aspect: number }[] = [];
  let spriteMaterials: THREE.MeshBasicMaterial[] = [];
  let artReady = false;
  let seed = initialSeed, disposed = false, centerX = NaN, centerZ = NaN;
  const release = () => {
    for (const chunk of chunks.values()) { group.remove(chunk.group); recycled.push(chunk); }
    chunks.clear();
    obstacles.length = 0;
  };
  const place = (chunk: Chunk, cx: number, cz: number) => {
    chunk.group.name = 'chunk:' + cx + ':' + cz;
    chunk.group.position.set(cx * CHUNK_SIZE - HALF, 0, cz * CHUNK_SIZE - HALF);
    const layout = chunk.layout;
    const lists = [0, 1, 2].map(variant => layout.trees.filter(p => p.variant === variant));
    lists.push(layout.rocks, layout.flowers, layout.grass, layout.cacti);
    const heights = [4.2, 4.2, 4.6, .7, 1.05, .9, 2.5];
    for (let type = 0; type < lists.length; type++) {
      const mesh = chunk.instances[type];
      mesh.count = lists[type].length;
      lists[type].forEach((prop, index) => {
        const height = heights[type] * prop.scale;
        dummy.position.set(prop.x, .025, prop.z);
        dummy.rotation.set(-Math.PI / 4, 0, 0);
        dummy.scale.set(height * art[type].aspect, height, 1); dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
    return chunk;
  };
  const build = (cx: number, cz: number) => {
    const tile = new THREE.Group();
    const layout = generateInfiniteChunk(seed, cx, cz);
    const groundTexture = bakeChunkGround(layout);
    const material = new THREE.MeshBasicMaterial({ map: groundTexture, toneMapped: false, fog: false });
    const ground = new THREE.Mesh(groundGeometry, material);
    ground.name = '像素草地与沙地'; ground.rotation.x = -Math.PI / 2;
    ground.position.set(HALF, 0, HALF); tile.add(ground);
    const instances = spriteMaterials.map((mat, type) => {
      const mesh = new THREE.InstancedMesh(spriteGeometry, mat, type < 4 ? 64 : 256);
      mesh.name = ['像素树-阔叶', '像素树-圆冠', '像素树-松树', '小石头', '小花', '小草', '仙人掌'][type];
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tile.add(mesh); return mesh;
    });
    return place({ group: tile, groundTexture, material, layout, instances }, cx, cz);
  };
  const update = (x: number, z: number) => {
    if (disposed || !artReady) return false;
    const current = chunkCoordinates(x, z);
    if (current.cx === centerX && current.cz === centerZ) return false;
    centerX = current.cx; centerZ = current.cz;
    const wanted = new Set<string>();
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++)
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++)
        wanted.add((centerX + dx) + ':' + (centerZ + dz));
    for (const [key, chunk] of chunks) if (!wanted.has(key)) {
      chunks.delete(key); group.remove(chunk.group); recycled.push(chunk);
    }
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
      const cx = centerX + dx, cz = centerZ + dz, key = cx + ':' + cz;
      if (chunks.has(key)) continue;
      let chunk = recycled.pop();
      if (chunk) {
        chunk.layout = generateInfiniteChunk(seed, cx, cz);
        bakeChunkGround(chunk.layout, chunk.groundTexture);
        place(chunk, cx, cz);
      } else chunk = build(cx, cz);
      chunks.set(key, chunk); group.add(chunk.group);
    }
    obstacles.splice(0, obstacles.length, ...Array.from(chunks.values()).flatMap(chunk => chunk.layout.obstacles));
    return true;
  };
  // Scenery shares the challenge-map atlas; tiny ground decorations are local.
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    new THREE.ImageLoader().load(import.meta.env.BASE_URL + 'assets/world/Tileset/Decorations/trees.png', resolve, undefined, reject);
  }).then(image => {
    if (disposed) return;
    art = [[0, 0], [32, 32], [32, 64], [64, 0]].map(([x, y]) => crop(image, x, y, 32));
    art.push(meadowDetail('flower'), meadowDetail('grass'));
    art.push(crop(image, 32, 0, 32));
    spriteMaterials = art.map(a => new THREE.MeshBasicMaterial({
      map: a.texture, transparent: true, alphaTest: .1, toneMapped: false, fog: false,
    }));
    artReady = true; update(0, 0);
  });
  return {
    group, obstacles, ready,
    get seed() { return seed; },
    get chunkCount() { return chunks.size; },
    setSeed(nextSeed: string) {
      if (disposed || seed === nextSeed) return;
      seed = nextSeed; release(); centerX = centerZ = NaN; update(0, 0);
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true; release();
      for (const chunk of recycled) {
        chunk.instances.forEach(mesh => mesh.dispose());
        chunk.groundTexture.dispose(); chunk.material.dispose(); chunk.group.clear();
      }
      spriteMaterials.forEach(material => material.dispose()); art.forEach(a => a.texture.dispose());
      recycled.length = 0; groundGeometry.dispose(); spriteGeometry.dispose();
    },
  };
}
