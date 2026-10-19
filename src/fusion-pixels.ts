import type { FusionId } from './fusion';

export const FUSION_ASSET_ROOT = '/assets/pixel/skills/fusions/';
// Authored stages are unevenly spaced in the source. Only audited atlas slots play.
// FPS belongs to rendering, never projectile lifetime, damage, or status clocks.
export const FUSION_CLIPS = {
  'deep-bubble': { row: 0, flight: [0, 1, 2], impact: [3, 4, 5, 6, 7], flightFPS: 8, impactFPS: 5 / .45 },
  'chain-bubble': { row: 1, flight: [0, 1], impact: [2, 5, 6], flightFPS: 10, impactFPS: 10 },
  'thorn-scatter': { row: 2, flight: [0], impact: [1, 2, 3, 4, 5, 6], flightFPS: 8, impactFPS: 16 },
  'jump-thorn': { row: 3, flight: [0, 1], impact: [], flightFPS: 12, impactFPS: 12 },
} as const;
export type ElementalFusionId = keyof typeof FUSION_CLIPS;
export function elementalClip(id?: FusionId) { return id && id in FUSION_CLIPS ? FUSION_CLIPS[id as ElementalFusionId] : undefined; }
export function clipFrame(frames: readonly number[], age: number, fps: number, loop: boolean) {
  if (!frames.length) return undefined;
  const step = Math.max(0, Math.floor(age * fps));
  return loop ? frames[step % frames.length] : step < frames.length ? frames[step] : undefined;
}
