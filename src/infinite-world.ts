import * as THREE from 'three';
import { crop, pixelTexture } from './world-sample';
import type { Obstacle } from './world';
import type { SpawnViewport } from './spawn-layout';
import { CHUNK_SIZE, chunkCoordinates, type InfiniteChunkLayout } from './infinite-terrain';
import { TerrainBaker, releaseTerrainImage, type PreparedTerrain } from './infinite-terrain-baker';
export { CHUNK_SIZE, chunkCoordinates, generateInfiniteChunk, sampleInfiniteTerrain, sampleInfiniteSurface } from './infinite-terrain';
export type { MeadowProp, InfiniteChunkLayout } from './infinite-terrain';
const HALF = CHUNK_SIZE / 2;
const ACTIVE_RADIUS = 1;

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

/** Nine GPU slots; CPU terrain is queued separately from frame rendering. */
export function createInfiniteWorld(initialSeed: string, onChange = () => {}, onError: (error: unknown) => void = () => {},
  prepareTexture: (texture: THREE.Texture) => void = () => {}) {
  const group = new THREE.Group();
  group.name = '无尽草场'; group.visible = false;
  const obstacles: Obstacle[] = [];
  const chunks = new Map<string, Chunk>(), recycled: Chunk[] = [];
  const prepared = new Map<string, PreparedTerrain>();
  const baker = new TerrainBaker();
  const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  spriteGeometry.translate(0, .5, 0);
  const dummy = new THREE.Object3D();
  let art: { texture: THREE.Texture; aspect: number }[] = [];
  let spriteMaterials: THREE.MeshBasicMaterial[] = [];
  let artReady = false, enabled = false;
  let seed = initialSeed, disposed = false, centerX = 0, centerZ = 0;
  let lastX = NaN, lastZ = NaN, directionX = 0, directionZ = 0, plan = '';
  let epoch = 0, frame = 0, inFlight: string | undefined;
  type Coordinate = { cx: number; cz: number };
  let required = new Map<string, Coordinate>(), ahead = new Map<string, Coordinate>(), focus = new Map<string, Coordinate>();
  const keyOf = (cx: number, cz: number) => cx + ':' + cz;
  const isWanted = (key: string) => required.has(key) || ahead.has(key);
  const complete = () => required.size > 0 && [...required.keys()].every(key => chunks.has(key));
  const playable = () => focus.size > 0 && [...focus.keys()].every(key => chunks.has(key));
  const clearPrepared = () => {
    for (const result of prepared.values()) releaseTerrainImage(result.image);
    prepared.clear();
  };
  const cancel = () => {
    epoch++; cancelAnimationFrame(frame); frame = 0; baker.cancel(); inFlight = undefined;
    clearPrepared(); required.clear(); ahead.clear(); focus.clear(); plan = '';
    lastX = lastZ = NaN; directionX = directionZ = 0;
  };
  const release = () => {
    for (const chunk of chunks.values()) { group.remove(chunk.group); recycled.push(chunk); }
    chunks.clear(); obstacles.length = 0;
  };
  const place = (chunk: Chunk) => {
    const { cx, cz } = chunk.layout;
    chunk.group.name = 'chunk:' + cx + ':' + cz;
    chunk.group.position.set(cx * CHUNK_SIZE - HALF, 0, cz * CHUNK_SIZE - HALF);
    const layout = chunk.layout;
    const lists = [0, 1, 2].map(variant => layout.trees.filter(p => p.variant === variant));
    lists.push(layout.rocks, layout.flowers, layout.grass, layout.cacti);
    const heights = [4.2, 4.2, 4.6, .7, 1.05, .9, 2.5];
    for (let type = 0; type < lists.length; type++) {
      const mesh = chunk.instances[type]; mesh.count = lists[type].length;
      lists[type].forEach((prop, index) => {
        const height = heights[type] * prop.scale;
        dummy.position.set(prop.x, .025, prop.z); dummy.rotation.set(-Math.PI / 4, 0, 0);
        dummy.scale.set(height * art[type].aspect, height, 1); dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
    return chunk;
  };
  const configureTexture = (texture: THREE.Texture, image: PreparedTerrain['image']) => {
    texture.image = image; texture.flipY = !('close' in image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false; texture.needsUpdate = true;
  };
  const install = (result: PreparedTerrain) => {
    // Retain the previous neighborhood until a replacement is actually ready.
    // Recycle only an off-neighborhood slot, never remove a whole strip up front.
    if (!recycled.length && chunks.size >= Math.max(9, required.size)) {
      for (const [key, old] of chunks) if (!required.has(key)) {
        chunks.delete(key); group.remove(old.group); recycled.push(old); break;
      }
    }
    let chunk = recycled.pop();
    if (chunk) {
      releaseTerrainImage(chunk.groundTexture.image as PreparedTerrain['image']);
      chunk.layout = result.layout; configureTexture(chunk.groundTexture, result.image);
    } else {
      const tile = new THREE.Group(), groundTexture = new THREE.Texture();
      configureTexture(groundTexture, result.image);
      const material = new THREE.MeshBasicMaterial({ map: groundTexture, toneMapped: false, fog: false });
      const ground = new THREE.Mesh(groundGeometry, material);
      ground.name = '像素草地与沙地'; ground.rotation.x = -Math.PI / 2;
      ground.position.set(HALF, 0, HALF); tile.add(ground);
      const instances = spriteMaterials.map((mat, type) => {
        const mesh = new THREE.InstancedMesh(spriteGeometry, mat, type < 4 ? 64 : 256);
        mesh.name = ['像素树-阔叶', '像素树-圆冠', '像素树-松树', '小石头', '小花', '小草', '仙人掌'][type];
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tile.add(mesh); return mesh;
      });
      chunk = { group: tile, groundTexture, material, layout: result.layout, instances };
    }
    place(chunk); chunks.set(keyOf(result.layout.cx, result.layout.cz), chunk); group.add(chunk.group);
    // Upload one terrain texture now instead of deferring all nine to the first draw.
    prepareTexture(chunk.groundTexture);
    obstacles.splice(0, obstacles.length, ...Array.from(chunks.values()).flatMap(c => c.layout.obstacles));
    onChange();
  };
  const nearest = (entries: Map<string, Coordinate>, available: (key: string) => boolean) =>
    [...entries].filter(([key]) => available(key)).sort((a, b) =>
      Math.hypot(a[1].cx - centerX, a[1].cz - centerZ) - Math.hypot(b[1].cx - centerX, b[1].cz - centerZ))[0];
  const schedule = () => {
    if (!frame && enabled && !disposed) frame = requestAnimationFrame(pump);
  };
  const pump = () => {
    frame = 0;
    if (!enabled || disposed) return;
    // Only this callback installs chunks, at most once per animation frame.
    const installable = (key: string) => prepared.has(key) && !chunks.has(key);
    const finished = artReady ? nearest(focus, installable) ?? nearest(required, installable) : undefined;
    if (finished) {
      const result = prepared.get(finished[0])!; prepared.delete(finished[0]);
      try { install(result); } catch (error) {
        if (!chunks.has(finished[0])) releaseTerrainImage(result.image);
        onError(error); return;
      }
    }
    if (!inFlight) {
      const missing = (key: string) => !chunks.has(key) && !prepared.has(key);
      const next = nearest(focus, missing) ?? nearest(required, missing) ?? nearest(ahead, missing);
      if (next) {
        const [key, { cx, cz }] = next, version = epoch;
        inFlight = key;
        void baker.bake(seed, cx, cz).then(result => {
          if (disposed || version !== epoch || !enabled) { releaseTerrainImage(result.image); return; }
          inFlight = undefined;
          if (isWanted(key)) prepared.set(key, result); else releaseTerrainImage(result.image);
          schedule();
        }).catch(error => {
          if (disposed || version !== epoch || !enabled) return;
          inFlight = undefined; onError(error);
        });
      }
    }
    if (artReady && [...required.keys()].some(key => prepared.has(key))) schedule();
  };
  const neighborhood = (cx: number, cz: number) => {
    const result = new Map<string, Coordinate>();
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++)
      result.set(keyOf(cx + dx, cz + dz), { cx: cx + dx, cz: cz + dz });
    return result;
  };
  const update = (x: number, z: number, view?: SpawnViewport) => {
    if (disposed || !enabled) return false;
    const current = chunkCoordinates(x, z);
    if (Number.isFinite(lastX) && Math.hypot(x - lastX, z - lastZ) > .001) {
      directionX = Math.sign(x - lastX); directionZ = Math.sign(z - lastZ);
    }
    lastX = x; lastZ = z;
    // Start the next strip about 24 world units before crossing a chunk edge.
    const predicted = chunkCoordinates(x + directionX * 24, z + directionZ * 24);
    // Only the visible/spawnable area blocks entry. The surrounding ring is background work.
    const first = chunkCoordinates(Math.min(x - 29, view ? view.x - view.halfWidth - 5 : x - 29),
      Math.min(z - 29, view ? view.z - view.halfDepth - 5 : z - 29));
    const last = chunkCoordinates(Math.max(x + 29, view ? view.x + view.halfWidth + 5 : x + 29),
      Math.max(z + 29, view ? view.z + view.halfDepth + 5 : z + 29));
    const nextPlan = [current.cx, current.cz, predicted.cx, predicted.cz, first.cx, first.cz, last.cx, last.cz].join(':');
    if (plan === nextPlan) return false;
    const neighborhoodChanged = !required.size || centerX !== current.cx || centerZ !== current.cz;
    plan = nextPlan; centerX = current.cx; centerZ = current.cz;
    required = neighborhood(centerX, centerZ); ahead = neighborhood(predicted.cx, predicted.cz);
    focus = new Map();
    for (let cz = first.cz; cz <= last.cz; cz++) for (let cx = first.cx; cx <= last.cx; cx++) {
      const key = keyOf(cx, cz), coordinate = { cx, cz };
      focus.set(key, coordinate); required.set(key, coordinate);
    }
    for (const key of required.keys()) ahead.delete(key);
    // Keep the worker's current job on direction changes; repeated termination starves generation.
    for (const [key, result] of prepared) if (!isWanted(key)) { releaseTerrainImage(result.image); prepared.delete(key); }
    schedule(); return neighborhoodChanged || !playable();
  };
  // Scenery resources may load eagerly, but terrain jobs require explicit enablement.
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    new THREE.ImageLoader().load(import.meta.env.BASE_URL + 'assets/world/Tileset/Decorations/trees.png', resolve, undefined, reject);
  }).then(image => {
    if (disposed) return;
    art = [[0, 0], [32, 32], [32, 64], [64, 0]].map(([x, y]) => crop(image, x, y, 32));
    art.push(meadowDetail('flower'), meadowDetail('grass')); art.push(crop(image, 32, 0, 32));
    spriteMaterials = art.map(a => new THREE.MeshBasicMaterial({
      map: a.texture, transparent: true, alphaTest: .1, toneMapped: false, fog: false,
    }));
    artReady = true; schedule();
  });
  return {
    group, obstacles, ready,
    get seed() { return seed; },
    get chunkCount() { return chunks.size; },
    get complete() { return complete(); },
    get playable() { return playable(); },
    setEnabled(next: boolean) {
      if (disposed || enabled === next) return;
      enabled = next;
      if (!enabled) cancel();
    },
    setSeed(nextSeed: string) {
      if (disposed || seed === nextSeed) return;
      cancel(); seed = nextSeed; release();
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true; cancel(); release();
      for (const chunk of recycled) {
        chunk.instances.forEach(mesh => mesh.dispose());
        releaseTerrainImage(chunk.groundTexture.image as PreparedTerrain['image']);
        chunk.groundTexture.dispose(); chunk.material.dispose(); chunk.group.clear();
      }
      spriteMaterials.forEach(material => material.dispose()); art.forEach(a => a.texture.dispose());
      recycled.length = 0; groundGeometry.dispose(); spriteGeometry.dispose();
    },
  };
}
