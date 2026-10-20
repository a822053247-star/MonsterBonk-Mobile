import * as THREE from 'three';
import type { CombatEffect, Enemy } from './combat';
import { FlameAtlasBatch } from './flame-sweep-assets';

/** Shared smoke asset; bounded batches, no clocks, damage or random draws. */
export class ReactionView {
  readonly group = new THREE.Group();
  private mist = new FlameAtlasBatch('/assets/kenney_particle-pack/PNG%20(Transparent)/smoke_08.png', 48, 1, 1);
  private orientation = new THREE.Quaternion();
  constructor() { this.mist.mesh.name = 'SteamReactionMist'; this.group.add(this.mist.mesh); }
  setView(camera: THREE.Camera) { this.orientation.copy(camera.quaternion); }
  render(effects: readonly CombatEffect[], enemies: readonly Enemy[], detail: number) {
    this.mist.begin();
    let marked = 0;
    for (const enemy of enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || !(enemy.wetTime! > 0) || marked++ >= 12) continue;
      this.mist.put(0, enemy.x, .55, enemy.z, .65, .45, .24, '#73dfff', this.orientation);
    }
    for (const effect of effects) {
      if (!effect.active || effect.kind !== 'steam') continue;
      const t = 1 - effect.time / effect.duration;
      const size = Math.min(5.4, (effect.radius ?? 2.5) * 1.65) * (.55 + .45 * Math.sin(t * Math.PI / 2));
      const alpha = Math.sin(Math.PI * Math.min(1, t * 1.3)) * .62;
      for (let i = 0; i < (detail <= 2 ? 2 : 3); i++) {
        const angle = i * Math.PI * 2 / 3 + .4;
        this.mist.put(0, effect.x + Math.cos(angle) * t * .85, .5 + t * .9, effect.z + Math.sin(angle) * t * .85,
          size, size * .62, alpha, i === 0 ? '#ffe5b0' : '#b3f2ff', this.orientation, angle);
      }
    }
    this.mist.finish();
  }
  clear() { this.mist.begin(); }
  inspect() { return this.mist.inspect(); }
  dispose() { this.mist.dispose(); this.group.removeFromParent(); }
}
