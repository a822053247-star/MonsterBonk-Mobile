import * as THREE from 'three';
import type { CameraVolume } from './camera-collision';

export const WORLD_RADIUS = 33;
export interface Obstacle { x: number; z: number; radius: number }
export interface World { group: THREE.Group; obstacles: Obstacle[]; cameraVolumes: CameraVolume[] }

/** Seeded scenery and shared, instanced geometry keep draw calls and memory bounded. */
export function createWorld(): World {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const cameraVolumes: CameraVolume[] = [];
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
  register('leaf', sphere, material('#4bba7a'));
  register('leafLight', sphere, material('#a6d46d'));
  register('rock', rock, material('#a4bfc3'));
  register('moss', rock, material('#86b775'));
  register('pinkFlower', new THREE.IcosahedronGeometry(0.13, 0), material('#f1afc9'));
  register('cloud', sphere, new THREE.MeshBasicMaterial({ color: '#fff9e8', fog: false }));
  register('hill', sphere, material('#89bca6'));
  register('grass', new THREE.ConeGeometry(0.11, 0.55, 3), material('#9bd05e'));
  register('flower', new THREE.IcosahedronGeometry(0.12, 0), material('#ffdf9c'));
  register('whiteFlower', new THREE.IcosahedronGeometry(0.1, 0), material('#f2ebcd'));
  register('stem', cylinder, material('#d9d8b6'));
  register('mushroom', new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), material('#f28e71'));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), material('#8bc869'));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
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
    add('trunk', x, 1.2 * s, z, 0.3 * s, 2.4 * s, 0.3 * s);
    add('leaf', x, 3.0 * s, z, 1.6 * s, 1.7 * s, 1.5 * s, random() * 5);
    add('leafLight', x - 0.35 * s, 4.0 * s, z + 0.05, 1.25 * s, 1.25 * s, 1.2 * s);
    add('shadow', x + 0.4, 0.015, z + 0.3, 5 * s, 5 * s, 1);
    obstacles.push({ x, z, radius: 0.45 * s });
    cameraVolumes.push({ x, y: 1.2 * s, z, rx: 0.3 * s, ry: 1.2 * s, rz: 0.3 * s }, { x, y: 3 * s, z, rx: 1.6 * s, ry: 1.7 * s, rz: 1.5 * s }, { x: x - 0.35 * s, y: 4 * s, z: z + 0.05, rx: 1.25 * s, ry: 1.25 * s, rz: 1.2 * s });
  }
  for (let i = 0; i < 48; i++) {
    const x = (random() - 0.5) * 96, z = (random() - 0.5) * 96;
    if (Math.hypot(x, z) < 5) continue;
    const s = 0.4 + random() * 0.8;
    add('rock', x, s * 0.35, z, s, s * 0.7, s * 0.8, random() * 6);
    add('shadow', x, 0.019, z, s * 3, s * 2.5, 1);
    obstacles.push({ x, z, radius: s * 0.9 });
    cameraVolumes.push({ x, y: s * 0.35, z, rx: s, ry: s * 0.7, rz: s * 0.8 });
    add('moss', x - s * 0.2, s * 0.85, z, s * 0.65, s * 0.12, s * 0.5);
  }
  for (let i = 0; i < 1400; i++) {
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
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2;
    add('hill', Math.sin(a) * 90, -1, Math.cos(a) * 90, 14 + random() * 12, 8 + random() * 7, 14);
  }
  for (let i = 0; i < 50; i++) {
    add('patch', (random() - 0.5) * 100, 0.006, (random() - 0.5) * 100, 1 + random() * 4, 0.7 + random() * 2, 1);
  }
  // A few flat stepping stones give the starting clearing a recognizable landmark.
  for (let i = 0; i < 9; i++) {
    const x = Math.sin(i * 0.8) * 0.9 - 2.5, z = -i * 1.3 - 1;
    add('rock', x, 0.02, z, 0.5, 0.09, 0.4, i);
  }
  // One instanced batch for all soft, faceted cloud clusters.
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, x = Math.sin(a) * 72, z = Math.cos(a) * 72, y = 22 + random() * 10;
    for (let j = 0; j < 3; j++) add('cloud', x + j * 2.5, y + (j === 1 ? 0.8 : 0), z, 3.5, 1.3 + random(), 2.2);
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
  // Sky dome: vertex colors, no texture download, no full-screen postprocessing.
  const skyGeometry = new THREE.SphereGeometry(155, 16, 8);
  const position = skyGeometry.attributes.position, colors = new Float32Array(position.count * 3);
  const horizon = new THREE.Color('#e4f4ce'), zenith = new THREE.Color('#8fd6ef'), color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    color.copy(horizon).lerp(zenith, Math.max(0, position.getY(i) / 155));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  return { group, obstacles, cameraVolumes };
}
