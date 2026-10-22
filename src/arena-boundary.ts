/** Shared geometry for the finite, rectangular campaign arena. */
export const ARENA_HALF_EXTENT = 32.3;

/** The player’s collision footprint used when sliding around world obstacles. */
export const PLAYER_COLLISION_RADIUS = 0.62;

export interface BoundaryPoint {
  x: number;
  z: number;
}

/** True when the entire circular footprint fits inside the square arena. */
export function isInsideRectangularBoundary(
  x: number,
  z: number,
  halfExtent: number,
  clearance = 0,
) {
  const limit = halfExtent - clearance;
  return limit >= 0 && Math.abs(x) <= limit && Math.abs(z) <= limit;
}

/** Project a point into the square arena, preserving access to all four corners. */
export function clampToRectangularBoundary<T extends BoundaryPoint>(
  point: T,
  halfExtent: number,
  clearance = 0,
): T {
  const limit = Math.max(0, halfExtent - clearance);
  point.x = Math.max(-limit, Math.min(limit, point.x));
  point.z = Math.max(-limit, Math.min(limit, point.z));
  return point;
}
