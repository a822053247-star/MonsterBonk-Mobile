import { prismSegment, type WaterEvolution } from './water-evolution';
import type { WaterAoeView } from './water-aoe-view';
import type { PositionAoeView } from './position-aoe-view';

/** Appends to existing bounded atlas batches; owns no GPU resources or damage logic. */
export class WaterEvolutionView {
  private rendered = 0;
  constructor(private water: WaterAoeView, private position: PositionAoeView) {}
  render(combat: WaterEvolution, detail: number) {
    this.rendered = 0;
    const { burst, tide, field, aura } = this.water, { vortex, beams, spores, impact } = this.position;
    for (const c of combat.casts) {
      if (!c.active) continue; this.rendered++;
      if (c.kind === 'tsunami-sanctuary') {
        if (c.age < .9) burst.put(Math.min(15, Math.floor(c.age / .9 * 16)), c.x, c.z, c.radius * 2, 1);
        if (c.age >= .16 && c.age <= 4.16) {
          const fade = Math.min(1, (c.age - .16) / .15, (4.16 - c.age) / .25);
          field.put(0, c.x, c.z, c.radius * 2, .94 * fade, c.age * .06, .09);
          if (detail > 2) aura.put(Math.floor(c.age * 10) % 8, c.x, c.z, c.radius * 1.15, .9 * fade, -c.age * .1, .12);
        }
        if (c.age > 4.16) tide.put(4, c.x, c.z, c.closing * 2 / .97, .98 * Math.min(1, (c.duration - c.age) / .3), 0, .13);
      } else if (c.kind === 'astral-wheel') {
        field.put(0, c.x, c.z, 3.2, .94 * Math.min(1, c.age / .15, (c.duration - c.age) / .3), c.age * .3, .07);
        for (let i = 0; i < 3; i++) {
          const age = c.age - i * .65, angle = i * Math.PI / 12;
          if (age <= 0) continue;
          if (age <= 1.1) tide.put(4, c.x, c.z, c.waves[i].radius * 2 / .97, .98 * Math.min(1, (1.1 - age) / .2), angle, .1 + i * .006);
          if (age > .78) continue;
          const frame = age < .1 ? 0 : age < .18 ? 1 : age < .5 ? 2 : Math.min(5, 3 + Math.floor((age - .5) / .095));
          const width = c.radius / .82, fade = Math.max(0, Math.min(1, age / .08, (.78 - age) / .14));
          for (let j = 0; j < 12; j++) {
            const a = angle + j * Math.PI * 2 / 12;
            beams.putRect(frame, c.x + Math.cos(a) * width * .38, c.z + Math.sin(a) * width * .38, width, 1.15, .98 * fade, -a, .14);
          }
        }
      } else if (c.kind === 'deep-collapse') {
        if (c.age < 1.6) vortex.put(Math.floor(c.age * 12) % 8, c.x, c.z, c.radius * 2 * (1 - c.age * .13), .98, -c.age * 1.1);
        if (c.age >= 1.6) {
          const age = c.age - 1.6;
          burst.put(Math.min(15, Math.floor(age / .8 * 16)), c.x, c.z, 10.4, 1, 0, .12);
          if (age < .5) impact.put(Math.min(7, Math.floor(age * 16)), c.x, c.z, 5, .98, 0, .15);
        }
      } else if (c.kind === 'frost-prism') {
        field.put(0, c.x, c.z, c.radius * 2, .94 * Math.min(1, c.age / .15, (c.duration - c.age) / .3), 0, .07);
        for (let i = 0; i < 4; i++) {
          const age = c.age - i;
          if (age < .08 || age > .95) continue;
          const reflected = age >= .55, local = age - (reflected ? .55 : .08);
          const frame = local < .1 ? 1 : local < .23 ? 2 : Math.min(5, 3 + Math.floor((local - .23) / .07));
          const fade = Math.min(1, local / .05, ((reflected ? .95 : .55) - age) / .08);
          for (let j = 0; j < 6; j++) {
            const ray = prismSegment(c, c.radius, i, j, reflected), width = ray.length / .82;
            beams.putRect(frame, ray.x + Math.cos(ray.angle) * width * .38, ray.z + Math.sin(ray.angle) * width * .38, width, 1.15, .98 * fade, -ray.angle, .14);
          }
        }
      } else if (c.kind === 'undertow-pyre' || c.kind === 'all-tides') {
        const triple = c.kind === 'all-tides', duration = triple ? 1.8 : 2.2;
        for (let i = 0; i < (triple ? 3 : 1); i++) {
          const age = c.age - i * .4, w = c.waves[i]; if (age <= 0 || age > duration) continue;
          tide.put(age > duration / 2 ? 5 : 4, w.x, w.z, w.radius * 2 / .97,
            .98 * Math.min(1, age / .1, (duration - age) / .15), 0, .1 + i * .006);
        }
        if (triple && c.age >= 2.6) burst.put(Math.min(15, Math.floor((c.age - 2.6) / .45 * 16)), c.x, c.z, 7, 1, 0, .14);
      } else {
        const fade = Math.min(1, c.age / .15, (c.duration - c.age) / .15);
        vortex.put(Math.floor(c.age * 10) % 8, c.x, c.z, c.radius * 2, .96 * fade, -c.age * .25, .07);
        aura.put(Math.floor(c.age * 10) % 8, c.x, c.z, 4.8, .98 * fade, c.age * .2, .12);
        const beat = c.age % .8;
        if (beat < .28 && c.age >= .8) burst.put(Math.min(15, Math.floor(beat / .28 * 16)), c.x, c.z, 4.8, fade, 0, .15);
      }
    }
    for (const effect of combat.ignitions) if (effect.active) {
      const fade = Math.min(1, (.5 - effect.age) / .15);
      spores.put(Math.min(7, 4 + Math.floor(effect.age * 8)), effect.x, effect.z, 4.8, .98 * fade, 0, .16);
      if (detail > 2) burst.put(Math.min(15, Math.floor(effect.age * 32)), effect.x, effect.z, 3.5, fade, 0, .18);
    }
    for (const atlas of [burst, tide, field, aura, vortex, beams, spores, impact]) atlas.finish();
  }
  clear() { this.rendered = 0; }
  inspect() { return { active: this.rendered, sharedBatches: true }; }
}
