/** Every preset uses the real sector geometry; only timing and light differ. */
export const SWEEP_VISUAL_PRESETS = {
  compact: {title:'A · 紧凑',brightness:.85,coreGain:.6,opacity:.78,durationMs:180,fadeStartMs:125,
    sequence:[{frame:0,ms:20},{frame:1,ms:35},{frame:2,ms:125}]},
  balanced: {title:'B · 实战均衡',brightness:1,coreGain:.7,opacity:.94,durationMs:230,fadeStartMs:165,
    sequence:[{frame:0,ms:25},{frame:1,ms:45},{frame:2,ms:160}]},
  punchy: {title:'C · 强调反馈',brightness:1.05,coreGain:.75,opacity:.98,durationMs:280,fadeStartMs:210,
    sequence:[{frame:0,ms:30},{frame:1,ms:55},{frame:2,ms:195}]},
} as const;
export type SweepVisualPresetId=keyof typeof SWEEP_VISUAL_PRESETS;
export const DEFAULT_SWEEP_VISUAL:SweepVisualPresetId='balanced';
export function sweepVisualPreset(value:string|null):SweepVisualPresetId{
  return value==='compact'||value==='punchy'||value==='balanced'?value:DEFAULT_SWEEP_VISUAL;
}
export interface SweepVisualSample{visible:boolean;frame:number;opacity:number;progress:number}
export function sampleSweepVisual(age:number,id:SweepVisualPresetId,out:SweepVisualSample){
  const p=SWEEP_VISUAL_PRESETS[id],ms=age*1000;
  out.visible=Number.isFinite(ms)&&ms>=0&&ms<p.durationMs;out.opacity=0;
  if(!out.visible)return out;
  out.progress=ms/p.durationMs;
  let end=0;for(const e of p.sequence){end+=e.ms;if(ms<end){out.frame=e.frame;break;}}
  out.opacity=p.opacity*(ms<=p.fadeStartMs?1:Math.pow((p.durationMs-ms)/(p.durationMs-p.fadeStartMs),1.5));
  return out;
}
