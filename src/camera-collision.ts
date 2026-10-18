export interface CameraVolume { x: number; y: number; z: number; rx: number; ry: number; rz: number }
export interface Point3 { x: number; y: number; z: number }
/** Swept camera sphere approximated by inflated ellipsoids (trunks, crowns, rocks). */
export function cameraFraction(from: Point3, to: Point3, volumes: readonly CameraVolume[], padding = 0.45) {
  let nearest = 1;
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (distance < 0.001) return nearest;
  for (const v of volumes) {
    const x = (from.x - v.x) / (v.rx + padding), y = (from.y - v.y) / (v.ry + padding), z = (from.z - v.z) / (v.rz + padding);
    const dx = (to.x - from.x) / (v.rx + padding), dy = (to.y - from.y) / (v.ry + padding), dz = (to.z - from.z) / (v.rz + padding);
    const a = dx * dx + dy * dy + dz * dz, b = x * dx + y * dy + z * dz, c = x * x + y * y + z * z - 1;
    // Starting within a crown: keep the camera on the player side instead of crossing it.
    if (c <= 0) { nearest = 0; continue; }
    const discriminant = b * b - a * c;
    if (discriminant < 0 || a < 1e-9) continue;
    const t = (-b - Math.sqrt(discriminant)) / a;
    if (t >= 0 && t < nearest) nearest = Math.max(0, t - 0.12 / distance);
  }
  return nearest;
}
