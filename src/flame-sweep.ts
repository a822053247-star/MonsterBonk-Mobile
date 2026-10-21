export const FLAME_SWEEP = {
  id: 'flame-sweep', damage: 36, radius: 2.8, interval: .72,
  angle: Math.PI, bodyOffset: .55, duration: .3,
  eliteMultiplier: .70, maxRadius: 6,
  frames: 3, fps: 10, frameSize: 128,
  url: `${import.meta.env?.BASE_URL ?? '/'}assets/pixel/skills/yanrong/fire-effects-sheet.normalized.png`,
  sourceFrames: [12,13,14],
} as const;

/** Weapon levels spend their growth budget on coverage and close-range uptime. */
export const FLAME_SWEEP_LEVELS = [
  { radius: 2.8, degrees: 180, interval: .72 },
  { radius: 3.2, degrees: 220, interval: .70 },
  { radius: 3.6, degrees: 260, interval: .68 },
  { radius: 4.0, degrees: 300, interval: .66 },
  { radius: 4.4, degrees: 360, interval: .64 },
] as const;

export function flameSweepStats(level: number, rangeMultiplier = 1, areaMultiplier = 1) {
  const growth = FLAME_SWEEP_LEVELS[Math.max(0, Math.min(4, Math.floor(level) - 1))];
  return { ...growth, angle: growth.degrees * Math.PI / 180,
    radius: Math.min(FLAME_SWEEP.maxRadius, growth.radius * rangeMultiplier * areaMultiplier) };
}

/** Circle vs finite sector, including radial edges; never a projectile collision. */
export function insideSweep(x: number, z: number, aimX: number, aimZ: number, radius: number, enemyRadius: number, sweepAngle: number = FLAME_SWEEP.angle) {
  const distance = Math.hypot(x, z);
  if (distance > radius + enemyRadius) return false;
  if (distance <= enemyRadius) return true;
  const angle = Math.atan2(aimX*z-aimZ*x, aimX*x+aimZ*z);
  if (Math.abs(angle) <= sweepAngle/2) return true;
  const edge = Math.sign(angle)*sweepAngle/2;
  const ex = aimX*Math.cos(edge)-aimZ*Math.sin(edge), ez = aimX*Math.sin(edge)+aimZ*Math.cos(edge);
  const t = Math.max(0, Math.min(radius, x*ex+z*ez));
  return (x-t*ex)**2+(z-t*ez)**2 <= enemyRadius**2;
}
