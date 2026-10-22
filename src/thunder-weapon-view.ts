import * as THREE from 'three';
import type { ThunderWeapon } from './thunder-weapon';
import { WaterAtlas } from './water-aoe-view';

const THUNDER_VISUAL_SCALE = 1.25;

/** Yellow authored sprites stay in XZ; horizontal lightning is tiled along each actual strike. */
export class ThunderWeaponView {
  readonly group = new THREE.Group();
  readonly seed = new WaterAtlas('bud', 4, 1, 'thunder-bud', 4, false);
  readonly bolts = new WaterAtlas('lightning', 4, 1, 'thunder-bud', 384, false);
  private sparks = new WaterAtlas('spark', 6, 1, 'thunder-bud', 32, false);
  private arcs = new WaterAtlas('arc', 4, 1, 'thunder-bud', 32, false);
  private atlases = [this.seed, this.bolts, this.sparks, this.arcs];
  constructor() {
    this.group.name = 'ThunderBudGround';
    for (const atlas of this.atlases) { atlas.mesh.material.color.setScalar(1); this.group.add(atlas.mesh); }
  }
  render(combat: ThunderWeapon, detail: number) {
    this.clear();
    for (const cast of combat.casts) if (cast.active) {
      this.seed.put(Math.floor(cast.age * 10) % 4, cast.x, cast.z, .95 * THUNDER_VISUAL_SCALE, cast.source?.copied ? .55 : .94, 0, .24);
    }
    for (const link of combat.links) {
      if (!link.active) continue;
      const dx = link.tx - link.x, dz = link.tz - link.z, length = Math.hypot(dx, dz);
      if (length < .01) continue;
      const segments = Math.min(12, Math.max(1, Math.ceil(length / 1.25))), angle = -Math.atan2(dz, dx);
      const fade = Math.min(1, (.26 - link.age) / .1);
      for (let i = 0; i < segments; i++) {
        const t = (i + .5) / segments;
        // Tiny overlap joins the original left/right endpoints without stretching a long bolt.
        this.bolts.putRect((link.variant + i) % 4, link.x + dx * t, link.z + dz * t,
          length / segments + .025, .85 * 1.3, .9 * fade, angle, .21);
      }
    }
    for (const impact of combat.impacts) if (impact.active) {
      const fade = Math.min(1, (.34 - impact.age) / .12);
      this.sparks.put(Math.min(5, Math.floor(impact.age / .34 * 6)), impact.x, impact.z, 1.1 * THUNDER_VISUAL_SCALE, fade, 0, .26);
      if (detail > 2) this.arcs.put(Math.min(3, Math.floor(impact.age / .34 * 4)), impact.x, impact.z, 1.15 * THUNDER_VISUAL_SCALE, .75 * fade, 0, .23);
    }
    for (const atlas of this.atlases) atlas.finish();
  }
  clear() { for (const atlas of this.atlases) atlas.begin(); }
  inspect() { return { plane: 'xz', atlases: this.atlases.map(a => ({ name: a.mesh.name, ...a.inspect() })) }; }
  dispose() { this.clear(); this.group.removeFromParent(); for (const atlas of this.atlases) atlas.dispose(); }
}
