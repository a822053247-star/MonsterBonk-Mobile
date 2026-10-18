import * as THREE from 'three';
import { COMBAT_LIMITS } from './combat';

const CAPACITY = COMBAT_LIMITS.projectiles + COMBAT_LIMITS.effects * 2;
const URL = '/assets/pixel/skills/yanrong/fire-effects-sheet.normalized.png';

/** One atlas and one bounded batch for bolts, seeds, explosions and ground rings. */
export class FirePixelView {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private frames = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private texture: THREE.Texture;
  private pose = new THREE.Object3D();
  private orientation = new THREE.Quaternion();
  private spin = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  private groundOrientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private right = new THREE.Vector3(1, 0, 0);
  private up = new THREE.Vector3(0, 1, 0);
  private disposed = false;
  loaded = false;
  failed = false;

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('instanceFrame', this.frames);
    this.frames.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaTest: 24 / 255, transparent: false, depthWrite: true, depthTest: true, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float instanceFrame;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = (vMapUv + vec2(mod(instanceFrame, 4.0), 3.0 - floor(instanceFrame / 4.0))) * 0.25;
        #endif`);
    };
    material.customProgramCacheKey = () => 'yanrong-fire-atlas-v1';
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.name = 'YanrongFireAtlas'; this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.texture = new THREE.TextureLoader().load(URL, texture => {
      if (this.disposed) { texture.dispose(); return; }
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      material.map = texture; material.needsUpdate = true; this.loaded = true;
    }, undefined, () => { if (!this.disposed) this.failed = true; });
  }

  setView(camera: THREE.Camera) {
    this.orientation.copy(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.orientation);
    this.up.set(0, 1, 0).applyQuaternion(this.orientation);
  }
  begin() { this.mesh.count = 0; }

  put(row: number, frame: number, x: number, y: number, z: number, size: number, vx = 0, vz = 0, ground = false) {
    if (!this.loaded || this.disposed || this.mesh.count >= CAPACITY) return;
    const index = this.mesh.count++;
    this.pose.position.set(x, y, z); this.pose.scale.set(size, size, 1);
    if (ground) this.pose.quaternion.copy(this.groundOrientation);
    else {
      this.pose.quaternion.copy(this.orientation);
      if (vx || vz) {
        const angle = Math.atan2(this.up.x * vx + this.up.z * vz, this.right.x * vx + this.right.z * vz);
        this.pose.quaternion.multiply(this.spin.setFromAxisAngle(this.axis, angle));
      }
    }
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.frames.setX(index, row * 4 + Math.max(0, Math.min(3, frame)));
  }
  finish() { this.mesh.instanceMatrix.needsUpdate = true; this.frames.needsUpdate = true; }
  inspect() { return { loaded: this.loaded, failed: this.failed, count: this.mesh.count, capacity: CAPACITY, nearest: this.texture.magFilter === THREE.NearestFilter, url: URL }; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.loaded = false; this.mesh.count = 0;
    this.texture.dispose(); this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent();
  }
}
