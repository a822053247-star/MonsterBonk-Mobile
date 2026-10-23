/** Spawn-qualified enemies enter the invulnerable capture state at this health fraction. */
export const CAPTURE_HEALTH = .4;
export const CAPTURE_SPAWN_INITIAL = .02;
export const CAPTURE_SPAWN_MINIMUM = .001;
export function captureSpawnRate(spawned:number) {
  return Math.max(CAPTURE_SPAWN_MINIMUM,CAPTURE_SPAWN_INITIAL*2**-Math.min(5,Math.max(0,Math.floor(spawned))));
}
