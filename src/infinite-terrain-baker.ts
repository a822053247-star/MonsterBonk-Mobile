import { CHUNK_SIZE, TERRAIN_PIXELS_PER_UNIT, terrainSteps, type InfiniteChunkLayout } from './infinite-terrain';

export interface TerrainRequest { id: number; seed: string; cx: number; cz: number }
export type TerrainReply = { id: number; layout: InfiniteChunkLayout; image: ImageBitmap } | { id: number; error: string };
export interface PreparedTerrain { layout: InfiniteChunkLayout; image: ImageBitmap | HTMLCanvasElement }
type Job = TerrainRequest & { resolve: (result: PreparedTerrain) => void; reject: (error: unknown) => void };

export function releaseTerrainImage(image: PreparedTerrain['image']) {
  if ('close' in image) image.close();
  else image.width = image.height = 0;
}

/** One background job at a time. No Worker/canvas allocation until first demand. */
export class TerrainBaker {
  private worker: Worker | null | undefined;
  private job?: Job;
  private sequence = 0;
  private frame = 0;
  private timer = 0;
  private watchdog = 0;
  private canvas?: HTMLCanvasElement;

  bake(seed: string, cx: number, cz: number): Promise<PreparedTerrain> {
    if (this.job) throw new Error('Terrain baker already busy');
    return new Promise((resolve, reject) => {
      const job = this.job = { id: ++this.sequence, seed, cx, cz, resolve, reject };
      if (this.worker === undefined) {
        try {
          this.worker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
            ? new Worker(new URL('./infinite-terrain.worker.ts', import.meta.url), { type: 'module' }) : null;
          if (this.worker) {
            this.worker.onmessage = ({ data }: MessageEvent<TerrainReply>) => {
              if (this.job?.id !== data.id) { if ('image' in data) data.image.close(); return; }
              const active = this.job;
              if ('error' in data) { this.fallbackFromWorker(); return; }
              window.clearTimeout(this.watchdog); this.watchdog = 0;
              this.job = undefined; active.resolve({ layout: data.layout, image: data.image });
            };
            this.worker.onerror = event => { event.preventDefault(); this.fallbackFromWorker(); };
            this.worker.onmessageerror = () => this.fallbackFromWorker();
          }
        } catch { this.worker = null; }
      }
      if (this.worker) {
        try {
          this.worker.postMessage({ id: job.id, seed, cx, cz } satisfies TerrainRequest);
          this.watchdog = window.setTimeout(() => this.fallbackFromWorker(), 15000);
        } catch { this.fallbackFromWorker(); }
      } else this.fallback(job);
    });
  }

  private fallbackFromWorker() {
    if (!this.worker) return;
    this.worker?.terminate(); this.worker = null;
    window.clearTimeout(this.watchdog); this.watchdog = 0;
    if (this.job) this.fallback(this.job);
  }

  private fallback(job: Job) {
    // Yield after terrain rows AND prop-layout rows, not just between whole chunks.
    try {
      const canvas = this.canvas = document.createElement('canvas');
      canvas.width = canvas.height = CHUNK_SIZE * TERRAIN_PIXELS_PER_UNIT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Terrain 2D canvas unavailable');
      const steps = terrainSteps(job.seed, job.cx, job.cz, context);
      const schedule = () => {
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          // Run after the render callback, with at most one 3ms slice per frame.
          this.timer = window.setTimeout(slice, 0);
        });
      };
      const slice = () => {
        this.timer = 0;
        if (this.job !== job) return;
        try {
          const until = performance.now() + 3;
          do {
            const result = steps.next();
            if (result.done) {
              this.job = undefined; this.canvas = undefined;
              job.resolve({ layout: result.value, image: canvas }); return;
            }
          } while (performance.now() < until);
          schedule();
        } catch (error) {
          releaseTerrainImage(canvas); this.canvas = undefined; this.job = undefined; job.reject(error);
        }
      };
      schedule();
    } catch (error) {
      if (this.canvas) releaseTerrainImage(this.canvas);
      this.canvas = undefined; this.job = undefined; job.reject(error);
    }
  }

  cancel() {
    cancelAnimationFrame(this.frame); window.clearTimeout(this.timer); window.clearTimeout(this.watchdog);
    this.frame = this.timer = this.watchdog = 0;
    if (this.worker) { this.worker.terminate(); this.worker = undefined; }
    if (this.canvas) releaseTerrainImage(this.canvas);
    this.canvas = undefined;
    const job = this.job; this.job = undefined;
    job?.reject(new DOMException('Terrain generation cancelled', 'AbortError'));
  }
}
