import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 芽噜: a tiny sprout-backed, horned meadow monster, modeled entirely in code. */
export class Monster {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private feet: THREE.Group[] = [];
  private arms: THREE.Mesh[] = [];
  private ears: THREE.Mesh[] = [];
  private eyes: THREE.Mesh[] = [];
  private tail = new THREE.Group();
  private phase = 0;
  private shadow: THREE.Mesh;
  private ring: THREE.Mesh;
  private purple: THREE.MeshLambertMaterial;
  private light: THREE.MeshLambertMaterial;
  private flashColor = new THREE.Color('#fff5e7');
  private normalPurple = new THREE.Color('#ab85df');
  private normalLight = new THREE.Color('#ceb0f4');

  constructor() {
    const round = new THREE.IcosahedronGeometry(1, 1);
    const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const purple = this.purple = mat('#ab85df'), light = this.light = mat('#ceb0f4'), cream = mat('#fff0c8');
    const ink = mat('#233b40'), pink = mat('#faabac'), leaf = mat('#c7ee87');
    const staticParts = new Map<THREE.Material, THREE.Mesh[]>();
    const part = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, animated = false, geometry: THREE.BufferGeometry = round) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh);
      if (parent === this.body && !animated) { const list = staticParts.get(material) ?? []; list.push(mesh); staticParts.set(material, list); }
      return mesh;
    };
    this.root.add(this.body);
    part(this.body, purple, 0, 0.95, -0.05, 0.88, 0.89, 0.72);
    part(this.body, light, 0, 1.7, 0.05, 0.96, 0.74, 0.73);
    part(this.body, cream, 0, 0.98, 0.58, 0.57, 0.6, 0.13);
    const cone = new THREE.ConeGeometry(1, 2, 5);
    for (const side of [-1, 1]) {
      const horn = part(this.body, cream, side * 0.57, 2.28, -0.04, 0.19, 0.36, 0.18, false, cone);
      horn.rotation.z = -side * 0.22;
      const ear = part(this.body, purple, side * 0.93, 1.82, -0.04, 0.35, 0.17, 0.27, true);
      this.ears.push(ear);
      const eye = part(this.body, ink, side * 0.31, 1.78, 0.744, 0.115, 0.165, 0.07, true);
      this.eyes.push(eye);
      part(this.body, cream, side * 0.31 - 0.026, 1.835, 0.802, 0.033, 0.04, 0.018);
      part(this.body, pink, side * 0.59, 1.5, 0.68, 0.16, 0.075, 0.045);
      const arm = part(this.body, purple, side * 0.87, 0.91, 0.11, 0.23, 0.4, 0.25, true);
      this.arms.push(arm);
      const foot = new THREE.Group(); foot.position.set(side * 0.44, 0.23, 0.18); this.body.add(foot); this.feet.push(foot);
      part(foot, purple, 0, 0, 0, 0.34, 0.25, 0.43);
      for (const toe of [-1, 1]) part(foot, cream, toe * 0.12, -0.07, 0.34, 0.08, 0.08, 0.15);
      // Small lower fangs distinguish the silhouette from an ordinary rabbit.
      part(this.body, cream, side * 0.14, 1.42, 0.78, 0.055, 0.09, 0.05, false, cone);
      part(this.body, purple, side * 0.52, 1.98, -0.56, 0.18, 0.18, 0.13);
    }
    const smile = part(this.body, ink, 0, 1.46, 0.791, 1, 1, 1, false, new THREE.TorusGeometry(0.12, 0.022, 4, 10, Math.PI));
    smile.rotation.z = Math.PI;
    part(this.body, leaf, 0, 2.35, -0.09, 0.055, 0.27, 0.055);
    part(this.body, leaf, -0.2, 2.55, -0.09, 0.29, 0.12, 0.14).rotation.z = -0.4;
    part(this.body, leaf, 0.2, 2.63, -0.09, 0.27, 0.12, 0.14).rotation.z = 0.5;
    this.tail.position.set(0, 0.7, -0.57); this.body.add(this.tail);
    part(this.tail, purple, 0, -0.05, -0.45, 0.32, 0.3, 0.66);
    part(this.tail, light, 0, 0.12, -0.94, 0.23, 0.25, 0.33);
    part(this.tail, leaf, 0, 0.43, -0.91, 0.16, 0.25, 0.15, false, cone);
    for (let i = 0; i < 3; i++) part(this.body, leaf, 0, 1.7 - i * 0.35, -0.69, 0.15, 0.19, 0.18, false, cone).rotation.x = -0.6;
    // Merge static facial/body details by material to keep the hero's draw count small.
    for (const [material, meshes] of staticParts) {
      const transformed = meshes.map((mesh) => { mesh.updateMatrix(); const clone = mesh.geometry.clone().applyMatrix4(mesh.matrix); if (!clone.index) return clone; const flat = clone.toNonIndexed(); clone.dispose(); return flat; });
      const merged = mergeGeometries(transformed);
      if (merged) { meshes.forEach((mesh) => this.body.remove(mesh)); this.body.add(new THREE.Mesh(merged, material)); }
      transformed.forEach((geometry) => geometry.dispose());
    }
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.86, 20), new THREE.MeshBasicMaterial({ color: '#214d37', transparent: true, opacity: 0.17, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.035; this.root.add(this.shadow);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.03, 1.065, 32), new THREE.MeshBasicMaterial({ color: '#efffc9', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.04; this.root.add(this.ring);
  }

  animate(dt: number, moving: number, dashing: boolean, time: number, jump = 0, hurt = 0) {
    this.phase += dt * (moving > 0.08 ? 13 : 2.6);
    const walk = Math.sin(this.phase), stride = moving > 0.08 ? moving : 0;
    this.body.position.y = jump + (stride ? Math.abs(walk) * 0.13 : Math.sin(this.phase) * 0.04);
    this.body.scale.set(1 + hurt * 0.09, 1 - hurt * 0.1 + Math.min(jump, 0.2) * 0.12, 1 + hurt * 0.08);
    this.body.rotation.z = stride ? walk * 0.055 : Math.sin(time * 1.4) * 0.025;
    this.body.rotation.x = (dashing ? 0.18 : stride * 0.06) - hurt * 0.3;
    this.feet.forEach((foot, i) => { foot.position.y = 0.23 + Math.max(0, walk * (i ? -1 : 1)) * 0.22 * stride; foot.rotation.x = jump > 0.1 ? -0.3 : Math.sin(this.phase + i * Math.PI) * stride * 0.23; });
    this.arms.forEach((arm, i) => { arm.rotation.x = jump > 0.1 ? -1 : Math.sin(this.phase + i * Math.PI) * stride * 0.4; arm.rotation.z = (i ? 1 : -1) * (0.2 + hurt * 0.5); });
    this.ears.forEach((ear, i) => { ear.rotation.z = (i ? -1 : 1) * 0.12 + Math.sin(this.phase + i) * 0.09; });
    this.tail.rotation.y = Math.sin(time * 3 + stride * this.phase * 0.2) * (0.16 + stride * 0.18);
    this.tail.rotation.x = Math.sin(this.phase) * 0.08 - jump * 0.2;
    const blink = time % 4.8 > 4.64;
    this.eyes.forEach((eye) => { eye.scale.y = blink || hurt > 0.7 ? 0.035 : 0.165; });
    const flash = hurt > 0 && Math.floor(hurt * 10) % 2 === 0 ? 0.75 : 0;
    this.purple.color.copy(this.normalPurple).lerp(this.flashColor, flash);
    this.light.color.copy(this.normalLight).lerp(this.flashColor, flash);
    this.shadow.scale.set(1 - jump * 0.15, 0.72 - jump * 0.1, 1);
    this.ring.scale.setScalar(dashing ? 1.2 : 1);
  }
}
