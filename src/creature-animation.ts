import type { SpeciesId } from './party';
export type Facing8 = 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left' | 'up' | 'up-right';
type AnimationPrefix = 'yanrong' | 'paopaoyuan' | 'yacishou';
export type AnimationAsset = `${AnimationPrefix}-${'walk' | 'diagonal'}`;
export interface ScreenBasis { rightX: number; rightZ: number; upX: number; upZ: number }
export interface CreatureClip {
  name: string; facing: Facing8; asset: AnimationAsset; startFrame: number; frameCount: number;
  fps: number; loop: boolean; mirror: boolean; anchor: readonly [number, number];
}
export const ANIMATION_LAYOUT = { columns: 4, frameWidth: 384, frameHeight: 256, bodyHeight: 220, foot: [192, 240] as const };
export const FACING_ORDER: readonly Facing8[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
export const ANIMATION_RULES = { displayScale: .8, walkFps: 8, idleFps: 3.5, startSpeed: .12, stopSpeed: .07, hysteresis: 7 * Math.PI / 180, referenceSpeed: 4.6 } as const;
const anchor = [.5, 1 - ANIMATION_LAYOUT.foot[1] / ANIMATION_LAYOUT.frameHeight] as const;
function clip(facing: Facing8, asset: AnimationAsset, startFrame: number, frameCount = 4, mirror = false): CreatureClip {
  return { name: `walk-${facing}`, facing, asset, startFrame, frameCount, fps: ANIMATION_RULES.walkFps, loop: true, mirror, anchor };
}
/** Art orientation and audited usable frames vary per species, playback does not. */
export function creatureClips(species: SpeciesId = 'yanrong') {
  const prefix: AnimationPrefix = species === 'bubblesalamander' ? 'paopaoyuan' : species === 'sproutspike' ? 'yacishou' : 'yanrong';
  const walk: AnimationAsset = `${prefix}-walk`, diagonal: AnimationAsset = `${prefix}-diagonal`;
  const frontMirror = species === 'sproutspike';
  const walks: Readonly<Record<Facing8, CreatureClip>> = {
    right: clip('right', walk, 8), left: clip('left', walk, 8, 4, true),
    down: clip('down', walk, 0, species === 'bubblesalamander' ? 4 : 3), up: clip('up', walk, 4),
    'down-right': clip('down-right', diagonal, 0, 4, frontMirror),
    'down-left': clip('down-left', diagonal, 0, 4, !frontMirror),
    'up-right': clip('up-right', diagonal, 4), 'up-left': clip('up-left', diagonal, 4, 4, true),
  };
  const frontIdle: CreatureClip = { ...clip('down', walk, 12), name: 'idle-down', fps: ANIMATION_RULES.idleFps };
  const idles = Object.fromEntries(FACING_ORDER.map(facing => [facing, facing === 'down' ? frontIdle : { ...walks[facing], name: `idle-${facing}`, frameCount: 1, fps: 0, loop: false }])) as Record<Facing8, CreatureClip>;
  return { walks, idles, frontIdle, assets: [walk, diagonal] as const };
}
export const { walks: WALK_CLIPS, idles: IDLE_CLIPS, frontIdle: FRONT_IDLE } = creatureClips();

/** Screen Y points down. This projection also works if camera azimuth later changes. */
export function screenFacing(vx: number, vz: number, basis: ScreenBasis, previous?: Facing8): Facing8 {
  const x = vx * basis.rightX + vz * basis.rightZ, y = -(vx * basis.upX + vz * basis.upZ);
  if (Math.hypot(x, y) < 1e-8) return previous ?? 'down';
  const angle = Math.atan2(y, x), sector = Math.PI / 4;
  if (previous) {
    const center = FACING_ORDER.indexOf(previous) * sector;
    const delta = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
    if (Math.abs(delta) <= sector / 2 + ANIMATION_RULES.hysteresis) return previous;
  }
  return FACING_ORDER[(Math.round(angle / sector) + 8) % 8];
}
export function clipFrame(clip: CreatureClip, time: number) {
  const frame = Math.floor(Math.max(0, time) * clip.fps + 1e-9);
  return clip.startFrame + (clip.loop ? frame % clip.frameCount : Math.min(clip.frameCount - 1, frame));
}

/** Fixed-step visual state. It never writes movement, targeting, or collisions. */
export class CreatureAnimator {
  facing: Facing8 = 'down';
  moving = false;
  time = 0;
  private hasMoved = false;
  readonly clips: ReturnType<typeof creatureClips>;
  constructor(species: SpeciesId = 'yanrong') { this.clips = creatureClips(species); }
  get clip(): CreatureClip {
    return this.moving ? this.clips.walks[this.facing] : this.clips.idles[this.facing];
  }
  step(dt: number, vx: number, vz: number, basis: ScreenBasis) {
    if (dt <= 0) return;
    const speed = Math.hypot(vx, vz), moving = speed >= (this.moving ? ANIMATION_RULES.stopSpeed : ANIMATION_RULES.startSpeed);
    if (moving) { this.facing = screenFacing(vx, vz, basis, this.hasMoved ? this.facing : undefined); this.hasMoved = true; }
    if (moving !== this.moving) this.time = 0;
    this.moving = moving;
    this.time += dt * (moving ? Math.max(.55, Math.min(1.3, speed / ANIMATION_RULES.referenceSpeed)) : 1);
  }
  reset() { this.facing = 'down'; this.moving = false; this.time = 0; this.hasMoved = false; }
  stop() { this.moving = false; this.time = 0; }
  inspect() { const clip = this.clip; return { facing: this.facing, moving: this.moving, time: this.time, clip: clip.name, frame: clipFrame(clip, this.time), mirror: clip.mirror }; }
}
