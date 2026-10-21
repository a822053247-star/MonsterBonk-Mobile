import * as THREE from 'three';
import type { CombatEffect, Projectile } from './combat';
import type { ProjectileVfx, ImpactVfx } from './visuals/vfx-presets';

const CAPACITY = 48;
const URL = `${import.meta.env.BASE_URL}assets/particles/kenney-feedback.png`;
const INK = { hit: '#ffe7ae', water: '#91e5f2', thorn: '#b6eb72', burst: '#ffbb60' } as const;

/** One atlas / one bounded batch. Poses derive from existing combat clocks only. */
export class ParticleFeedbackView {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private frames = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private opacity = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private texture: THREE.Texture;
  private pose = new THREE.Object3D();
  private orientation = new THREE.Quaternion();
  private spin = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  private right = new THREE.Vector3(1, 0, 0);
  private up = new THREE.Vector3(0, 1, 0);
  private color = new THREE.Color();
  private trailCount = 0;
  private impactCount = 0;
  private emberCount = 0;
  private detail = 4;
  private disposed = false;
  loaded = false;
  failed = false;

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('feedbackFrame', this.frames);
    geometry.setAttribute('feedbackOpacity', this.opacity);
    this.frames.setUsage(THREE.DynamicDrawUsage);
    this.opacity.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false,
      depthTest: true, toneMapped: false, alphaTest: 1 / 255 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float feedbackFrame; attribute float feedbackOpacity; varying float feedbackAlpha;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        feedbackAlpha = feedbackOpacity;
        #ifdef USE_MAP
          vMapUv = (vMapUv + vec2(mod(feedbackFrame, 4.0), 1.0 - floor(feedbackFrame / 4.0))) / vec2(4.0, 2.0);
        #endif`);
      shader.fragmentShader = 'varying float feedbackAlpha;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= feedbackAlpha;');
    };
    material.customProgramCacheKey = () => 'kenney-feedback-v1';
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.name = 'KenneyCombatFeedback'; this.mesh.count = 0; this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.color.set('#ffffff'));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.texture = new THREE.TextureLoader().load(URL, texture => {
      if (this.disposed) { texture.dispose(); return; }
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture; material.needsUpdate = true; this.loaded = true;
    }, undefined, () => { if (!this.disposed) this.failed = true; });
  }

  setView(camera: THREE.Camera) {
    this.orientation.copy(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.orientation);
    this.up.set(0, 1, 0).applyQuaternion(this.orientation);
  }

  begin(detail = this.detail) {
    this.detail = detail; this.mesh.count = 0; this.mesh.visible = false;
    this.trailCount = this.impactCount = this.emberCount = 0;
  }

  private put(frame: number, x: number, y: number, z: number, width: number, height: number, color: string, alpha: number, rotation = 0) {
    if (!this.loaded || this.disposed || this.mesh.count >= CAPACITY || alpha <= 0) return;
    const i = this.mesh.count++;
    this.pose.position.set(x, y, z); this.pose.scale.set(width, height, 1);
    this.pose.quaternion.copy(this.orientation).multiply(this.spin.setFromAxisAngle(this.axis, rotation));
    this.pose.updateMatrix(); this.mesh.setMatrixAt(i, this.pose.matrix);
    this.mesh.setColorAt(i, this.color.set(color));
    this.frames.setX(i, frame); this.opacity.setX(i, alpha);
  }

  /** True also means the decoration was intentionally culled by the budget. */
  trail(shot: Projectile, x: number, z: number, color: string, scale: number, preset?: ProjectileVfx) {
    if (preset && this.detail <= 2 && !preset.low.trail) return true;
    if (!this.loaded || this.disposed || (shot.hopTargetId && !shot.hopDelay)) return false;
    const speed = Math.hypot(shot.vx, shot.vz), length = Math.min((preset?.trail.length ?? .65) * scale, shot.distance);
    if (speed < .001 || length < .12 || this.trailCount >= (this.detail <= 2 ? 12 : 24)) return true;
    this.trailCount++;
    const dx = shot.vx / speed, dz = shot.vz / speed;
    const angle = Math.atan2(this.up.x * dx + this.up.z * dz, this.right.x * dx + this.right.z * dz) - Math.PI / 2;
    this.put(2, x - dx * length * .55, 1.15, z - dz * length * .55,
      .28 * scale, length, preset?.trail.color ?? color, (preset?.trail.opacity ?? .55) * (this.detail <= 2 ? .4 / .55 : 1), angle);
    return true;
  }

  impact(effect: CombatEffect, x: number, z: number, preset?: ImpactVfx) {
    if (preset && (!preset.particles || this.detail <= 2 && !preset.low.particles)) return true;
    if (!this.loaded || this.disposed || !(effect.kind in INK)) return false;
    if (this.impactCount >= (this.detail <= 2 ? 3 : 6)) return true;
    const kind = effect.kind as keyof typeof INK, age = effect.duration - effect.time;
    const life = Math.min(effect.duration, preset?.duration ?? (kind === 'thorn' ? .2 : .16));
    if (age >= life) return true;
    this.impactCount++;
    const p = Math.max(0, age / life), fade = (1 - p) * .9;
    const height = preset?.height ?? .95;
    if (kind === 'thorn') this.put(3, x, height, z, (.95 + p * .25) * (preset?.radiusScale ?? 1), .8 * (preset?.radiusScale ?? 1), preset?.color ?? INK.thorn, fade, -.45 + p * .7);
    else this.put(0, x, height, z, (.85 + p * .3) * (preset?.radiusScale ?? 1), (.85 + p * .3) * (preset?.radiusScale ?? 1), preset?.color ?? INK[kind], fade, p * .25);
    if (this.detail > 2) this.put(1, x + .22, height + .15 + p * .18, z, .2, .2, preset?.secondaryColor ?? INK[kind], fade * .5);
    return true;
  }

  /** Small edge embers accompany the existing explosion; no second explosion. */
  embers(effect: CombatEffect, preset?: ImpactVfx) {
    if (preset && (!preset.particles || this.detail <= 2 && !preset.low.particles)) return;
    if (effect.kind !== 'burst' || !this.loaded || this.disposed || this.emberCount >= (this.detail <= 2 ? 3 : 6)) return;
    const age = effect.duration - effect.time;
    const end = Math.min(.28, effect.duration, preset?.duration ?? .28);
    if (age < .06 || age >= end) return;
    this.emberCount++;
    const p = (age - .06) / Math.max(.001, end - .06), count = this.detail <= 2 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const side = i ? 1 : -1;
      this.put(4 + i, effect.x + side * (.22 + p * .18), .9 + p * .35, effect.z,
        .55 * (1 - p * .5), .8 * (1 - p * .35), i ? preset?.secondaryColor ?? '#ffe09a' : preset?.color ?? '#ffac59', .65 * (1 - p), side * .2);
    }
  }

  finish() {
    this.mesh.visible = this.loaded && !this.disposed && this.mesh.count > 0;
    if (!this.mesh.count) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true;
    this.frames.needsUpdate = this.opacity.needsUpdate = true;
  }

  inspect() { return { loaded: this.loaded, failed: this.failed, count: this.mesh.count, capacity: CAPACITY,
    trails: this.trailCount, impacts: this.impactCount, embers: this.emberCount, url: URL,
    frames: Array.from(this.frames.array.slice(0, this.mesh.count)),
    opacity: Array.from(this.opacity.array.slice(0, this.mesh.count)),
    nearest: this.texture.magFilter === THREE.NearestFilter, depthWrite: this.mesh.material.depthWrite }; }

  dispose() {
    if (this.disposed) return;
    this.begin(); this.disposed = true; this.loaded = false;
    this.texture.dispose(); this.mesh.dispose(); this.mesh.geometry.dispose();
    this.mesh.material.dispose(); this.mesh.removeFromParent();
  }
}
