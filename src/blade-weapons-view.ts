import * as THREE from 'three';
import type { BladeWeapons } from './blade-weapons';
import { WaterAtlas } from './water-aoe-view';

const BLADE_VISUAL_SCALE = 1.25;

/** Authored overhead blades lie in XZ, so camera pitch supplies the perspective once. */
export class BladeWeaponsView {
  readonly group = new THREE.Group();
  readonly wheel = new WaterAtlas('thorn-wheel', 1, 1, 'blade-weapons', 6, false);
  readonly tide = new WaterAtlas('tidal-blade', 6, 1, 'blade-weapons', 12, false);
  private leaves = new WaterAtlas('thorn-impact', 4, 2, 'blade-weapons', 24, false);
  private splashes = new WaterAtlas('tidal-impact', 4, 2, 'blade-weapons', 24, false);
  private atlases = [this.wheel, this.tide, this.leaves, this.splashes];
  constructor() {
    this.group.name = 'GroundBladeWeapons';
    for (const atlas of this.atlases) {
      atlas.mesh.material.color.setScalar(1);
      this.group.add(atlas.mesh);
    }
  }
  render(combat: BladeWeapons, alpha: number, detail: number) {
    this.clear();
    const blend = Math.max(0, Math.min(1, alpha));
    for (const blade of combat.wheels) {
      if (!blade.active) continue;
      this.wheel.put(0, THREE.MathUtils.lerp(blade.previousX, blade.x, blend),
        THREE.MathUtils.lerp(blade.previousZ, blade.z, blend), blade.size / .85 * BLADE_VISUAL_SCALE,
        blade.copied ? .5 : .96, blade.angle, .16);
    }
    for (const cast of combat.casts) {
      if (!cast.active || cast.id !== 'tidal-blade') continue;
      const x = THREE.MathUtils.lerp(cast.previousX, cast.x, blend), z = THREE.MathUtils.lerp(cast.previousZ, cast.z, blend);
      const frame = Math.floor(cast.age * 8) % 6, size = cast.bladeRadius * 2 / .61 * BLADE_VISUAL_SCALE;
      // Each source cell is 362x724: retain that aspect instead of stretching the crescent square.
      this.tide.putRect(frame, x, z, size * .5, size, cast.copied ? .55 : .96, -cast.age * 5.5, .18);
      for (let i = 1; i <= (detail <= 2 ? 1 : 2); i++) {
        const scale = 1 - i * .14;
        this.tide.putRect(frame, x - cast.dx * i * .28 * BLADE_VISUAL_SCALE, z - cast.dz * i * .28 * BLADE_VISUAL_SCALE,
          size * .5 * scale, size * scale, (cast.copied ? .08 : .13) / i, -cast.age * 5.5 + i * .18, .14 - i * .01);
      }
    }
    for (const hit of combat.impacts) {
      if (!hit.active) continue;
      const atlas = hit.id === 'thorn-wheel' ? this.leaves : this.splashes;
      // Use only the horizontal slash row. The second row is an upright fountain/burst.
      const frame = Math.min(3, Math.floor(hit.age / .32 * 4)), fade = .55 * (1 - hit.age / .32);
      atlas.putRect(frame, hit.x, hit.z, 1.1 * 1.2, 1.65 * 1.2, fade, hit.angle, .2);
    }
    for (const atlas of this.atlases) atlas.finish();
  }
  clear() { for (const atlas of this.atlases) atlas.begin(); }
  inspect() { return { plane: 'xz', atlases: this.atlases.map(a => ({ name: a.mesh.name, ...a.inspect() })) }; }
  dispose() { this.clear(); this.group.removeFromParent(); for (const atlas of this.atlases) atlas.dispose(); }
}
