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
  private color = new THREE.Color();
  private orientation = new THREE.Quaternion();
  private spin = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  private groundOrientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private right = new THREE.Vector3(1, 0, 0);
  private up = new THREE.Vector3(0, 1, 0);
  private disposed = false;
  loaded = false;
  failed = false;

  constructor(private url = URL, private columns = 4, rows = 4, name = 'YanrongFireAtlas') {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('instanceFrame', this.frames);
    this.frames.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaTest: 24 / 255, transparent: true, depthWrite: false, depthTest: true, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float instanceFrame;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = (vMapUv + vec2(mod(instanceFrame, ${columns}.0), ${rows - 1}.0 - floor(instanceFrame / ${columns}.0))) / vec2(${columns}.0, ${rows}.0);
        #endif`);
    };
    material.customProgramCacheKey = () => `pixel-effect-atlas-${columns}-${rows}`;
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.name = name; this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.color.set('#ffffff'));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.texture = new THREE.TextureLoader().load(url, texture => {
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

  put(row: number, frame: number, x: number, y: number, z: number, size: number, vx = 0, vz = 0, ground = false, rotation = 0, tint = '#ffffff') {
    if (!this.loaded || this.disposed || this.mesh.count >= CAPACITY) return;
    const index = this.mesh.count++;
    this.pose.position.set(x, y, z); this.pose.scale.set(size, size, 1);
    if (ground) this.pose.quaternion.copy(this.groundOrientation);
    else {
      this.pose.quaternion.copy(this.orientation);
      if (vx || vz) {
        const angle = Math.atan2(this.up.x * vx + this.up.z * vz, this.right.x * vx + this.right.z * vz);
        this.pose.quaternion.multiply(this.spin.setFromAxisAngle(this.axis, angle + rotation));
      }
    }
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.mesh.setColorAt(index, this.color.set(tint));
    this.frames.setX(index, row * this.columns + Math.max(0, Math.min(this.columns - 1, frame)));
  }
  finish() { this.mesh.instanceMatrix.needsUpdate = true; this.frames.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true; }
  inspect() { return { loaded: this.loaded, failed: this.failed, count: this.mesh.count, capacity: CAPACITY, nearest: this.texture.magFilter === THREE.NearestFilter, url: this.url, frames: Array.from(this.frames.array.slice(0, this.mesh.count)) }; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.loaded = false; this.mesh.count = 0;
    this.texture.dispose(); this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent();
  }
}
