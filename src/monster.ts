import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ORGAN_DEFINITIONS, YANRONG_SOCKETS, type OrganId, type OrganSlot, type SocketLayout } from './creature-data';
import { OrganVisuals } from './organ-view';
import { MonsterSprite } from './monster-sprite';

export type CreatureVisual = 'procedural' | 'sprite';

/** 焰绒: a small quadruped built from shared, faceted primitives; +Z is forward. */
export class Monster {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly sockets = { head: new THREE.Group(), back: new THREE.Group(), tail: new THREE.Group() };
  readonly evolutionEffects = new THREE.Group();
  readonly combatEffects = new THREE.Group();
  private equipped: Partial<Record<OrganSlot, OrganId>> = {};
  private organs = new OrganVisuals();
  private feet: THREE.Group[] = [];
  private eyes: THREE.Group[] = [];
  private phase = 0;
  private shadow: THREE.Mesh;
  private ring: THREE.Mesh;
  private orange = new THREE.MeshLambertMaterial({ color: '#f58b32', flatShading: true });
  private normalOrange = new THREE.Color('#f58b32');
  private flashColor = new THREE.Color('#fff5df');
  private procedural = new THREE.Group();
  private spriteView?: MonsterSprite;
  private requestedVisual: CreatureVisual;

  constructor(visual: CreatureVisual = 'procedural') {
    this.requestedVisual = visual;
    this.root.name = 'CreatureRoot'; this.body.name = 'Body';
    this.evolutionEffects.name = 'EvolutionEffects'; this.combatEffects.name = 'CombatEffects';
    this.root.add(this.body, this.evolutionEffects, this.combatEffects);
    for (const slot of ['head', 'back', 'tail'] as const) {
      this.sockets[slot].name = `${slot[0].toUpperCase()}${slot.slice(1)}Socket`;
      this.body.add(this.sockets[slot]);
    }
    this.configureSockets(YANRONG_SOCKETS);
    const round = new THREE.IcosahedronGeometry(1, 1), cone = new THREE.ConeGeometry(1, 2, 5);
    const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const cream = mat('#fff0c9'), red = mat('#ce4e26'), gold = mat('#ffc447'), ink = mat('#352b30'), white = mat('#fffaf0');
    const glow = new THREE.MeshBasicMaterial({ color: '#ffffb0' });
    const batches = new Map<THREE.Object3D, Map<THREE.Material, THREE.Mesh[]>>();
    const part = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, geometry: THREE.BufferGeometry = round) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh);
      const byMaterial = batches.get(parent) ?? new Map<THREE.Material, THREE.Mesh[]>();
      const list = byMaterial.get(material) ?? []; list.push(mesh); byMaterial.set(material, list); batches.set(parent, byMaterial);
      return mesh;
    };
    part(this.body, this.orange, 0, 0.83, -0.3, 0.65, 0.62, 0.93);
    part(this.body, cream, 0, 0.8, 0.4, 0.44, 0.48, 0.5);
    part(this.body, this.orange, 0, 1.57, 0.61, 0.89, 0.75, 0.72);
    part(this.body, cream, 0, 1.27, 1.12, 0.69, 0.3, 0.22);
    part(this.body, ink, 0, 1.25, 1.337, 0.2, 0.12, 0.025);
    part(this.body, red, 0, 1.21, 1.36, 0.12, 0.045, 0.02);
    part(this.body, ink, 0, 1.47, 1.34, 0.09, 0.055, 0.045);
    for (const side of [-1, 1]) {
      const ear = part(this.body, red, side * 0.7, 2.02, 0.4, 0.24, 0.43, 0.2, cone); ear.rotation.z = -side * 0.35;
      part(this.body, cream, side * 0.7, 2, 0.53, 0.13, 0.24, 0.06, cone).rotation.z = -side * 0.35;
      part(this.body, cream, side * 0.67, 1.38, 1.02, 0.32, 0.17, 0.18).rotation.z = side * 0.25;
      part(this.body, cream, side * 0.36, 1.94, 1.16, 0.2, 0.065, 0.04).rotation.z = -side * 0.25;
      const eye = new THREE.Group(); eye.position.set(side * 0.35, 1.67, 1.21); this.body.add(eye); this.eyes.push(eye);
      part(eye, ink, 0, 0, 0, 0.21, 0.28, 0.075);
      part(eye, white, 0, 0.014, 0.04, 0.175, 0.235, 0.06);
      part(eye, red, side * -0.015, -0.02, 0.092, 0.13, 0.18, 0.035);
      part(eye, ink, 0, 0.01, 0.12, 0.085, 0.125, 0.022);
      part(eye, white, -0.043, 0.09, 0.141, 0.045, 0.055, 0.012);
      for (const z of [-0.78, 0.56]) {
        const foot = new THREE.Group(); foot.position.set(side * 0.49, 0.28, z); this.body.add(foot); this.feet.push(foot);
        part(foot, this.orange, 0, 0.06, 0, 0.26, 0.36, 0.29);
        part(foot, red, 0, -0.12, 0.15, 0.26, 0.14, 0.3);
      }
      for (let i = 0; i < 3; i++) {
        const tuft = part(this.body, i % 2 ? gold : red, side * (0.69 + i * 0.055), 1.49 + i * 0.25, 0.52 - i * 0.16, 0.2, 0.34, 0.25, cone);
        tuft.rotation.z = -side * 0.65; tuft.rotation.x = -0.35;
      }
    }
    for (let i = 0; i < 3; i++) {
      const tuft = part(this.body, i === 1 ? gold : red, (i - 1) * 0.25, 2.16 + (i === 1 ? 0.15 : 0), 0.49, 0.22, 0.4, 0.23, cone); tuft.rotation.x = -0.35;
    }
    const markGeometry = new THREE.OctahedronGeometry(1, 0);
    part(this.body, gold, 0, 2.02, 1.28, 0.17, 0.24, 0.06, markGeometry);
    part(this.body, glow, 0, 2.02, 1.335, 0.11, 0.18, 0.025, markGeometry);
    const tail = this.sockets.tail;
    part(tail, red, 0, 0.06, -0.35, 0.23, 0.23, 0.48).rotation.x = 0.35;
    part(tail, this.orange, 0, 0.33, -0.79, 0.4, 0.42, 0.51);
    for (let i = 0; i < 3; i++) {
      const flame = part(tail, i === 1 ? gold : red, (i - 1) * 0.24, 0.64 + (i === 1 ? 0.19 : 0), -0.92, 0.21, 0.46, 0.29, cone); flame.rotation.x = -0.35; flame.rotation.z = (i - 1) * -0.28;
    }
    part(tail, gold, 0, 0.44, -1.13, 0.23, 0.28, 0.23);
    // Merge within animated groups, keeping sockets and legs independent.
    for (const [parent, byMaterial] of batches) for (const [material, meshes] of byMaterial) {
      const pieces = meshes.map(mesh => { mesh.updateMatrix(); const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); return flat.applyMatrix4(mesh.matrix); });
      const merged = mergeGeometries(pieces);
      if (!merged) throw new Error('Unable to merge creature geometry');
      meshes.forEach(mesh => parent.remove(mesh)); parent.add(new THREE.Mesh(merged, material));
      pieces.forEach(piece => piece.dispose());
    }
    round.dispose(); cone.dispose(); markGeometry.dispose();
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), new THREE.MeshBasicMaterial({ color: '#214d37', transparent: true, opacity: 0.17, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.035; this.shadow.scale.y = 1.35; this.root.add(this.shadow);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.08, 24), new THREE.MeshBasicMaterial({ color: '#fff2be', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.04; this.root.add(this.ring);
    this.procedural.name = 'ProceduralFallback';
    this.procedural.add(...this.body.children);
    this.body.add(this.procedural);
    this.setVisual(visual);
  }

  /** Applying a future form's poses never rebuilds or clears equipped organs. */
  configureSockets(layout: SocketLayout) {
    for (const slot of ['head', 'back', 'tail'] as const) { this.sockets[slot].position.set(...layout[slot].position); this.sockets[slot].scale.setScalar(layout[slot].scale); }
  }

  equipOrgan(id: OrganId) {
    const visual = this.organs.create(id);
    if (!visual) return false;
    const slot = ORGAN_DEFINITIONS[id].slot;
    this.unequipOrgan(slot);
    this.sockets[slot].add(visual); this.equipped[slot] = id;
    return true;
  }

  unequipOrgan(slot: OrganSlot) {
    for (const child of [...this.sockets[slot].children]) if (child.name.startsWith('Organ:')) child.removeFromParent();
    delete this.equipped[slot];
  }

  setVisual(visual: CreatureVisual) {
    this.requestedVisual = visual;
    if (visual === 'sprite' && !this.spriteView) {
      this.spriteView = new MonsterSprite(() => this.syncVisual());
      this.root.add(this.spriteView.group);
    }
    this.resetVisual(); this.syncVisual();
  }

  private syncVisual() {
    const sprite = this.requestedVisual === 'sprite' && !!this.spriteView?.ready;
    this.procedural.visible = this.shadow.visible = !sprite;
    if (this.spriteView) this.spriteView.group.visible = sprite;
  }

  updateView(viewportHeight: number, frustumHeight: number, menu: boolean) { this.spriteView?.resize(viewportHeight, frustumHeight, menu); }
  resetVisual() { this.spriteView?.reset(); }

  inspect() { return { name: '焰绒', legs: this.feet.length, slots: Object.keys(this.sockets), equipped: { ...this.equipped }, visual: this.procedural.visible ? 'procedural' : 'sprite', sprite: this.spriteView?.inspect() }; }
  dispose() { this.organs.dispose(); this.spriteView?.dispose(); }

  animate(dt: number, moving: number, dashing: boolean, time: number, jump = 0, hurt = 0) {
    if (!this.procedural.visible && this.spriteView) {
      this.spriteView.animate(dt, moving, dashing, time, jump, hurt, this.body.rotation.y, this.root.position);
      this.ring.scale.setScalar(dashing ? 1.2 : 1);
      return;
    }
    this.phase += dt * (moving > 0.08 ? 13 : 2.6);
    const stride = moving > 0.08 ? moving : 0, walk = Math.sin(this.phase);
    this.body.position.y = jump + (stride ? Math.abs(walk) * 0.07 : Math.sin(this.phase) * 0.025);
    this.body.scale.set(1 + hurt * 0.06, 1 - hurt * 0.08, 1 + hurt * 0.06);
    this.body.rotation.z = walk * stride * 0.025;
    this.body.rotation.x = (dashing ? 0.17 : stride * 0.035) - hurt * 0.15;
    this.feet.forEach((foot, i) => { const gait = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)); foot.position.y = 0.28 + Math.max(0, gait) * stride * 0.13; foot.rotation.x = gait * stride * 0.28; });
    this.sockets.tail.rotation.y = Math.sin(time * 3) * (0.14 + stride * 0.13);
    this.eyes.forEach(eye => eye.scale.y = time % 4.8 > 4.64 ? 0.12 : 1);
    this.orange.color.copy(this.normalOrange).lerp(this.flashColor, hurt > 0 && Math.floor(hurt * 10) % 2 === 0 ? 0.8 : 0);
    this.shadow.scale.set(1 - jump * 0.15, 1.35 - jump * 0.15, 1);
    this.ring.scale.setScalar(dashing ? 1.2 : 1);
  }
}
