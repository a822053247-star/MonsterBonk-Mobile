import { test, expect } from '@playwright/test';
import { measureWeapon } from '../scripts/weapon-balance';

test('four weapons retain distinct jobs at levels one, three and five', () => {
  for(const level of [1,3,5]) {
    const nearFire=measureWeapon('spark',level,'boss-near');
    const nearSweep=measureWeapon('flame-sweep',level,'boss-near');
    // Close-range risk can buy a small bonus, not a universal boss weapon.
    expect(nearSweep.dps).toBeLessThanOrEqual(nearFire.dps*1.15);
    expect(nearSweep.dps).toBeGreaterThan(nearFire.dps*.75);
    expect(measureWeapon('flame-sweep',level,'boss-far').dps).toBe(0);
    expect(measureWeapon('spark',level,'boss-far').dps).toBeGreaterThan(nearFire.dps*.9);
    const leaf=measureWeapon('leaf',level,'line');
    expect(leaf.dps).toBeGreaterThan(measureWeapon('spark',level,'line').dps*1.4);
    expect(measureWeapon('bubble',level,'boss-far').slowUptime).toBeGreaterThan(.95);
    const mowing=measureWeapon('flame-sweep',level,'mowing',true);
    const rangedMowing=measureWeapon('spark',level,'mowing',true);
    expect(mowing.kills).toBeGreaterThan(rangedMowing.kills*1.5);
    expect(mowing.kills).toBeLessThan(rangedMowing.kills*3.5);
    expect(measureWeapon('flame-sweep',level,'boss-near',true).dps)
      .toBeLessThan(measureWeapon('spark',level,'boss-near',true).dps);
    expect(measureWeapon('bubble',level,'cluster',true).slowUptime).toBeGreaterThan(.8);
  }
});
