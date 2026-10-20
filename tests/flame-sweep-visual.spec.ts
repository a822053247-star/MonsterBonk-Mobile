import { test, expect } from '@playwright/test';
import { DEFAULT_SWEEP_VISUAL, SWEEP_VISUAL_PRESETS, sampleSweepVisual, sweepVisualPreset } from '../src/flame-sweep-visual';
import { FLAME_SWEEP } from '../src/flame-sweep';

test('visual presets keep bounded scale, use short windup and fast tails, and finish before the unchanged combat clock',()=>{
  for(const id of ['compact','balanced','punchy'] as const){
    const p=SWEEP_VISUAL_PRESETS[id];expect(p.sizeRatio).toBeGreaterThanOrEqual(.65);expect(p.sizeRatio).toBeLessThanOrEqual(.75);
    expect(p.sequence.reduce((s,e)=>s+e.ms,0)).toBe(p.durationMs);
    expect(p.durationMs/1000).toBeLessThan(FLAME_SWEEP.duration);
    expect(p.sequence[0].ms).toBeLessThan(p.sequence.find(e=>e.frame===4)!.ms);
    const out={visible:false,frame:0,opacity:0,progress:0};let elapsed=0;
    for(const e of p.sequence){sampleSweepVisual((elapsed+e.ms/2)/1000,id,out);expect(out.visible).toBe(true);expect(out.frame).toBe(e.frame);elapsed+=e.ms}
    sampleSweepVisual(p.durationMs/1000,id,out);expect(out.visible).toBe(false);expect(out.opacity).toBe(0);
    expect(p.height).toBeLessThan(1.25);expect(p.compression).toBeLessThan(1);expect(p.coreGain).toBeLessThan(1);
    expect(p.rootOpacity).toBeLessThan(1);expect(p.tipOpacity).toBeLessThan(1);
  }
  expect(FLAME_SWEEP).toMatchObject({damage:36,radius:2.8,interval:.9,duration:.4,bodyOffset:.55});
});

test('preset query falls back safely, and the balanced tail rapidly fades instead of lingering',()=>{
  expect(DEFAULT_SWEEP_VISUAL).toBe('balanced');expect(sweepVisualPreset('garbage')).toBe('balanced');expect(sweepVisualPreset('compact')).toBe('compact');
  const out={visible:false,frame:0,opacity:0,progress:0};sampleSweepVisual(.13,'balanced',out);expect(out.opacity).toBe(.96);
  sampleSweepVisual(.22,'balanced',out);expect(out.opacity).toBeLessThan(.1);
  sampleSweepVisual(NaN,'balanced',out);expect(out.visible).toBe(false);
});
