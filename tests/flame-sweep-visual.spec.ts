import {test,expect} from '@playwright/test';
import {SWEEP_VISUAL_PRESETS,sampleSweepVisual,sweepVisualPreset} from '../src/flame-sweep-visual';
import {FLAME_SWEEP} from '../src/flame-sweep';

test('every preset samples the same three reused frames inside one attack lifetime',()=>{
  for(const id of ['compact','balanced','punchy'] as const){
    const p=SWEEP_VISUAL_PRESETS[id],sample={visible:false,frame:0,opacity:0,progress:0};let time=0;
    expect(p.durationMs/1000).toBeLessThan(FLAME_SWEEP.duration);
    for(const e of p.sequence){sampleSweepVisual((time+e.ms/2)/1000,id,sample);expect(sample.frame).toBe(e.frame);expect(sample.visible).toBe(true);time+=e.ms;}
    expect(time).toBe(p.durationMs);sampleSweepVisual(time/1000,id,sample);expect(sample.visible).toBe(false);
  }
  expect(FLAME_SWEEP.sourceFrames).toEqual([12,13,14]);
});
test('invalid presets and ages fail safely while the tail fades promptly',()=>{
  expect(sweepVisualPreset('invalid')).toBe('balanced');
  const out={visible:false,frame:0,opacity:0,progress:0};
  sampleSweepVisual(.13,'balanced',out);expect(out.opacity).toBe(.94);
  sampleSweepVisual(.22,'balanced',out);expect(out.opacity).toBeLessThan(.1);
  sampleSweepVisual(NaN,'balanced',out);expect(out.visible).toBe(false);
});
