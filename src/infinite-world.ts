import * as THREE from 'three';
import { crop } from './world-sample';
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
  const water: InfiniteChunkLayout['water'] = [];
  const occupied: { x: number; z: number; radius: number }[] = [];
  if ((cx !== 0 || cz !== 0) && random() < .23) {
    const x = 18 + random() * 28, z = 18 + random() * 28;
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
      if (Math.abs(x - HALF) < 3.8 || Math.abs(z - HALF) < 3.8) continue;
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
  return { cx, cz, trees, rocks, water, obstacles };
}

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    new THREE.ImageLoader().load(import.meta.env.BASE_URL + 'assets/world/' + path, resolve, undefined, reject);
  });
}

function tiledTexture(image: HTMLImageElement) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.needsUpdate = true;
  return texture;
}

type Chunk = { group: THREE.Group; layout: InfiniteChunkLayout; instances: THREE.InstancedMesh[] };

export function createInfiniteWorld(initialSeed: string) {
  const group = new THREE.Group();
  group.name = '无尽草场';
  group.visible = false;
  const obstacles: Obstacle[] = [];
  const chunks = new Map<string, Chunk>();
  const ownedTextures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  const diskGeometry = new THREE.CircleGeometry(1, 40);
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  spriteGeometry.translate(0, .5, 0);
  const dummy = new THREE.Object3D();
  let seed = initialSeed, readyFlag = false, disposed = false;
  let centerX = NaN, centerZ = NaN;
  let groundMaterial: THREE.MeshBasicMaterial;
  let sandMaterial: THREE.MeshBasicMaterial;
  let waterMaterial: THREE.MeshBasicMaterial;
  let treeMaterials: THREE.MeshBasicMaterial[] = [];
  let rockMaterial: THREE.MeshBasicMaterial;

  const release = () => {
    for (const chunk of chunks.values()) {
      for (const instance of chunk.instances) instance.dispose();
      group.remove(chunk.group);
      chunk.group.clear();
    }
    chunks.clear();
    obstacles.length = 0;
  };

  const disk = (parent: THREE.Group, x: number, z: number, radius: number, y: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(diskGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, radius, 1);
    parent.add(mesh);
  };

  const build = (cx: number, cz: number): Chunk => {
    const layout = generateInfiniteChunk(seed, cx, cz);
    const tile = new THREE.Group();
    tile.name = 'chunk:' + cx + ':' + cz;
    tile.position.set(cx * CHUNK_SIZE - HALF, 0, cz * CHUNK_SIZE - HALF);
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(HALF, 0, HALF);
    tile.add(ground);
    for (const pond of layout.water) {
      disk(tile, pond.x, pond.z, pond.radius + .72, .008, sandMaterial);
      disk(tile, pond.x, pond.z, pond.radius, .012, waterMaterial);
    }
    const instances: THREE.InstancedMesh[] = [];
    const addInstances = (points: readonly (readonly number[])[], material: THREE.MeshBasicMaterial, height: number) => {
      if (!points.length) return;
      const mesh = new THREE.InstancedMesh(spriteGeometry, material, points.length);
      for (let i = 0; i < points.length; i++) {
        dummy.position.set(points[i][0], .025, points[i][1]);
        dummy.rotation.set(-Math.PI / 4, 0, 0);
        dummy.scale.set(height, height, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = false;
      tile.add(mesh);
      instances.push(mesh);
    };
    treeMaterials.forEach((mat, variant) => addInstances(layout.trees.filter(tree => tree[2] === variant), mat, variant === 2 ? 4.6 : 4.2));
    addInstances(layout.rocks, rockMaterial, 1.4);
    return { group: tile, layout, instances };
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
      for (const instance of chunk.instances) instance.dispose();
      group.remove(chunk.group);
      chunk.group.clear();
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
    loadImage('Original Textures/Sand.png'),
    loadImage('Original Textures/Water.png'),
    loadImage('Tileset/Decorations/trees.png'),
  ]).then(([grass, sand, water, sprites]) => {
    if (disposed) return;
    const groundTexture = tiledTexture(grass), sandTexture = tiledTexture(sand), waterTexture = tiledTexture(water);
    ownedTextures.push(groundTexture, sandTexture, waterTexture);
    groundMaterial = new THREE.MeshBasicMaterial({ map: groundTexture, toneMapped: false, color: '#e0efc9' });
    sandMaterial = new THREE.MeshBasicMaterial({ map: sandTexture, toneMapped: false, color: '#e6d7a4' });
    waterMaterial = new THREE.MeshBasicMaterial({ map: waterTexture, toneMapped: false, color: '#9acada' });
    const atlas = [[0, 0], [32, 32], [32, 64], [64, 32]].map(([x, y]) => crop(sprites, x, y, 32));
    ownedTextures.push(...atlas.map(a => a.texture));
    const spriteMaterial = (texture: THREE.Texture) => new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: .1, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
    });
    treeMaterials = atlas.slice(0, 3).map(a => spriteMaterial(a.texture));
    rockMaterial = spriteMaterial(atlas[3].texture);
    materials.push(groundMaterial, sandMaterial, waterMaterial, ...treeMaterials, rockMaterial);
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
      groundGeometry.dispose(); diskGeometry.dispose(); spriteGeometry.dispose();
    },
  };
}
