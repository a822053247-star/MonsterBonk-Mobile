import { test, expect } from '@playwright/test';
import { measureRun } from '../scripts/run-balance';

test('earned choices, HP and resources carry through a continuous run deterministically',()=>{
  const first=measureRun('yanrong','chain','forager',42,150);
  expect(first).toEqual(measureRun('yanrong','chain','forager',42,150));
  expect(first.wave).toBeGreaterThanOrEqual(3);
  expect(first.level).toBeGreaterThan(3);
  expect(first.firstMatureFireAt).not.toBeNull();
  expect(first.choices.every(c=>c.source==='level')).toBe(true);
  expect(first.segments.some(s=>s.beat==='pressure'&&s.damage>0)).toBe(true);
});

test('standing still with real damage is not sufficient to coast through the formal run',()=>{
  const result=measureRun('yanrong','focused','stationary',42);
  expect(result.phase).toBe('lost');
  expect(result.seconds).toBeGreaterThan(20);
  expect(result.seconds).toBeLessThan(210);
  expect(result.hp).toBe(0);
});

test('a naturally earned mature build gets a late harvest payoff without bypassing pressure or pool limits',()=>{
  const result=measureRun('yanrong','chain','forager',42);
  const pressure=result.segments.find(s=>s.wave===5&&s.beat==='pressure')!;
  const harvest=result.segments.find(s=>s.wave===5&&s.beat==='release')!;
  expect(result.wave).toBe(6);
  expect(result.reactions.maxGeneration).toBeLessThanOrEqual(3);
  expect(result.reactions.maxNodes).toBeLessThanOrEqual(24);
  expect(result.reactions.chainKills).toBeGreaterThan(0);
  expect(harvest.kills/(harvest.end-harvest.start)).toBeGreaterThan(pressure.kills/(pressure.end-pressure.start)*1.3);
  expect(harvest.escorts).toBe(0);
  expect(pressure.escorts).toBeGreaterThan(0);
  expect(result.segments.filter(s=>s.wave<6).every(s=>s.activePeak<=112)).toBe(true);
});

test('invalid campaign probes are rejected',()=>{
  expect(()=>measureRun('yanrong','chain','forager',42,0)).toThrow(RangeError);
});
