import * as THREE from 'three';
import { crop, pixelTexture, PIXELS_PER_UNIT } from './world-sample';
import { ROAD_WIDTH } from './world-layout';
import type { Obstacle } from './world';

/**
 * Streaming meadow. Chunk coordinates are world-space and independent of load
 * order; only the surrounding 3x3 chunks have GPU objects or collision data.
 */
export const CHUNK_SIZE = 64;
const HALF = CHUNK_SIZE / 2;
const ACTIVE_RADIUS = 1;

export interface InfiniteChunkLayout {
  cx: number;
  cz: number;
  biome: 'grove' | 'rocky' | 'clearing';
  bendX: number;
  bendZ: number;
  trees: [number, number, number][];
  rocks: [number, number][];
  water: { x: number; z: number; radius: number }[];
  obstacles: Obstacle[];
}

export function chunkCoordinates(x: number, z: number) {
  return { cx: Math.floor((x + HALF) / CHUNK_SIZE), cz: Math.floor((z + HALF) / CHUNK_SIZE) };
}

function randomFor(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A guaranteed open border and sparse props preserve traversability without an infinite path grid. */
export function generateInfiniteChunk(seed: string, cx: number, cz: number): InfiniteChunkLayout {
  const random = randomFor('infinite-v1:' + seed + ':' + cx + ':' + cz);
  const biome = randomFor('region-v1:' + seed + ':' + Math.floor(cx / 3) + ':' + Math.floor(cz / 3))();
  const forest = biome < .4, rocky = biome > .77;
  const baseX = cx * CHUNK_SIZE - HALF, baseZ = cz * CHUNK_SIZE - HALF;
  const trees: [number, number, number][] = [], rocks: [number, number][] = [];
  const bendX = (random() - .5) * 3.5, bendZ = (random() - .5) * 3.5;
  const water: InfiniteChunkLayout['water'] = [];
  const occupied: { x: number; z: number; radius: number }[] = [];
  if ((cx !== 0 || cz !== 0) && random() < .23) {
    // Keep ponds entirely outside the 4.8-unit-wide cross-chunk roads.
    const x = (random() < .5 ? 12 : 45) + random() * 7;
    const z = (random() < .5 ? 12 : 45) + random() * 7;
    const radius = 3.1 + random() * 1.4;
    const pond = { x, z, radius };
    const lobe = { x: x + 1.7, z: z + 1.1, radius: radius * .6 };
    water.push(pond, lobe);
    occupied.push(pond, lobe);
  }
  const place = (radius: number) => {
    for (let attempt = 0; attempt < 90; attempt++) {
      const x = 4 + random() * (CHUNK_SIZE - 8);
      const z = 4 + random() * (CHUNK_SIZE - 8);
      const wx = baseX + x, wz = baseZ + z;
      if (Math.hypot(wx, wz) < 9 + radius) continue;
      // Open longitudinal and transverse passages join every neighboring chunk.
      if (Math.abs(x - HALF) < 7 || Math.abs(z - HALF) < 7) continue;
      if (occupied.some(o => Math.hypot(x - o.x, z - o.z) < radius + o.radius + 2.4)) continue;
      occupied.push({ x, z, radius });
      return { x, z };
    }
    return undefined;
  };
  for (let i = 0; i < (forest ? 17 : rocky ? 8 : 12); i++) {
    const p = place(.65);
    if (p) trees.push([p.x, p.z, Math.floor(random() * 3)]);
  }
  for (let i = 0; i < (rocky ? 10 : 5); i++) {
    const p = place(.8);
    if (p) rocks.push([p.x, p.z]);
  }
  const obstacles = [
    ...water.map(o => ({ x: baseX + o.x, z: baseZ + o.z, radius: o.radius })),
    ...trees.map(([x, z]) => ({ x: baseX + x, z: baseZ + z, radius: .65 })),
    ...rocks.map(([x, z]) => ({ x: baseX + x, z: baseZ + z, radius: .8 })),
  ];
  return { cx, cz, biome: forest ? 'grove' : rocky ? 'rocky' : 'clearing', bendX, bendZ, trees, rocks, water, obstacles };
}

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    new THREE.ImageLoader().load(import.meta.env.BASE_URL + 'assets/world/' + path, resolve, undefined, reject);
  });
}

type Chunk = { group: THREE.Group; layout: InfiniteChunkLayout; instances: THREE.InstancedMesh[]; groundTexture: THREE.Texture };

/**
 * Bake terrain with the very same 16 pixel/unit native tiles, mud-road strokes,
 * grass tint and pixel-row pond shorelines used by the six-wave challenge map.
 * Each 64x64 chunk is 1024x1024 texture pixels, not a stretched 4x grass tile.
 * Edge roads meet at (0, 32)/(64, 32) and (32, 0)/(32, 64) in every chunk.
 */
function bakeChunkGround(images: readonly HTMLImageElement[], layout: InfiniteChunkLayout) {
  const canvas = document.createElement('canvas');
  const size = CHUNK_SIZE * PIXELS_PER_UNIT;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(PIXELS_PER_UNIT, PIXELS_PER_UNIT);
  const pattern = (image: HTMLImageElement) => {
    const fill = ctx.createPattern(image, 'repeat')!;
    fill.setTransform(new DOMMatrix().scale(1 / PIXELS_PER_UNIT));
    return fill;
  };

  ctx.fillStyle = pattern(images[0]);
  ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
  ctx.fillStyle = layout.biome === 'grove' ? 'rgba(39, 86, 51, .14)' :
    layout.biome === 'rocky' ? 'rgba(164, 146, 112, .17)' : 'rgba(201, 215, 134, .15)';
  ctx.beginPath(); ctx.ellipse(HALF, HALF, 17, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(103, 144, 87, .48)';
  ctx.fillRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);

  // Slight bends add variety without discontinuities or collision on seams.
  const x = HALF + layout.bendX, z = HALF + layout.bendZ;
  const road = new Path2D();
  road.moveTo(0, HALF);
  road.bezierCurveTo(11, HALF, 20, z, x, z);
  road.bezierCurveTo(44, z, 53, HALF, CHUNK_SIZE, HALF);
  road.moveTo(HALF, 0);
  road.bezierCurveTo(HALF, 11, x, 20, x, z);
  road.bezierCurveTo(x, 44, HALF, 53, HALF, CHUNK_SIZE);
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = '#789653'; ctx.lineWidth = ROAD_WIDTH + .6; ctx.stroke(road);
  ctx.strokeStyle = pattern(images[1]); ctx.lineWidth = ROAD_WIDTH; ctx.stroke(road);
  ctx.strokeStyle = 'rgba(185, 159, 111, .42)'; ctx.lineWidth = ROAD_WIDTH; ctx.stroke(road);

  const disk = (p: { x: number; z: number; radius: number }, radius: number, fill: string | CanvasPattern) => {
    ctx.fillStyle = fill;
    for (let row = Math.floor((p.z - radius) * PIXELS_PER_UNIT); row < (p.z + radius) * PIXELS_PER_UNIT; row++) {
      const dz = (row + .5) / PIXELS_PER_UNIT - p.z;
      const half = Math.sqrt(Math.max(0, radius * radius - dz * dz));
      const left = Math.ceil((p.x - half) * PIXELS_PER_UNIT);
      const right = Math.floor((p.x + half) * PIXELS_PER_UNIT);
      if (right > left) ctx.fillRect(left / PIXELS_PER_UNIT, row / PIXELS_PER_UNIT, (right - left) / PIXELS_PER_UNIT, 1 / PIXELS_PER_UNIT);
    }
  };
  for (const p of layout.water) disk(p, p.radius + .7, pattern(images[2]));
  for (const p of layout.water) disk(p, p.radius + .7, 'rgba(116, 139, 102, .46)');
  for (const p of layout.water) disk(p, p.radius + .14, '#588779');
  for (const p of layout.water) disk(p, p.radius, pattern(images[3]));
  for (const p of layout.water) disk(p, p.radius, 'rgba(67, 130, 151, .42)');
  return pixelTexture(canvas);
}

export function createInfiniteWorld(initialSeed: string) {
  const group = new THREE.Group();
  group.name = '无尽草场';
  group.visible = false;
  const obstacles: Obstacle[] = [];
  const chunks = new Map<string, Chunk>();
  const ownedTextures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  // Exactly match the challenge-map trees: foot anchored and 45-degree lean.
  spriteGeometry.translate(0, .5, 0);
  const dummy = new THREE.Object3D();
  let seed = initialSeed, readyFlag = false, disposed = false;
  let centerX = NaN, centerZ = NaN;
  let images: HTMLImageElement[] = [];
  let treeMaterials: THREE.MeshBasicMaterial[] = [];
  let rockMaterial: THREE.MeshBasicMaterial;
  let art: ReturnType<typeof crop>[] = [];

  const disposeChunk = (chunk: Chunk) => {
    for (const instance of chunk.instances) instance.dispose();
    group.remove(chunk.group);
    chunk.group.clear();
    chunk.groundTexture.dispose();
    (chunk.group.userData.groundMaterial as THREE.Material).dispose();
  };

  const release = () => {
    for (const chunk of chunks.values()) disposeChunk(chunk);
    chunks.clear();
    obstacles.length = 0;
  };

  const build = (cx: number, cz: number): Chunk => {
    const layout = generateInfiniteChunk(seed, cx, cz);
    const tile = new THREE.Group();
    tile.name = 'chunk:' + cx + ':' + cz;
    tile.position.set(cx * CHUNK_SIZE - HALF, 0, cz * CHUNK_SIZE - HALF);
    const groundTexture = bakeChunkGround(images, layout);
    const groundMaterial = new THREE.MeshBasicMaterial({ map: groundTexture, color: '#ffffff', toneMapped: false });
    tile.userData.groundMaterial = groundMaterial;
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.name = '像素草地与泥路';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(HALF, 0, HALF);
    tile.add(ground);

    const instances: THREE.InstancedMesh[] = [];
    const addInstances = (points: readonly (readonly number[])[], material: THREE.MeshBasicMaterial, height: number, aspect: number) => {
      if (!points.length) return;
      const mesh = new THREE.InstancedMesh(spriteGeometry, material, points.length);
      for (let i = 0; i < points.length; i++) {
        dummy.position.set(points[i][0], .025, points[i][1]);
        dummy.rotation.set(-Math.PI / 4, 0, 0);
        dummy.scale.set(height * aspect, height, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      tile.add(mesh);
      instances.push(mesh);
    };
    treeMaterials.forEach((mat, variant) => addInstances(layout.trees.filter(tree => tree[2] === variant), mat, variant === 2 ? 4.6 : 4.2, art[variant].aspect));
    addInstances(layout.rocks, rockMaterial, 1.25, art[3].aspect);
    return { group: tile, layout, instances, groundTexture };
  };

  const update = (x: number, z: number) => {
    if (!readyFlag || disposed) return false;
    const current = chunkCoordinates(x, z);
    if (current.cx === centerX && current.cz === centerZ) return false;
    centerX = current.cx; centerZ = current.cz;
    const wanted = new Set<string>();
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++)
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++)
        wanted.add((centerX + dx) + ':' + (centerZ + dz));
    for (const [key, chunk] of chunks) if (!wanted.has(key)) {
      disposeChunk(chunk);
      chunks.delete(key);
    }
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++)
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
        const cx = centerX + dx, cz = centerZ + dz, key = cx + ':' + cz;
        if (!chunks.has(key)) {
          const chunk = build(cx, cz);
          chunks.set(key, chunk);
          group.add(chunk.group);
        }
      }
    obstacles.splice(0, obstacles.length, ...Array.from(chunks.values()).flatMap(chunk => chunk.layout.obstacles));
    return true;
  };

  const ready = Promise.all([
    loadImage('Original Textures/Grass.png'),
    loadImage('Original Textures/Dirt .png'),
    loadImage('Original Textures/Sand.png'),
    loadImage('Original Textures/Water.png'),
    loadImage('Tileset/Decorations/trees.png'),
  ]).then(loaded => {
    if (disposed) return;
    images = loaded.slice(0, 4);
    art = [[0, 0], [32, 32], [32, 64], [64, 32]].map(([x, y]) => crop(loaded[4], x, y, 32));
    ownedTextures.push(...art.map(a => a.texture));
    const spriteMaterial = (texture: THREE.Texture) => new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: .1, toneMapped: false, fog: false, side: THREE.DoubleSide,
    });
    treeMaterials = art.slice(0, 3).map(a => spriteMaterial(a.texture));
    rockMaterial = spriteMaterial(art[3].texture);
    materials.push(...treeMaterials, rockMaterial);
    readyFlag = true;
    update(0, 0);
  });

  return {
    group, obstacles, ready,
    get seed() { return seed; },
    get chunkCount() { return chunks.size; },
    setSeed(nextSeed: string) {
      if (disposed || seed === nextSeed) return;
      seed = nextSeed;
      release();
      centerX = centerZ = NaN;
      update(0, 0);
    },
    update,
    dispose() {
      disposed = true;
      release();
      materials.forEach(material => material.dispose());
      ownedTextures.forEach(texture => texture.dispose());
      groundGeometry.dispose();
      spriteGeometry.dispose();
    },
  };
}
