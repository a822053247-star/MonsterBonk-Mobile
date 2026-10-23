import { isInsideRectangularBoundary } from './arena-boundary';
import { ObstacleIndex } from './spatial-index';
export interface GroundPoint { x: number; z: number }
export interface GroundObstacle extends GroundPoint { radius: number }

/** One shared clearance/flow field for the enemy crowd, rebuilt only when the
 * target changes cells or the map changes. Local repulsion alone cannot escape
 * concave shores. The field reserves room for the largest enemy (tank). */
export class GroundNavigation {
  private readonly width: number;
  private readonly blocked: Uint8Array;
  private readonly distance: Int32Array;
  private readonly queue: Int32Array;
  private obstacleVersion = -1;
  private topologyDirty = true;
  private readonly connections: Uint8Array;
  private readonly knownConnections: Uint8Array;
  private obstacleCandidates: number[] = [];
  private targetCell = -2;
  private centerX = 0;
  private centerZ = 0;
  private readonly clearance = .95;

  constructor(obstacles: readonly GroundObstacle[], private boundary: number,
    private obstacleIndex = new ObstacleIndex(() => obstacles)) {
    this.width = Math.ceil(boundary * 2) + 1;
    this.blocked = new Uint8Array(this.width ** 2);
    this.distance = new Int32Array(this.width ** 2);
    this.queue = new Int32Array(this.width ** 2);
    this.connections = new Uint8Array(this.width ** 2);
    this.knownConnections = new Uint8Array(this.width ** 2);
  }

  invalidate() { this.obstacleIndex.invalidate(); this.topologyDirty = true; this.targetCell = -2; }

  setCenter(x: number, z: number, force = false) {
    if (!force && Math.hypot(x - this.centerX, z - this.centerZ) < 7) return;
    this.centerX = x; this.centerZ = z;
    this.topologyDirty = true; this.targetCell = -2;
  }

  private clear(x: number, z: number, radius: number) {
    if (!isInsideRectangularBoundary(x - this.centerX, z - this.centerZ, this.boundary, radius)) return false;
    const indices = this.obstacleIndex.bounds(x - radius, z - radius, x + radius, z + radius, this.obstacleCandidates);
    const obstacles = this.obstacleIndex.items;
    for (const index of indices) {
      const o = obstacles[index], r = o.radius + radius;
      if (Math.abs(x - o.x) <= r && Math.abs(z - o.z) <= r && Math.hypot(x - o.x, z - o.z) < r) return false;
    }
    return true;
  }

  private line(ax: number, az: number, bx: number, bz: number, radius: number) {
    if (!this.clear(ax, az, radius) || !this.clear(bx, bz, radius)) return false;
    const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
    const indices = this.obstacleIndex.bounds(Math.min(ax, bx) - radius, Math.min(az, bz) - radius,
      Math.max(ax, bx) + radius, Math.max(az, bz) + radius, this.obstacleCandidates);
    const obstacles = this.obstacleIndex.items;
    for (const index of indices) {
      const o = obstacles[index];
      const t = length ? Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / length)) : 0;
      if ((ax + dx * t - o.x) ** 2 + (az + dz * t - o.z) ** 2 < (o.radius + radius) ** 2) return false;
    }
    return true;
  }

  private x(index: number) { return index % this.width - this.boundary + this.centerX; }
  private z(index: number) { return Math.floor(index / this.width) - this.boundary + this.centerZ; }

  private cell(point: GroundPoint, requireConnection: boolean) {
    const cx = Math.round(point.x - this.centerX + this.boundary), cz = Math.round(point.z - this.centerZ + this.boundary);
    let closest = -1, best = Infinity;
    for (let ring = 0; ring <= 3; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= this.width || z >= this.width) continue;
        const index = z * this.width + x;
        if (this.blocked[index]) continue;
        const wx = this.x(index), wz = this.z(index), d = (point.x - wx) ** 2 + (point.z - wz) ** 2;
        if (d >= best || requireConnection && !this.line(point.x, point.z, wx, wz, this.clearance)) continue;
        best = d; closest = index;
      }
      if (closest >= 0) return closest;
    }
    return -1;
  }

  private prepare(target: GroundPoint) {
    this.obstacleIndex.ensure();
    if (this.topologyDirty || this.obstacleVersion !== this.obstacleIndex.version) {
      this.topologyDirty = false; this.obstacleVersion = this.obstacleIndex.version;
      for (let i = 0; i < this.blocked.length; i++) this.blocked[i] = +!this.clear(this.x(i), this.z(i), this.clearance);
      this.connections.fill(0); this.knownConnections.fill(0);
      this.targetCell = -2;
    }
    const goal = this.cell(target, false);
    if (goal === this.targetCell) return;
    this.targetCell = goal;
    this.distance.fill(-1);
    if (goal < 0) return;
    let read = 0, write = 1;
    this.queue[0] = goal; this.distance[goal] = 0;
    while (read < write) {
      const index = this.queue[read++], cx = index % this.width, cz = Math.floor(index / this.width);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= this.width || z >= this.width) continue;
        const next = z * this.width + x;
        if (this.blocked[next] || this.distance[next] >= 0) continue;
        if (dx && dz && (this.blocked[cz * this.width + x] || this.blocked[z * this.width + cx])) continue;
        // Cache map-dependent edge clearance across player target-cell changes.
        const direction = (dz + 1) * 3 + dx + 1;
        const ordinal = direction > 4 ? direction - 1 : direction, bit = 1 << ordinal;
        if (!(this.knownConnections[index] & bit)) {
          const reverse = 1 << (7 - ordinal);
          this.knownConnections[index] |= bit; this.knownConnections[next] |= reverse;
          if (this.line(this.x(index), this.z(index), this.x(next), this.z(next), this.clearance)) {
            this.connections[index] |= bit; this.connections[next] |= reverse;
          }
        }
        if (!(this.connections[index] & bit)) continue;
        this.distance[next] = this.distance[index] + 1;
        this.queue[write++] = next;
      }
    }
  }

  reachable(point: GroundPoint, target: GroundPoint) {
    this.prepare(target);
    if (!this.clear(point.x, point.z, this.clearance)) return false;
    const index = this.cell(point, true);
    return index >= 0 && this.distance[index] >= 0;
  }

  /** Audit every tank-clear cell using the same no-corner-cutting routes as play. */
  audit(target: GroundPoint) {
    this.prepare(target);
    let walkable = 0, reachable = 0, inside = 0;
    for (let i = 0; i < this.blocked.length; i++) {
      if (isInsideRectangularBoundary(this.x(i) - this.centerX, this.z(i) - this.centerZ, this.boundary, this.clearance)) inside++;
      if (this.blocked[i]) continue;
      walkable++;
      if (this.distance[i] >= 0) reachable++;
    }
    return { walkable, reachable, inside };
  }

  /** Writes a visible waypoint; callers retain their existing speed and damage. */
  guide(point: GroundPoint, target: GroundPoint, radius: number, result: GroundPoint) {
    if (this.line(point.x, point.z, target.x, target.z, radius + .03)) {
      result.x = target.x; result.z = target.z;
      return true;
    }
    this.prepare(target);
    const index = this.cell(point, true);
    if (index < 0 || this.distance[index] < 0) return false;
    let next = index, best = this.distance[index];
    const cx = index % this.width, cz = Math.floor(index / this.width);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= this.width || z >= this.width) continue;
      const candidate = z * this.width + x, cost = this.distance[candidate];
      if (cost < 0 || cost >= best || !this.line(point.x, point.z, this.x(candidate), this.z(candidate), radius + .03)) continue;
      next = candidate; best = cost;
    }
    result.x = this.x(next); result.z = this.z(next);
    return true;
  }
}
