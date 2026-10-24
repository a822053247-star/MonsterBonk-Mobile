export type QualityMode = 'auto' | 'battery' | 'high';
export const MAX_GAME_SPEED = 2;
export function normalizeGameSpeed(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_GAME_SPEED, Math.max(1, Math.round(value))) : 1;
}
export interface Preferences { quality: QualityMode; music: boolean; sound: boolean; gameSpeed: number }
export const DEFAULT_PREFERENCES: Preferences = { quality: 'auto', music: true, sound: true, gameSpeed: 1 };
export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('monsterbonk-settings') || '{}');
    return { quality: ['auto', 'battery', 'high'].includes(saved.quality) ? saved.quality : 'auto', music: typeof saved.music === 'boolean' ? saved.music : true, sound: typeof saved.sound === 'boolean' ? saved.sound : true, gameSpeed: normalizeGameSpeed(saved.gameSpeed) };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value: Preferences) {
  try { localStorage.setItem('monsterbonk-settings', JSON.stringify(value)); } catch { /* Private browsing/storage limits must not prevent play. */ }
}

/** Measures RAF cadence, with hysteresis. Resets samples after lifecycle pauses. */
export class AdaptiveQuality {
  scale = 1;
  targetFps = 60;
  private seconds = 0;
  private frames = 0;
  private goodSeconds = 0;
  constructor(public mode: QualityMode = 'auto') { this.setMode(mode); }
  setMode(mode: QualityMode) {
    this.mode = mode;
    this.scale = mode === 'battery' ? 0.75 : 1;
    this.targetFps = mode === 'battery' ? 30 : 60;
    this.resetSamples();
  }
  resetSamples() { this.seconds = this.frames = this.goodSeconds = 0; }
  sample(seconds: number): boolean {
    // Ignore first-frame estimates and suspended tabs; bounded slow frames still count.
    if (this.mode === 'battery' || seconds <= 0 || seconds > 0.25) return false;
    this.seconds += seconds; this.frames++;
    if (this.seconds < 2) return false;
    const fps = this.frames / this.seconds, window = this.seconds;
    this.seconds = this.frames = 0;
    if (fps < (this.targetFps === 60 ? 48 : 26)) {
      this.goodSeconds = 0;
      if (this.scale > 0.65) { this.scale = Math.max(0.65, this.scale - 0.1); return true; }
      if (this.mode === 'auto' && this.targetFps === 60) { this.targetFps = 30; return true; }
    } else if (fps > 56) {
      this.goodSeconds += window;
      if (this.goodSeconds >= 12 && (this.scale < 1 || this.targetFps < 60)) {
        this.goodSeconds = 0;
        // At 30 rendered FPS RAF still runs at display cadence, so recovery is observable.
        if (this.targetFps === 30) this.targetFps = 60;
        else this.scale = Math.min(1, this.scale + 0.05);
        return true;
      }
    } else this.goodSeconds = 0;
    return false;
  }
  pixelRatio(deviceRatio: number, width: number, height: number) {
    const maximum = this.mode === 'high' ? 1.75 : this.mode === 'battery' ? 1 : 1.5;
    const pixels = this.mode === 'battery' ? 1_300_000 : 2_400_000;
    const areaLimit = Math.sqrt(pixels / Math.max(1, width * height));
    return Math.min(areaLimit, Math.max(0.5, Math.min(deviceRatio || 1, maximum, areaLimit) * this.scale));
  }
  get particles() { return this.mode === 'battery' || this.scale < 0.8 ? 2 : 4; }
}
