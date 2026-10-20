export const FLAME_SWEEP = {
  id: 'flame-sweep', damage: 36, radius: 2.8, interval: .9,
  angle: 220 * Math.PI / 180, bodyOffset: .55, duration: .4,
  frames: 8, fps: 20, frameSize: 448, anchorX: 96 / 448, anchorY: 368 / 448,
  url: '/assets/pixel/skills/flame-sweep/flame-sweep.png',
} as const;

/** Circle vs finite sector, including radial edges; never a projectile collision. */
export function insideSweep(x: number, z: number, aimX: number, aimZ: number, radius: number, enemyRadius: number) {
  const distance = Math.hypot(x, z);
  if (distance > radius + enemyRadius) return false;
  if (distance <= enemyRadius) return true;
  const angle = Math.atan2(aimX*z-aimZ*x, aimX*x+aimZ*z);
  if (Math.abs(angle) <= FLAME_SWEEP.angle/2) return true;
  const edge = Math.sign(angle)*FLAME_SWEEP.angle/2;
  const ex = aimX*Math.cos(edge)-aimZ*Math.sin(edge), ez = aimX*Math.sin(edge)+aimZ*Math.cos(edge);
  const t = Math.max(0, Math.min(radius, x*ex+z*ez));
  return (x-t*ex)**2+(z-t*ez)**2 <= enemyRadius**2;
}
