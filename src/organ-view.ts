import * as THREE from 'three';
import { ORGAN_DEFINITIONS, type OrganId } from './creature-data';

/** Two cached proof-of-interface props. Unbuilt organs are explicitly unavailable. */
export class OrganVisuals {
  private cache = new Map<OrganId, THREE.Group>();
  create(id: OrganId): THREE.Group | undefined {
    const kind = ORGAN_DEFINITIONS[id].placeholder;
    if (!kind) return;
    const cached = this.cache.get(id);
    if (cached) return cached;
    const group = new THREE.Group(); group.name = `Organ:${id}`;
    const material = new THREE.MeshLambertMaterial({ color: '#8f3e29', flatShading: true });
    const geometry = kind === 'horns' ? new THREE.ConeGeometry(0.14, 0.45, 5) : new THREE.IcosahedronGeometry(1, 0);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(geometry, material);
      if (kind === 'horns') { mesh.position.set(side * 0.46, 0.1, 0); mesh.rotation.z = -side * 0.3; }
      else { mesh.position.set(side * 0.22, 0, 0); mesh.scale.set(0.34, 0.2, 0.48); }
      group.add(mesh);
    }
    this.cache.set(id, group);
    return group;
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    for (const group of this.cache.values()) {
      group.removeFromParent();
      group.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); materials.add(object.material as THREE.Material); } });
    }
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.cache.clear();
  }
}
