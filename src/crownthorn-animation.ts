import { clipFrame, screenFacing, type Facing8, type ScreenBasis } from './creature-animation';
import { ENEMY_DIRECTION_FRAMES } from './enemy-directions';

export const CROWNTHORN_LAYOUT = { cell: 512, foot: [256, 480], bodyHeight: 280 } as const;
export const CROWNTHORN_CLIPS = {
  idle: { expected: 4, frames: [0, 1, 2, 3], fps: 4, loop: true },
  'dash-windup': { expected: 4, frames: [0, 1, 2, 3], fps: 7, loop: false },
  dash: { expected: 4, frames: [0, 1, 2, 3], fps: 10, loop: true },
  'spread-cast': { expected: 4, frames: [0, 1, 2, 3], fps: 6, loop: false },
  summon: { expected: 4, frames: [0, 1, 2, 3], fps: 5, loop: false },
  'enraged-idle': { expected: 6, frames: [0, 1, 2, 3, 4, 5], fps: 6, loop: true },
  death: { expected: 6, frames: [0, 1, 2, 3, 4, 5], fps: 6, loop: false },
} as const;
export type CrownthornAction = keyof typeof CROWNTHORN_CLIPS;
export const CROWNTHORN_ASSETS = Object.fromEntries(['directions', ...Object.keys(CROWNTHORN_CLIPS)].map(key =>
  [`crownthorn-${key}`, `boss/Crownthorn/runtime/${key}.png`])) as Record<`crownthorn-${CrownthornAction | 'directions'}`, string>;
export type CrownthornAsset = keyof typeof CROWNTHORN_ASSETS;

/** Visual state only. Caller supplies actual displacement projected through camera basis.
 * Explicit combat actions override movement art; targeting/telegraphs never read this pose.
 */
export class CrownthornAnimator {
  facing: Facing8 = 'down';
  action: CrownthornAction | null = null;
  time = 0;
  moving = false;
  private hasMoved = false;
  play(action: CrownthornAction | null, restart = false) {
    if (action !== this.action || restart) this.time = 0;
    this.action = action;
  }
  step(dt: number, dx: number, dz: number, basis: ScreenBasis) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.moving = Math.hypot(dx, dz) > 1e-5;
    if (this.moving) { this.facing = screenFacing(dx, dz, basis, this.hasMoved ? this.facing : undefined); this.hasMoved = true; }
    this.time += dt;
  }
  reset() { this.facing = 'down'; this.action = null; this.time = 0; this.moving = false; this.hasMoved = false; }
  inspect() {
    const action = this.action ?? (this.moving ? null : 'idle');
    if (!action) {
      const [frame, mirror] = ENEMY_DIRECTION_FRAMES[this.facing];
      return { facing: this.facing, renderedFacing: this.facing, action, asset: 'crownthorn-directions' as CrownthornAsset,
        frame, mirror: !!mirror, columns: 5, time: this.time, usable: 5, expected: 5, complete: true, finished: false };
    }
    const clip = CROWNTHORN_CLIPS[action];
    const index = clipFrame({ ...clip, startFrame: 0, frameCount: clip.frames.length }, this.time);
    return { facing: this.facing, renderedFacing: 'down' as Facing8, action, asset: `crownthorn-${action}` as CrownthornAsset,
      frame: clip.frames[index], mirror: false, columns: clip.expected, time: this.time,
      usable: clip.frames.length, expected: clip.expected, complete: clip.frames.length === clip.expected,
      finished: !clip.loop && this.time >= clip.frames.length / clip.fps };
  }
}
