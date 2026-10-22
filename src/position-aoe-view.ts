import * as THREE from 'three';
import type { PositionAoe } from './position-aoe';
import { WaterAtlas } from './water-aoe-view';

/** Four new atlas batches; wave and center art append to the existing water batches. */
export class PositionAoeView {
  readonly group = new THREE.Group();
  readonly vortex = new WaterAtlas('abyss-vortex', 4, 2, 'position-aoe', 2);
  readonly beams = new WaterAtlas('ice-radiance', 3, 2, 'position-aoe', 32, false);
  readonly spores = new WaterAtlas('spore-trail', 4, 2, 'position-aoe', 16);
  readonly impact = new WaterAtlas('recall-impact', 4, 2, 'position-aoe', 2);
  private atlases = [this.vortex, this.beams, this.spores, this.impact];
  constructor(private tide: WaterAtlas, private field: WaterAtlas) {
    this.group.name = 'PositionAoe'; this.group.add(...this.atlases.map(a => a.mesh));
  }
  render(combat: PositionAoe, detail: number) {
    this.clear();
    for (const cast of combat.casts) {
      if (!cast.active) continue;
      const fade = Math.max(0, Math.min(1, cast.age / .12, (cast.duration - cast.age) / .25));
      if (cast.kind === 'abyss-vortex') {
        this.vortex.put(Math.floor(cast.age * 10) % 8, cast.x, cast.z, cast.radius * 2, .96 * fade, -cast.age * .45);
      } else if (cast.kind === 'spore-trail') {
        const frame = cast.age > cast.duration - .6 ? 6 + Math.min(1, Math.floor((cast.age - cast.duration + .6) / .3)) : Math.floor(cast.age * (detail <= 2 ? 6 : 10)) % 6;
        this.spores.put(frame, cast.x, cast.z, cast.radius * 2, .94 * fade, cast.castId * .4, .09);
      } else if (cast.kind === 'ice-radiance') {
        this.field.put(0, cast.x, cast.z, 2.3, .8 * fade, cast.angle, .07);
        if (cast.mode === 'rays') {
          const frame = cast.age < .12 ? 0 : cast.age < .24 ? 1 : cast.age < .65 ? 2 : Math.min(5, 3 + Math.floor((cast.age - .65) / .18));
          const width = cast.radius / .82;
          for (let i = 0; i < cast.beams; i++) {
            const angle = cast.angle + i / cast.beams * Math.PI * 2;
            this.beams.putRect(frame, cast.x + Math.cos(angle) * width * .38, cast.z + Math.sin(angle) * width * .38,
              width, 1.15, .98 * fade, -angle, .12);
          }
        } else if (cast.age > .2) {
          this.tide.put(4, cast.x, cast.z, cast.ringRadius * 2, .96 * fade, 0, .11);
        }
      } else {
        // Outbound and returning rings use the same atlas and simulation radius, without helper circles.
        const returning = cast.age > cast.duration / 2;
        this.tide.put(returning ? 5 : 4, cast.x, cast.z, cast.ringRadius * 2, .98 * fade, returning ? -cast.age * .2 : 0, .11);
        if (cast.age > cast.duration - .28) {
          const frame = Math.min(7, Math.floor((cast.age - cast.duration + .28) / .28 * 8));
          this.impact.put(frame, cast.x, cast.z, 2.8, fade, 0, .14);
        }
      }
    }
    for (const atlas of this.atlases) atlas.finish();
    this.tide.finish(); this.field.finish();
  }
  clear() { for (const atlas of this.atlases) atlas.begin(); }
  inspect() { return { atlases: this.atlases.map(a => a.inspect()), sharedRings: this.tide.inspect().count, sharedCenters: this.field.inspect().count }; }
  dispose() { this.clear(); this.group.removeFromParent(); for (const atlas of this.atlases) atlas.dispose(); }
}
