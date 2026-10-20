# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: weapon-balance.spec.ts >> four weapons retain distinct jobs at levels one, three and five
- Location: tests\weapon-balance.spec.ts:4:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 59.625
Received:   58.67
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { measureWeapon } from '../scripts/weapon-balance';
  3  | 
  4  | test('four weapons retain distinct jobs at levels one, three and five', () => {
  5  |   for(const level of [1,3,5]) {
  6  |     const nearFire=measureWeapon('spark',level,'boss-near');
  7  |     const nearSweep=measureWeapon('flame-sweep',level,'boss-near');
  8  |     // Close-range risk can buy a small bonus, not a universal boss weapon.
  9  |     expect(nearSweep.dps).toBeLessThanOrEqual(nearFire.dps*1.15);
  10 |     expect(nearSweep.dps).toBeGreaterThan(nearFire.dps*.75);
  11 |     expect(measureWeapon('flame-sweep',level,'boss-far').dps).toBe(0);
  12 |     expect(measureWeapon('spark',level,'boss-far').dps).toBeGreaterThan(nearFire.dps*.9);
  13 |     const leaf=measureWeapon('leaf',level,'line');
> 14 |     expect(leaf.dps).toBeGreaterThan(measureWeapon('spark',level,'line').dps*1.5);
     |                      ^ Error: expect(received).toBeGreaterThan(expected)
  15 |     expect(measureWeapon('bubble',level,'boss-far').slowUptime).toBeGreaterThan(.95);
  16 |     const mowing=measureWeapon('flame-sweep',level,'mowing',true);
  17 |     const rangedMowing=measureWeapon('spark',level,'mowing',true);
  18 |     expect(mowing.kills).toBeGreaterThan(rangedMowing.kills*1.5);
  19 |     expect(mowing.kills).toBeLessThan(rangedMowing.kills*3.5);
  20 |     expect(measureWeapon('flame-sweep',level,'boss-near',true).dps)
  21 |       .toBeLessThan(measureWeapon('spark',level,'boss-near',true).dps);
  22 |     expect(measureWeapon('bubble',level,'cluster',true).slowUptime).toBeGreaterThan(.8);
  23 |   }
  24 | });
  25 | 
```