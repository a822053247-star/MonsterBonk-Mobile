import { test, expect } from '@playwright/test';
import { VFX_PRESETS } from '../src/visuals/vfx-presets';
import { VfxResolver, validateVfxPreset, visualProgress } from '../src/visuals/vfx-resolver';

test('builtins resolve real attack/effect IDs and custom presets bind without renderer classes', () => {
  const r = new VfxResolver();
  expect(r.projectile('spark')?.id).toBe('fire-projectile');
  expect(r.projectile('bubble')?.id).toBe('water-projectile');
  expect(r.impact('water')?.id).toBe('water-impact');
  expect(r.impact('burst')?.id).toBe('fire-explosion');
  expect(r.area('steam')?.duration).toBe('event');
  expect(r.projectile('leaf')).toBeUndefined(); expect(r.impact('death')).toBeUndefined();
  const custom = { ...r.projectile('bubble')!, id: 'ice-shot', color: '#aabbff', trail: { color: '#ccccff', length: 1.2, opacity: .3 } };
  r.register(custom); r.bindProjectile('bubble', 'ice-shot'); custom.trail.length = 2;
  expect(r.projectile('bubble')?.trail.length).toBe(1.2);
  expect(Object.isFrozen(r.projectile('bubble')?.trail)).toBe(true);
  expect(() => r.register(custom)).toThrow('Duplicate');
  expect(() => r.bindProjectile('spark', 'steam-area')).toThrow('mismatched');
  expect(() => r.bindArea('steam', 'absent')).toThrow('Unknown');
});

test('invalid authoring data fails registration, including nonfinite and out of atlas values', () => {
  const shot = VFX_PRESETS[0];
  for (const value of [null, {}, {...shot,id:''}, {...shot,type:'unknown'}, {...shot,color:'red'},
    {...shot,scale:NaN}, {...shot,scale:Infinity}, {...shot,scale:0}, {...shot,low:{}},
    {...shot,trail:{color:'#ffffff',length:99,opacity:1}}, {...shot,trail:{color:'#ffffff',length:1,opacity:-1}},
    {...shot,animation:{atlas:'external-url',row:0,frames:[0],fps:12}},
    {...shot,animation:{atlas:'fire',row:4,frames:[0],fps:12}},
    {...shot,animation:{atlas:'fire',row:0,frames:[4],fps:12}},
    {...shot,animation:{atlas:'fire',row:0,frames:[],fps:12}},
    {...shot,animation:{atlas:'fire',row:0,frames:[0],fps:0}},
    {...VFX_PRESETS[2],duration:-1}, {...VFX_PRESETS[5],duration:99}, {...VFX_PRESETS[5],fade:2},
    {...VFX_PRESETS[5],pulseSpeed:Infinity}, {...VFX_PRESETS[2],height:NaN}, {...VFX_PRESETS[5],rise:-1}]) expect(() => validateVfxPreset(value)).toThrow();
  for (const p of VFX_PRESETS) expect(() => validateVfxPreset(p)).not.toThrow();
});

test('presentation durations are clamped to combat clocks and cannot outlive expired events', () => {
  expect(visualProgress({duration:.55,time:.55})).toBe(0);
  expect(visualProgress({duration:.55,time:.275})).toBe(.5);
  expect(visualProgress({duration:.32,time:.16},.16)).toBe(1);
  expect(visualProgress({duration:.32,time:0},2)).toBe(1);
  expect(visualProgress({duration:0,time:0})).toBe(0);
});

test('runtime content errors retain the last working preset without throwing', () => {
  const r = new VfxResolver(), original = r.projectile('spark');
  for (const value of [null, {...original,id:'bad-size',scale:NaN}, {...original,id:'bad-atlas',animation:{atlas:'fire',row:99,frames:[0],fps:12}},
    {...r.area('steam'),id:'wrong-type'}, original]) {
    expect(r.tryBind({type:'projectile',attack:'spark'},value).ok).toBe(false);
    expect(r.projectile('spark')).toBe(original);
  }
  expect(r.tryBind({type:'projectile',attack:'spark'},{...original,id:'test-new-shot',scale:1.5}).ok).toBe(true);
  expect(r.projectile('spark')?.id).toBe('test-new-shot');
  expect(r.tryBind({type:'impact',effect:'water'},{...r.impact('water'),id:'test-impact'}).ok).toBe(true);
  expect(r.tryBind({type:'area',effect:'steam'},{...r.area('steam'),id:'test-area'}).ok).toBe(true);
});
