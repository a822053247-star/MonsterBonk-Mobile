/** Presentation only. Never used by Combat's damage, radius or cooldown. */
export const SWEEP_VISUAL_PRESETS = {
  compact: {
    title: 'A · 紧凑', sizeRatio: .65, forward: .72, height: .45, compression: .58,
    brightness: .80, coreGain: .50, opacity: .70, rootOpacity: .22, tipOpacity: .22, rotation: .08,
    durationMs: 180, fadeStartMs: 125,
    sequence: [{frame:0,ms:12},{frame:2,ms:23},{frame:4,ms:90},{frame:6,ms:30},{frame:7,ms:25}],
  },
  balanced: {
    title: 'B · 实战均衡', sizeRatio: .70, forward: .78, height: .60, compression: .68,
    brightness: 1.00, coreGain: .70, opacity: .96, rootOpacity: .65, tipOpacity: .45, rotation: .08,
    durationMs: 230, fadeStartMs: 170,
    sequence: [{frame:0,ms:15},{frame:2,ms:25},{frame:3,ms:65},{frame:4,ms:65},{frame:6,ms:35},{frame:7,ms:25}],
  },
  punchy: {
    title: 'C · 强调反馈', sizeRatio: .75, forward: .82, height: .72, compression: .78,
    brightness: .92, coreGain: .70, opacity: .86, rootOpacity: .38, tipOpacity: .38, rotation: .10,
    durationMs: 280, fadeStartMs: 225,
    sequence: [{frame:0,ms:15},{frame:1,ms:20},{frame:2,ms:30},{frame:3,ms:60},{frame:4,ms:60},{frame:5,ms:40},{frame:6,ms:30},{frame:7,ms:25}],
  },
} as const;
export type SweepVisualPresetId = keyof typeof SWEEP_VISUAL_PRESETS;
export const DEFAULT_SWEEP_VISUAL: SweepVisualPresetId = 'balanced';
export function sweepVisualPreset(value: string | null): SweepVisualPresetId {
  return value === 'compact' || value === 'punchy' || value === 'balanced' ? value : DEFAULT_SWEEP_VISUAL;
}
export interface SweepVisualSample { visible: boolean; frame: number; opacity: number; progress: number }
/** Reuse caller storage; short windup, held impact, fast tail. */
export function sampleSweepVisual(age: number, id: SweepVisualPresetId, out: SweepVisualSample) {
  const preset = SWEEP_VISUAL_PRESETS[id], ms = age*1000;
  out.visible = Number.isFinite(ms) && ms >= 0 && ms < preset.durationMs;
  out.opacity = 0;
  if (!out.visible) return out;
  out.progress = ms/preset.durationMs;
  let end = 0;
  for (const entry of preset.sequence) { end += entry.ms; if (ms < end) { out.frame = entry.frame; break; } }
  const tail = ms <= preset.fadeStartMs ? 1 : Math.pow((preset.durationMs-ms)/(preset.durationMs-preset.fadeStartMs),1.5);
  out.opacity = preset.opacity*tail;
  return out;
}
