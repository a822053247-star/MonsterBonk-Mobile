import * as THREE from 'three';
import { BARRAGE_RULES, type BarrageLane } from './area-attacks';

/** Two shared draw batches for every barrage lane; no per-shot GPU objects. */
export class BarrageView {
  readonly group = new THREE.Group();
  private geometry = new THREE.SphereGeometry(1, 6, 4);
  private cores = new THREE.InstancedMesh(this.geometry, new THREE.MeshBasicMaterial({ color: '#fff3c4', toneMapped: false }), BARRAGE_RULES.lanes);
  private trails = new THREE.InstancedMesh(this.geometry, new THREE.MeshBasicMaterial({ color: '#ffad50', transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), BARRAGE_RULES.lanes);
  private pose = new THREE.Object3D();
  constructor() {
    this.group.name = 'ScreenBarragePriority';
    for (const mesh of [this.cores, this.trails]) {
      mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.renderOrder = 7; this.group.add(mesh);
    }
  }
  render(lanes: readonly BarrageLane[], alpha: number, detail: number) {
    this.clear();
    for (const lane of lanes) {
      if (!lane.active) continue;
      const x = THREE.MathUtils.lerp(lane.previousX, lane.x, alpha), z = THREE.MathUtils.lerp(lane.previousZ, lane.z, alpha);
      const angle = Math.atan2(lane.vx, lane.vz);
      this.pose.position.set(x, .8, z); this.pose.rotation.set(0, angle, 0);
      this.pose.scale.set(.13, .13, .52); this.pose.updateMatrix();
      this.cores.setMatrixAt(this.cores.count++, this.pose.matrix);
      if (detail > 2) {
        this.pose.position.set(x - lane.vx / BARRAGE_RULES.speed * .48, .8, z - lane.vz / BARRAGE_RULES.speed * .48);
        this.pose.scale.set(.22, .15, .85); this.pose.updateMatrix();
        this.trails.setMatrixAt(this.trails.count++, this.pose.matrix);
      }
    }
    this.cores.instanceMatrix.needsUpdate = this.trails.instanceMatrix.needsUpdate = true;
  }
  clear() { this.cores.count = this.trails.count = 0; }
  inspect() { return { capacity: BARRAGE_RULES.lanes, cores: this.cores.count, trails: this.trails.count, batches: 2 }; }
  dispose() { this.clear(); this.group.removeFromParent(); this.geometry.dispose();
    for (const mesh of [this.cores, this.trails]) { mesh.material.dispose(); mesh.dispose(); } }
}
