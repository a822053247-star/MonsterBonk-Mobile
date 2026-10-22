import * as THREE from 'three';
import { createSampleWorld } from './world-sample';
import { fixedWorldLayout } from './world-layout';
import { generateWorld } from './world-generator';
import { createInfiniteWorld } from './infinite-world';

export const WORLD_RADIUS = 33;

function createArenaBoundary() {
  const group = new THREE.Group();
  group.name = '闯关区域隔离';

  // Keep the visible fence just outside the existing movement limit.
  const half = WORLD_RADIUS - 0.5;
  const length = half * 2;
  const outsideStart = half + 0.2;
  const outsideLimit = 64;
  const outsideDepth = outsideLimit - outsideStart;
  const outsideMaterial = new THREE.MeshBasicMaterial({
    color: '#244432', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
  });
  const shade = (width: number, depth: number, x: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), outsideMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.012, z);
    mesh.name = '禁行区暗色地带';
    group.add(mesh);
  };

  // Desaturate the ground outside the enclosure so the playable area reads clearly.
  shade(outsideLimit * 2, outsideDepth, 0, (outsideStart + outsideLimit) / 2);
  shade(outsideLimit * 2, outsideDepth, 0, -(outsideStart + outsideLimit) / 2);
  shade(outsideDepth, length, (outsideStart + outsideLimit) / 2, 0);
  shade(outsideDepth, length, -(outsideStart + outsideLimit) / 2, 0);

  const darkRail = new THREE.MeshBasicMaterial({ color: '#315d42' });
  const brightRail = new THREE.MeshBasicMaterial({ color: '#d8ed9b' });
  const support = new THREE.MeshLambertMaterial({ color: '#57824d', flatShading: true });
  const cornerMaterial = new THREE.MeshBasicMaterial({ color: '#f0e7a6' });
  const addBox = (width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Four straight sides form a readable square enclosure from the game's 2.5D camera.
  for (const sign of [-1, 1]) {
    const edge = sign * half;
    addBox(length, 0.18, 0.28, 0, 0.16, edge, darkRail);
    addBox(length, 0.14, 0.2, 0, 0.5, edge, support);
    addBox(length, 0.17, 0.24, 0, 1.06, edge, brightRail);
    addBox(0.28, 0.18, length, edge, 0.16, 0, darkRail);
    addBox(0.2, 0.14, length, edge, 0.5, 0, support);
    addBox(0.24, 0.17, length, edge, 1.06, 0, brightRail);
  }

  // Instanced fence posts keep the perimeter inexpensive on mobile GPUs.
  const positions: Array<[number, number]> = [];
  for (let p = -half + 2.6; p < half - 1; p += 2.6) {
    positions.push([p, -half], [p, half], [-half, p], [half, p]);
  }
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), support, positions.length);
  const transform = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    transform.position.set(x, 0.6, z);
    transform.updateMatrix();
    posts.setMatrixAt(index, transform.matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  posts.name = '围栏立柱';
  group.add(posts);

  const cornerGeometry = new THREE.BoxGeometry(0.5, 1.5, 0.5);
  for (const x of [-half, half]) for (const z of [-half, half]) {
    const corner = new THREE.Mesh(cornerGeometry, cornerMaterial);
    corner.position.set(x, 0.75, z);
    corner.name = '边界角柱';
    group.add(corner);
  }
  return group;
}
export interface Obstacle { x: number; z: number; radius: number }
export interface World {
  group: THREE.Group; obstacles: Obstacle[];
  readonly sampleActive: boolean;
  readonly infiniteActive: boolean;
  readonly revision: number;
  setSample(enabled: boolean, newMap?: boolean): void;
  setInfinite(enabled: boolean, newMap?: boolean): void;
  update(x: number, z: number): void;
  inspect(): { layout: string; status: string; obstacles: number; seed: string | null; chunks?: number;
    generation: { version: number; attempt: number; fallback: boolean; valid: boolean; walkable: number; reachable: number } | null };
  dispose(): void;
}

/** Keep the old modes and a URL fallback on their original scenery and collisions. */
export function createWorld(): World {
  const legacy = createLegacyWorld();
  const query = new URLSearchParams(window.location.search);
  const fixed = query.get('world') === 'fixed';
  const pinnedSeed = query.get('seed')?.trim() || null;
  let sequence = 0;
  const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36) + '-' + sequence++;
  let generated = fixed ? null : generateWorld(pinnedSeed ?? freshSeed());
  const sample = createSampleWorld(generated?.layout ?? fixedWorldLayout());
  const infinite = createInfiniteWorld(pinnedSeed ?? freshSeed());
  const group = new THREE.Group();
  const boundary = createArenaBoundary();
  group.add(legacy.group, sample.group, infinite.group, boundary);
  // Combat and party systems hold this array by reference.
  const obstacles = [...legacy.obstacles];
  let requested = false, requestedInfinite = false;
  let ready = false, infiniteReady = false, failed = false, infiniteFailed = false, disposed = false;
  let hasRun = false, infiniteRun = false, revision = 0;
  const apply = () => {
    const activeInfinite = requestedInfinite && infiniteReady;
    const activeSample = requested && ready && !activeInfinite;
    legacy.group.visible = !activeSample && !activeInfinite;
    sample.group.visible = activeSample;
    infinite.group.visible = activeInfinite;
    boundary.visible = !activeInfinite;
    obstacles.splice(0, obstacles.length, ...(activeInfinite ? infinite.obstacles : activeSample ? sample.obstacles : legacy.obstacles));
    revision++;
  };
  apply();
  void sample.ready.then(() => { if (!disposed) { ready = true; apply(); } }).catch(error => {
    if (disposed) return;
    failed = true;
    console.warn('Pixel world unavailable; using original map.', error);
    apply();
  });
  void infinite.ready.then(() => { if (!disposed) { infiniteReady = true; apply(); } }).catch(error => {
    if (disposed) return;
    infiniteFailed = true;
    console.warn('Infinite meadow unavailable; using original map.', error);
    apply();
  });
  return {
    group, obstacles,
    get sampleActive() { return sample.group.visible; },
    get infiniteActive() { return infinite.group.visible; },
    get revision() { return revision; },
    setSample(enabled, newMap = false) {
      if (disposed) return;
      if (enabled) {
        if (!fixed && newMap && hasRun && !pinnedSeed) {
          generated = generateWorld(freshSeed());
          sample.setLayout(generated.layout);
        }
        hasRun = true;
      }
      requested = enabled; requestedInfinite = false; apply();
    },
    setInfinite(enabled, newMap = false) {
      if (disposed) return;
      if (enabled && newMap && infiniteRun && !pinnedSeed) infinite.setSeed(freshSeed());
      if (enabled) { infiniteRun = true; infinite.update(0, 0); }
      requestedInfinite = enabled;
      if (enabled) requested = false;
      apply();
    },
    update(x, z) {
      if (infinite.group.visible && infinite.update(x, z)) {
        obstacles.splice(0, obstacles.length, ...infinite.obstacles);
        revision++;
      } else if (sample.group.visible) sample.update(x, z);
    },
    inspect: () => ({ layout: infinite.group.visible ? 'infinite-pixel-meadow' : sample.group.visible ? generated ? 'random-pixel-meadow' : 'fixed-pixel-meadow' : 'legacy',
      status: requestedInfinite ? infiniteFailed ? 'fallback' : infiniteReady ? 'ready' : 'loading' : failed ? 'fallback' : ready ? 'ready' : 'loading',
      obstacles: obstacles.length, chunks: infinite.group.visible ? infinite.chunkCount : 0,
      seed: infinite.group.visible ? infinite.seed : sample.group.visible ? generated?.seed ?? null : null,
      generation: sample.group.visible && generated ? { version: generated.version, attempt: generated.attempt, fallback: generated.fallback,
        valid: generated.validation.valid, walkable: generated.validation.walkable, reachable: generated.validation.reachable } : null }),
    dispose() { disposed = true; sample.dispose(); infinite.dispose(); },
  };
}

/** Seeded scenery and shared, instanced geometry keep draw calls and memory bounded. */
function createLegacyWorld(): Pick<World, 'group' | 'obstacles'> {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  let seed = 78123;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const material = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const dummy = new THREE.Object3D();
  type Instance = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number };
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; data: Instance[] }>();
  const register = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material) => batches.set(name, { geometry, material: mat, data: [] });
  const add = (name: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0) => batches.get(name)!.data.push({ x, y, z, sx, sy, sz, ry });
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const rock = new THREE.DodecahedronGeometry(1, 0);
  const cylinder = new THREE.CylinderGeometry(0.7, 1, 1, 6);
  register('trunk', cylinder, material('#81634e'));
  const foliage = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: 0.42, depthWrite: false });
  register('leaf', sphere, foliage('#4bba7a'));
  register('leafLight', sphere, foliage('#a6d46d'));
  register('rock', rock, material('#a4bfc3'));
  register('moss', rock, material('#86b775'));
  register('pinkFlower', new THREE.IcosahedronGeometry(0.13, 0), material('#f1afc9'));
  register('grass', new THREE.ConeGeometry(0.11, 0.55, 3), material('#9bd05e'));
  register('flower', new THREE.IcosahedronGeometry(0.12, 0), material('#ffdf9c'));
  register('whiteFlower', new THREE.IcosahedronGeometry(0.1, 0), material('#f2ebcd'));
  register('stem', cylinder, material('#d9d8b6'));
  register('mushroom', new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), material('#f28e71'));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), material('#8bc869'));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  // Visual regions only. Existing obstacles, boundary and combat rules stay intact.
  const regionGeometry = new THREE.CircleGeometry(1, 32);
  for (const region of [
    { name: '风语林地', x: -20, z: -8, sx: 15, sz: 23, color: '#78b98b' },
    { name: '岩晶遗迹', x: 21, z: -6, sx: 14, sz: 22, color: '#a6c3bd' },
  ]) {
    const mesh = new THREE.Mesh(regionGeometry, material(region.color));
    mesh.name = region.name; mesh.rotation.x = -Math.PI / 2; mesh.position.set(region.x, 0.004, region.z); mesh.scale.set(region.sx, region.sz, 1); group.add(mesh);
  }
  ground.name = '中央草场';
  const patchMaterial = material('#a1d47b');
  const patchGeometry = new THREE.CircleGeometry(1, 12);
  register('patch', patchGeometry, patchMaterial);
  // Radial contact shadows are baked into a tiny texture; no real-time shadow maps.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(22, 63, 40, .36)');
  gradient.addColorStop(1, 'rgba(22, 63, 40, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const shadowTexture = new THREE.CanvasTexture(canvas);
  register('shadow', new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  for (let i = 0; i < 88; i++) {
    const angle = random() * Math.PI * 2;
    const distance = 7 + Math.sqrt(random()) * 51;
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    const s = 0.8 + random() * 0.85;
    add('trunk', x, 0.36 * s, z, 0.3 * s, 0.72 * s, 0.3 * s);
    add('leaf', x, 0.95 * s, z, 0.85 * s, 0.55 * s, 0.8 * s, random() * 5);
    add('leafLight', x - 0.15 * s, 1.25 * s, z + 0.05, 0.65 * s, 0.4 * s, 0.6 * s);
    add('shadow', x + 0.4, 0.015, z + 0.3, 5 * s, 5 * s, 1);
    obstacles.push({ x, z, radius: 0.45 * s });
  }
  for (let i = 0; i < 48; i++) {
    const x = (random() - 0.5) * 96, z = (random() - 0.5) * 96;
    if (Math.hypot(x, z) < 5) continue;
    const s = 0.4 + random() * 0.8;
    add('rock', x, s * 0.18, z, s, s * 0.3, s * 0.8, random() * 6);
    add('shadow', x, 0.019, z, s * 3, s * 2.5, 1);
    obstacles.push({ x, z, radius: s * 0.9 });
    add('moss', x - s * 0.2, s * 0.42, z, s * 0.65, s * 0.08, s * 0.5);
  }
  for (let i = 0; i < 320; i++) {
    const x = (random() - 0.5) * 105, z = (random() - 0.5) * 105;
    if (Math.hypot(x, z) < 2.8) continue;
    const s = 0.6 + random() * 0.7;
    add('grass', x, s * 0.25, z, s, s, s, random() * 6);
    if (i % 6 === 0) {
      add(i % 18 === 0 ? 'pinkFlower' : i % 12 ? 'flower' : 'whiteFlower', x + 0.15, 0.25, z, 1, 0.8, 1);
      add('stem', x + 0.15, 0.12, z, 0.025, 0.24, 0.025);
    }
  }
  for (let i = 0; i < 38; i++) {
    const x = (random() - 0.5) * 65, z = (random() - 0.5) * 65;
    if (Math.hypot(x, z) < 4) continue;
    const s = 0.2 + random() * 0.24;
    add('stem', x, s * 0.45, z, s * 0.3, s, s * 0.3);
    add('mushroom', x, s, z, s, s * 0.7, s);
  }
  for (let i = 0; i < 50; i++) {
    add('patch', (random() - 0.5) * 100, 0.006, (random() - 0.5) * 100, 1 + random() * 4, 0.7 + random() * 2, 1);
  }
  // A few flat stepping stones give the starting clearing a recognizable landmark.
  for (let i = 0; i < 9; i++) {
    const x = Math.sin(i * 0.8) * 0.9 - 2.5, z = -i * 1.3 - 1;
    add('rock', x, 0.02, z, 0.5, 0.09, 0.4, i);
  }
  for (const [name, batch] of batches) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.data.length);
    mesh.name = `scenery-${name}`;
    batch.data.forEach((instance, index) => {
      dummy.position.set(instance.x, instance.y, instance.z);
      dummy.scale.set(instance.sx, instance.sy, instance.sz);
      dummy.rotation.set(name === 'shadow' || name === 'patch' ? -Math.PI / 2 : 0, instance.ry ?? 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group, obstacles };
}
