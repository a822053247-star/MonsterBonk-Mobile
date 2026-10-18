import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { resize25DCamera, screenToGround, VIEW_25D } from '../src/camera-25d';
import { Monster } from '../src/monster';
import { YANRONG_SOCKETS } from '../src/creature-data';

test('screen input maps to projected ground direction without changing speed or analog strength', () => {
  const output = new THREE.Vector2();
  for (const strength of [0, 0.3, 1]) for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8, x = Math.cos(angle) * strength, y = Math.sin(angle) * strength;
    screenToGround(x, y, output);
    expect(output.length()).toBeCloseTo(strength, 8);
    if (strength > 0) expect(Math.atan2(output.y * Math.sin(VIEW_25D.pitch), output.x)).toBeCloseTo(Math.atan2(y, x), 8);
  }
});

test('landscape frustum keeps horizontal and vertical combat visibility across phone sizes', () => {
  const camera = new THREE.OrthographicCamera();
  for (const [width, height] of [[568, 320], [844, 390], [932, 430], [1280, 720]]) {
    resize25DCamera(camera, width / height);
    expect(camera.right - camera.left).toBeGreaterThanOrEqual(28);
    expect(camera.top - camera.bottom).toBeGreaterThanOrEqual(17);
    expect((camera.right - camera.left) / (camera.top - camera.bottom)).toBeCloseTo(width / height, 8);
  }
});

test('independent organs replace once, survive form socket changes, reuse resources, and dispose detached props', () => {
  const monster = new Monster();
  expect(monster.inspect()).toMatchObject({ name: '焰绒', legs: 4, slots: ['head', 'back', 'tail'], equipped: {} });
  expect(monster.equipOrgan('charge-horns')).toBe(true);
  const horns = monster.sockets.head.getObjectByName('Organ:charge-horns')!;
  for (let i = 0; i < 20; i++) monster.equipOrgan('charge-horns');
  expect(monster.sockets.head.children.filter(child => child.name.startsWith('Organ:'))).toHaveLength(1);
  expect(monster.equipOrgan('hardened-shell')).toBe(true);
  expect(monster.equipOrgan('sensor-antennae')).toBe(false);
  expect(monster.sockets.head.getObjectByName('Organ:charge-horns')).toBe(horns);
  monster.configureSockets({ ...YANRONG_SOCKETS, head: { position: [0, 2.2, 0.5], scale: 1.1 } });
  expect(horns.parent).toBe(monster.sockets.head);
  expect(monster.sockets.head.position.y).toBe(2.2);
  expect(monster.inspect().equipped).toEqual({ head: 'charge-horns', back: 'hardened-shell' });
  const mesh = horns.children[0] as THREE.Mesh;
  let disposed = 0; mesh.geometry.addEventListener('dispose', () => disposed++);
  monster.unequipOrgan('head'); monster.equipOrgan('charge-horns');
  expect(monster.sockets.head.getObjectByName('Organ:charge-horns')).toBe(horns);
  monster.unequipOrgan('head'); monster.dispose();
  expect(disposed).toBe(1);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  monster.root.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); materials.add(object.material as THREE.Material); } });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
});
