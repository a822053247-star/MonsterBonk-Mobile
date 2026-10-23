export interface SpatialPoint { x: number; z: number }
export interface SpatialCircle extends SpatialPoint { radius: number }
const ascending = (a: number, b: number) => a - b;

/** Broad phase only. Results retain source/pool order; callers own exact collision rules. */
export class SpatialIndex<T extends SpatialPoint> {
  private columns = new Map<number, Map<number, number[]>>();
  private spareColumns: Map<number, number[]>[] = [];
  private spareBuckets: number[][] = [];
  private xs = new Int32Array(0);
  private zs = new Int32Array(0);
  private present = new Uint8Array(0);
  private items: readonly T[] = [];
  private maxRadius = 0;

  constructor(private radius: (item: T) => number, private eligible: (item: T) => boolean = () => true,
    private cellSize = 3) {}

  rebuild(items: readonly T[]) {
    for (const column of this.columns.values()) {
      for (const bucket of column.values()) { bucket.length = 0; this.spareBuckets.push(bucket); }
      column.clear(); this.spareColumns.push(column);
    }
    this.columns.clear(); this.items = items; this.maxRadius = 0;
    if (this.present.length < items.length) {
      this.xs = new Int32Array(items.length); this.zs = new Int32Array(items.length);
      this.present = new Uint8Array(items.length);
    } else this.present.fill(0);
    for (let i = 0; i < items.length; i++) this.update(i);
  }

  update(index: number) {
    const item = this.items[index];
    const active = item && this.eligible(item) && Number.isFinite(item.x) && Number.isFinite(item.z);
    const x = active ? Math.floor(item.x / this.cellSize) : 0, z = active ? Math.floor(item.z / this.cellSize) : 0;
    if (active) this.maxRadius = Math.max(this.maxRadius, this.radius(item));
    if (this.present[index]) {
      if (active && this.xs[index] === x && this.zs[index] === z) return;
      const column = this.columns.get(this.xs[index])!, bucket = column.get(this.zs[index])!;
      bucket.splice(bucket.indexOf(index), 1);
      if (!bucket.length) { column.delete(this.zs[index]); this.spareBuckets.push(bucket); }
      if (!column.size) { this.columns.delete(this.xs[index]); this.spareColumns.push(column); }
      this.present[index] = 0;
    }
    if (!active) return;
    let column = this.columns.get(x);
    if (!column) { column = this.spareColumns.pop() ?? new Map(); this.columns.set(x, column); }
    let bucket = column.get(z);
    if (!bucket) { bucket = this.spareBuckets.pop() ?? []; column.set(z, bucket); }
    bucket.push(index); this.xs[index] = x; this.zs[index] = z; this.present[index] = 1;
  }

  private append(index: number, minX: number, minZ: number, maxX: number, maxZ: number, out: number[]) {
    const item = this.items[index];
    if (!this.present[index] || !this.eligible(item)) return;
    const radius = this.radius(item);
    if (item.x + radius >= minX && item.x - radius <= maxX && item.z + radius >= minZ && item.z - radius <= maxZ) out.push(index);
  }

  bounds(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]) {
    out.length = 0;
    const left = Math.floor((minX - this.maxRadius) / this.cellSize), right = Math.floor((maxX + this.maxRadius) / this.cellSize);
    const top = Math.floor((minZ - this.maxRadius) / this.cellSize), bottom = Math.floor((maxZ + this.maxRadius) / this.cellSize);
    // Long sight lines/large AoEs should not walk thousands of empty cells.
    if ((right - left + 1) * (bottom - top + 1) > this.items.length * 2) {
      for (let i = 0; i < this.items.length; i++) this.append(i, minX, minZ, maxX, maxZ, out);
    } else {
      for (let x = left; x <= right; x++) {
        const column = this.columns.get(x);
        if (!column) continue;
        for (let z = top; z <= bottom; z++) {
          const bucket = column.get(z);
          if (bucket) for (let i = 0; i < bucket.length; i++) this.append(bucket[i], minX, minZ, maxX, maxZ, out);
        }
      }
    }
    out.sort(ascending); return out;
  }
}

/** Shared by navigation and combat; map revisions invalidate same-length changes too. */
export class ObstacleIndex<T extends SpatialCircle = SpatialCircle> {
  private grid = new SpatialIndex<T>(item => item.radius);
  private source?: readonly T[];
  private count = -1;
  private dirty = true;
  version = 0;
  constructor(private read: () => readonly T[]) {}
  invalidate() { this.dirty = true; }
  ensure() {
    const source = this.read();
    if (this.dirty || this.source !== source || this.count !== source.length) {
      this.source = source; this.count = source.length; this.dirty = false;
      this.grid.rebuild(source); this.version++;
    }
  }
  get items() { this.ensure(); return this.source!; }
  bounds(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]) {
    this.ensure(); return this.grid.bounds(minX, minZ, maxX, maxZ, out);
  }
}
