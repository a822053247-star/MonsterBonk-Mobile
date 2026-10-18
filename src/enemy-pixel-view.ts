import * as THREE from 'three';
import { COMBAT_LIMITS, type EnemyKind } from './combat';
import { PIXEL_ALPHA, PixelTextureCache } from './pixel-sprite';

type PixelEnemyKind = Exclude<EnemyKind, 'tank'>;
const HEIGHTS = { normal: 1.7, fast: 1.45 } as const;
type Batch = {
  mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hurt: THREE.InstancedBufferAttribute;
  lease: ReturnType<PixelTextureCache['acquire']>;
};

/** Two bounded billboard batches; no GPU allocations when enemies spawn or die. */
export class EnemyPixelView {
  readonly group = new THREE.Group();
  private cache = new PixelTextureCache();
  private batches = new Map<PixelEnemyKind, Batch>();
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private orientation = new THREE.Quaternion(-Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8));
  private up = new THREE.Vector3(0, Math.SQRT1_2, -Math.SQRT1_2);
  private top = new THREE.Vector3();
  private displayScale = 1;
  private disposed = false;

  constructor() {
    this.group.name = 'EnemyPixelBatches';
    for (const kind of ['normal', 'fast'] as const) {
      // Bottom edge sits at the entity's ground anchor, like Sprite.center=(.5,0).
      const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      const hurt = new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_LIMITS.enemies), 1);
      hurt.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('instanceHurt', hurt);
      // Alpha cutout avoids per-instance transparent sorting and invisible depth quads.
      const material = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaTest: PIXEL_ALPHA, transparent: false, depthTest: true, depthWrite: true, toneMapped: false });
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'attribute float instanceHurt; varying float vPixelHurt;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPixelHurt = instanceHurt;');
        shader.fragmentShader = 'varying float vPixelHurt;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.84), vPixelHurt * 0.78);');
      };
      material.customProgramCacheKey = () => 'enemy-pixel-hurt-v1';
      const mesh = new THREE.InstancedMesh(geometry, material, COMBAT_LIMITS.enemies);
      mesh.name = `EnemyPixel:${kind}`; mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.color.set('#ffffff'));
      const lease = this.cache.acquire(`enemy-${kind}`, () => {
        if (this.disposed || !lease.entry.ready) return;
        material.map = lease.entry.texture; material.needsUpdate = true;
      });
      this.batches.set(kind, { mesh, hurt, lease });
      this.group.add(mesh);
    }
  }

  setView(camera: THREE.Camera, viewportHeight: number, frustumHeight: number) {
    this.orientation.copy(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.orientation);
    // Roughly 34px/29px on short phones; purely visual, never a collision radius.
    this.displayScale = THREE.MathUtils.clamp(34 * frustumHeight / Math.max(1, viewportHeight) / HEIGHTS.normal, 1, 1.2);
  }

  ready(kind: EnemyKind): kind is PixelEnemyKind { return kind !== 'tank' && !!this.batches.get(kind)?.lease.entry.ready && !this.disposed; }
  height(kind: PixelEnemyKind) { return HEIGHTS[kind] * this.displayScale; }
  begin() { for (const { mesh } of this.batches.values()) mesh.count = 0; }

  put(kind: PixelEnemyKind, x: number, z: number, bob: number, hurt: boolean, tint: string) {
    const batch = this.batches.get(kind)!;
    if (batch.mesh.count >= COMBAT_LIMITS.enemies) return;
    const index = batch.mesh.count++, height = this.height(kind);
    this.pose.position.set(x, 0.035 + bob * 0.35, z);
    this.pose.quaternion.copy(this.orientation);
    this.pose.scale.set(height * batch.lease.entry.aspect, height, 1);
    this.pose.updateMatrix();
    batch.mesh.setMatrixAt(index, this.pose.matrix);
    batch.mesh.setColorAt(index, this.color.set(tint));
    batch.hurt.setX(index, hurt ? 1 : 0);
  }

  head(kind: PixelEnemyKind, x: number, z: number, bob: number) {
    return this.top.set(x, 0.035 + bob * 0.35, z).addScaledVector(this.up, this.height(kind) + 0.18);
  }

  finish() {
    for (const { mesh, hurt } of this.batches.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      hurt.needsUpdate = true;
    }
  }

  inspect() {
    return { cache: this.cache.inspect(), batches: [...this.batches].map(([kind, batch]) => ({ kind, loaded: batch.lease.entry.ready, failed: batch.lease.entry.failed,
      count: batch.mesh.count, capacity: COMBAT_LIMITS.enemies, aspect: batch.lease.entry.aspect, height: this.height(kind),
      crop: [...batch.lease.entry.crop], sourceSize: [...batch.lease.entry.sourceSize],
      nearest: batch.lease.entry.texture.magFilter === THREE.NearestFilter && batch.lease.entry.texture.minFilter === THREE.NearestFilter,
      mipmaps: batch.lease.entry.texture.generateMipmaps, depthTest: batch.mesh.material.depthTest, depthWrite: batch.mesh.material.depthWrite, alphaTest: batch.mesh.material.alphaTest })) };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const { mesh, lease } of this.batches.values()) {
      lease.release(); mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
    }
    this.batches.clear(); this.group.clear(); this.group.removeFromParent();
  }
}
