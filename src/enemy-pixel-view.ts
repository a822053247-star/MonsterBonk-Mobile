import * as THREE from 'three';
import { COMBAT_LIMITS, type EnemyKind } from './combat';
import { PIXEL_ALPHA, PixelTextureCache } from './pixel-sprite';
import { ENEMY_DIRECTION_LAYOUT, ENEMY_DIRECTION_FRAMES, enemyFacing } from './enemy-directions';
import type { Facing8, ScreenBasis } from './creature-animation';

type PixelEnemyKind = EnemyKind;
export const ENEMY_PIXEL_HEIGHTS = { normal: 1.7, fast: 1.45, tank: 2.3, 'draft-crystal-swarm': 1.3, 'draft-spore-bomber': 2, 'draft-treasure-runner': 2.4 } as const;
type Batch = {
  mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hurt: THREE.InstancedBufferAttribute;
  frost: THREE.InstancedBufferAttribute;
  fade: THREE.InstancedBufferAttribute;
  facing: THREE.InstancedBufferAttribute;
  rolls: Float32Array;
  lease: ReturnType<PixelTextureCache['acquire']>;
};

/** Six bounded billboard batches; no GPU allocations when enemies spawn or die. */
export class EnemyPixelView {
  readonly group = new THREE.Group();
  private cache = new PixelTextureCache();
  private batches = new Map<PixelEnemyKind, Batch>();
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private orientation = new THREE.Quaternion(-Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8));
  private up = new THREE.Vector3(0, Math.SQRT1_2, -Math.SQRT1_2);
  private right = new THREE.Vector3(1, 0, 0);
  private top = new THREE.Vector3();
  private rotatedUp = new THREE.Vector3();
  private roll = new THREE.Quaternion();
  private forward = new THREE.Vector3(0, 0, 1);
  private displayScale = 1;
  private disposed = false;
  private tankFallback: THREE.CanvasTexture;
  private basis: ScreenBasis = { rightX: 1, rightZ: 0, upX: 0, upZ: -Math.SQRT1_2 };
  private directions = new Map<number, { facing: Facing8; seen: number }>();
  private renderSerial = 0;

  constructor() {
    this.group.name = 'EnemyPixelBatches';
    // A neutral 2D marker keeps tanks visible during loading or a failed request.
    // The removed blue 3D model is never used as a fallback.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#a9987b'; ctx.beginPath(); ctx.moveTo(8, 3); ctx.lineTo(24, 3);
    ctx.lineTo(30, 14); ctx.lineTo(26, 28); ctx.lineTo(6, 28); ctx.lineTo(2, 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#55453c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#55453c'; ctx.fillRect(8, 17, 4, 4); ctx.fillRect(20, 17, 4, 4);
    this.tankFallback = new THREE.CanvasTexture(canvas);
    this.tankFallback.colorSpace = THREE.SRGBColorSpace;
    this.tankFallback.minFilter = this.tankFallback.magFilter = THREE.NearestFilter;
    this.tankFallback.generateMipmaps = false;
    for (const kind of Object.keys(ENEMY_PIXEL_HEIGHTS) as PixelEnemyKind[]) {
      // Bottom edge sits at the entity's ground anchor, like Sprite.center=(.5,0).
      const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      const hurt = new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_LIMITS.enemies), 1);
      hurt.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('instanceHurt', hurt);
      const frost = new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_LIMITS.enemies), 1);
      frost.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('instanceFrost', frost);
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_LIMITS.enemies).fill(1), 1);
      fade.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('instanceFade', fade);
      const facing = new THREE.InstancedBufferAttribute(new Float32Array(COMBAT_LIMITS.enemies * 2), 2);
      facing.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('instanceFacing', facing);
      const directionAtlas = { value: 0 };
      // Alpha cutout avoids per-instance transparent sorting and invisible depth quads.
      const material = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaTest: PIXEL_ALPHA, transparent: false, depthTest: true, depthWrite: true, toneMapped: false });
      if (kind === 'tank') material.map = this.tankFallback;
      material.onBeforeCompile = shader => {
        shader.uniforms.enemyDirectionAtlas = directionAtlas;
        shader.vertexShader = 'attribute float instanceFrost; varying float vPixelFrost;\n' + shader.vertexShader;
        shader.vertexShader = 'attribute float instanceHurt; attribute float instanceFade; attribute vec2 instanceFacing; uniform float enemyDirectionAtlas; varying float vPixelHurt; varying float vPixelFade;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
          #ifdef USE_MAP
            if (enemyDirectionAtlas > 0.5) vMapUv.x = (mix(vMapUv.x, 1.0-vMapUv.x, instanceFacing.y) + instanceFacing.x) / 5.0;
          #endif`);
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPixelHurt = instanceHurt; vPixelFade = instanceFade; transformed.y -= enemyDirectionAtlas * (1.0 - 240.0/256.0);');
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPixelFrost = instanceFrost;');
        shader.fragmentShader = 'varying float vPixelFrost;\n' + shader.fragmentShader;
        shader.fragmentShader = 'varying float vPixelHurt; varying float vPixelFade;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.84), vPixelHurt * 0.78);');
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
          float iceLight = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.65, 1.0) * (0.18 + iceLight * 0.82), vPixelFrost * 0.85);
          #include <alphamap_fragment>`);
        // Ordered pixel dissolve retains opaque depth/cutout behavior without corpse sorting.
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
          if (vPixelFade < 1.0) {
            vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
            float threshold = (mod(p.x,2.0)*8.0+mod(p.y,2.0)*4.0+floor(p.x/2.0)*2.0+floor(p.y/2.0)+0.5)/16.0;
            if (vPixelFade < threshold) discard;
          }`);
      };
      material.customProgramCacheKey = () => 'enemy-pixel-direction-hurt-fade-frost-v4';
      const mesh = new THREE.InstancedMesh(geometry, material, COMBAT_LIMITS.enemies);
      mesh.name = `EnemyPixel:${kind}`; mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.color.set('#ffffff'));
      const lease = this.cache.acquire(`enemy-${kind}`, () => {
        if (this.disposed || !lease.entry.ready) return;
        directionAtlas.value = lease.entry.directional ? 1 : 0;
        material.map = lease.entry.texture; material.needsUpdate = true;
      }, kind === 'tank');
      this.batches.set(kind, { mesh, hurt, frost, fade, facing, lease, rolls: new Float32Array(COMBAT_LIMITS.enemies) });
      this.group.add(mesh);
    }
  }

  setView(camera: THREE.Camera, viewportHeight: number, frustumHeight: number) {
    this.orientation.copy(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.orientation);
    this.right.set(1,0,0).applyQuaternion(this.orientation);
    this.basis.rightX = this.right.x; this.basis.rightZ = this.right.z;
    this.basis.upX = this.up.x; this.basis.upZ = this.up.z;
    // Roughly 34px/29px on short phones; purely visual, never a collision radius.
    this.displayScale = THREE.MathUtils.clamp(34 * frustumHeight / Math.max(1, viewportHeight) / ENEMY_PIXEL_HEIGHTS.normal, 1, 1.2);
  }

  ready(kind: EnemyKind): kind is PixelEnemyKind { return !this.disposed && (kind === 'tank' || !!this.batches.get(kind)?.lease.entry.ready); }
  enableBasics() { if (!this.disposed) for (const batch of this.batches.values()) batch.lease.start(); }
  height(kind: PixelEnemyKind) { return ENEMY_PIXEL_HEIGHTS[kind] * this.displayScale; }
  begin() { this.renderSerial++; for (const { mesh } of this.batches.values()) mesh.count = 0; }
  resetDirections() { this.directions.clear(); }

  put(kind: PixelEnemyKind, x: number, z: number, bob: number, hurt: boolean | number, tint: string, lean = 0, squash = 0, scale = 1, opacity = 1, movement?: { id: number; dx: number; dz: number }, bodyRoll = 0, frozen = false) {
    const batch = this.batches.get(kind)!;
    if (batch.mesh.count >= COMBAT_LIMITS.enemies) return;
    const index = batch.mesh.count++, height = this.height(kind);
    let heading: Facing8 = 'down';
    if (movement) {
      let state = this.directions.get(movement.id);
      heading = enemyFacing(movement.dx, movement.dz, this.basis, state?.facing);
      if (!state) { state = { facing: heading, seen: this.renderSerial }; this.directions.set(movement.id, state); }
      state.facing = heading; state.seen = this.renderSerial;
    }
    const [frame, mirror] = ENEMY_DIRECTION_FRAMES[heading];
    batch.facing.setXY(index, frame, mirror);
    this.pose.position.set(x, 0.035 + bob * 0.35, z);
    this.pose.quaternion.copy(this.orientation).multiply(this.roll.setFromAxisAngle(this.forward, lean+bodyRoll));
    const fullHeight = height * (batch.lease.entry.directional ? ENEMY_DIRECTION_LAYOUT.cell / ENEMY_DIRECTION_LAYOUT.bodyHeight : 1);
    this.pose.scale.set(fullHeight * batch.lease.entry.aspect * (1 - squash * .6) * scale, fullHeight * (1 + squash) * scale, 1);
    if(bodyRoll) {
      // The atlas is foot-anchored. Translate the rotating foot back around the
      // visual body center, so a full turn rolls in place instead of orbiting it.
      const center = (batch.lease.entry.directional ? ENEMY_DIRECTION_LAYOUT.bodyHeight/ENEMY_DIRECTION_LAYOUT.cell/2 : .5)*this.pose.scale.y;
      this.rotatedUp.set(0,1,0).applyQuaternion(this.pose.quaternion);
      this.pose.position.addScaledVector(this.up,center).addScaledVector(this.rotatedUp,-center);
    }
    batch.rolls[index] = bodyRoll;
    this.pose.updateMatrix();
    batch.mesh.setMatrixAt(index, this.pose.matrix);
    batch.mesh.setColorAt(index, this.color.set(tint));
    batch.hurt.setX(index, typeof hurt === 'number' ? Math.max(0, Math.min(1, hurt)) : hurt ? 1 : 0);
    batch.fade.setX(index, opacity);
    batch.frost.setX(index, frozen ? 1 : 0);
  }

  head(kind: PixelEnemyKind, x: number, z: number, bob: number) {
    return this.top.set(x, 0.035 + bob * 0.35, z).addScaledVector(this.up, this.height(kind) + 0.18);
  }

  finish() {
    for (const { mesh, hurt, frost, fade, facing } of this.batches.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      hurt.needsUpdate = true; fade.needsUpdate = true; facing.needsUpdate = true;
      frost.needsUpdate = true;
    }
    for (const [id,state] of this.directions) if (state.seen !== this.renderSerial) this.directions.delete(id);
  }

  inspect() {
    return { cache: this.cache.inspect(), directionStates: this.directions.size, batches: [...this.batches].map(([kind, batch]) => ({ kind, loaded: batch.lease.entry.ready, failed: batch.lease.entry.failed,
      directional: batch.lease.entry.directional, directionFailed: batch.lease.entry.directionFailed,
      frames: Array.from({ length: batch.mesh.count }, (_,i) => ({ frame: batch.facing.getX(i), mirror: !!batch.facing.getY(i) })),
      rolls: Array.from(batch.rolls.slice(0,batch.mesh.count)),
      frozen: Array.from(batch.frost.array.slice(0,batch.mesh.count)),
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
    this.directions.clear();
    this.tankFallback.dispose();
  }
}
