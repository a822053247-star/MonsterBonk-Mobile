import { test, expect } from '@playwright/test';

for (const [attack, dev] of [['spark',''],['bubble','paopaoyuan']] as const) {
  test(`${attack} presets run from the shipped entry with natural auto attacks`, async ({page,browserName})=>{
    test.setTimeout(45_000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width:844,height:390});
    await page.goto('/?world=fixed'+(dev?'&fusionDev='+dev:''));
    await page.locator('#start-fusion').click();
    await expect.poll(()=>page.evaluate(()=>{
      const s=(window as any).__monsterbonk.inspect();
      return s.combat.hits > 0 && s.enemyVisual.feedback.loaded;
    }),{timeout:25_000}).toBe(true);
    const state=await page.evaluate(()=>(window as any).__monsterbonk.inspect());
    expect(state.combat.build.attacks[0].attackId).toBe(attack);
    expect(state.run).toBeTruthy();expect(state.enemyVisual.feedback.capacity).toBe(48);
    expect(state.combat.limits.projectiles).toBe(24);
    if(browserName==='chromium')await page.screenshot({path:`artifacts/vfx-${attack}-live.png`});
    expect(errors).toEqual([]);
  });
}
