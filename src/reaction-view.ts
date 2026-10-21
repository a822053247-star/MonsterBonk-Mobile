import * as THREE from 'three';
import type { CombatEffect, Enemy } from './combat';
import { FlameAtlasBatch } from './flame-sweep-assets';
import { COMBAT_LIMITS } from './combat';
import type { VfxResolver } from './visuals/vfx-resolver';
import { visualProgress } from './visuals/vfx-resolver';
import { instanceOpacity } from './visuals/instance-opacity';

/** Shared smoke asset; bounded batches, no clocks, damage or random draws. */
export class ReactionView {
  readonly group = new THREE.Group();
  private mist = new FlameAtlasBatch('/assets/kenney_particle-pack/PNG%20(Transparent)/smoke_08.png', 48, 1, 1);
  private orientation = new THREE.Quaternion();
  private rings = new THREE.InstancedMesh(new THREE.RingGeometry(.92, 1, 24),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), COMBAT_LIMITS.effects);
  private alpha = instanceOpacity(this.rings, COMBAT_LIMITS.effects);
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  constructor() {
    this.mist.mesh.material.color.setScalar(1.6);
    this.mist.mesh.name = 'SteamReactionMist'; this.rings.name = 'VfxAreaOutlines'; this.rings.count = 0;
    this.rings.frustumCulled = false; this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.setColorAt(0, this.color.set('#ffffff'));
    this.group.add(this.mist.mesh, this.rings);
  }
  setView(camera: THREE.Camera) { this.orientation.copy(camera.quaternion); }
  render(effects: readonly CombatEffect[], enemies: readonly Enemy[], detail: number, resolver: VfxResolver) {
    this.clear();
    let marked = 0;
    for (const enemy of enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || !(enemy.wetTime! > 0) || marked++ >= 12) continue;
      this.mist.put(0, enemy.x, .55, enemy.z, .65, .45, .24, '#73dfff', this.orientation);
    }
    for (const effect of effects) {
      const impact = resolver.impact(effect.kind, effect.vfxPresetId);
      if (effect.active && impact?.ring && this.rings.count < COMBAT_LIMITS.effects) {
        const p = visualProgress(effect, impact.duration);
        if (p < 1) {
          const index = this.rings.count++, radius = (impact.radiusMode === 'event' ? (effect.radius ?? .6) : Math.min(3.8, Math.max(.5, effect.radius ?? .6) * impact.radiusScale)) * (.5 + p * .5);
          this.pose.position.set(effect.x, .065, effect.z); this.pose.rotation.set(-Math.PI / 2, 0, 0);
          this.pose.scale.set(radius, radius, 1); this.pose.updateMatrix();
          this.rings.setMatrixAt(index, this.pose.matrix); this.rings.setColorAt(index, this.color.set(impact.secondaryColor));
          this.alpha.setX(index, (1 - p) * .35);
        }
      }
      const preset = resolver.area(effect.kind,effect.vfxPresetId);
      if (!effect.active || !preset) continue;
      const t = visualProgress(effect), age = effect.duration - effect.time;
      const radius = (effect.radius ?? 2.5) * preset.radiusScale;
      const pulse = 1 + Math.sin(age * preset.pulseSpeed) * .06;
      const size = Math.min(5.4, radius * 1.65) * (.55 + .45 * Math.sin(t * Math.PI / 2)) * pulse;
      const alpha = Math.sin(Math.PI * Math.min(1, t * 1.3)) * preset.fade;
      if ((preset.outline === 'ring' || !this.mist.loaded || detail <= 2 && !preset.low.mist) && this.rings.count < COMBAT_LIMITS.effects && t < 1) {
        const index = this.rings.count++;
        this.pose.position.set(effect.x, .06, effect.z); this.pose.rotation.set(-Math.PI / 2, 0, age * preset.rotationSpeed);
        this.pose.scale.set(radius * pulse, radius * pulse, 1); this.pose.updateMatrix();
        this.rings.setMatrixAt(index, this.pose.matrix); this.rings.setColorAt(index, this.color.set(preset.secondaryColor));
        this.alpha.setX(index, alpha * .5);
      }
      for (let i = 0; i < (detail <= 2 ? preset.low.mist ? 2 : 0 : 3); i++) {
        const angle = i * Math.PI * 2 / 3 + .4 + age * preset.rotationSpeed;
        this.mist.put(0, effect.x + Math.cos(angle) * t * .85, (preset.height ?? .5) + t * (preset.rise ?? .9), effect.z + Math.sin(angle) * t * .85,
          size, size * .85, alpha, i === 0 ? preset.color : preset.secondaryColor, this.orientation, angle);
      }
    }
    this.mist.finish();
    this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor!.needsUpdate = true; this.alpha.needsUpdate = true;
  }
  clear() { this.mist.begin(); this.rings.count = 0; }
  inspect() { return { ...this.mist.inspect(), outlines: this.rings.count, outlineCapacity: COMBAT_LIMITS.effects }; }
  dispose() { this.mist.dispose(); this.rings.geometry.dispose(); this.rings.material.dispose(); this.rings.dispose(); this.group.removeFromParent(); }
}
