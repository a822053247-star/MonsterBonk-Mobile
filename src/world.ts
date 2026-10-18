import * as THREE from 'three';

export const WORLD_RADIUS = 33;
export interface Obstacle { x: number; z: number; radius: number }
export interface World { group: THREE.Group; obstacles: Obstacle[] }

/** Seeded scenery and shared, instanced geometry keep draw calls and memory bounded. */
export function createWorld(): World {
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
  const boundary = new THREE.Mesh(new THREE.RingGeometry(WORLD_RADIUS - 0.1, WORLD_RADIUS + 0.1, 96), new THREE.MeshBasicMaterial({ color: '#d8edb3', transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  boundary.rotation.x = -Math.PI / 2;
  boundary.position.y = 0.025;
  group.add(boundary);
  return { group, obstacles };
}
