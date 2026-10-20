import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('four isolated relic demonstrations render real effects and support deterministic seeking',async({page},info)=>{
  test.setTimeout(120000);
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1000,height:780});
  await page.goto(process.env.RELIC_EFFECTS_URL ?? '/relic-effects-preview.html');
  await page.waitForFunction(()=>!!(window as any).relicEffectsPreview);
  await page.evaluate(()=>(window as any).relicEffectsPreview.pause());
  await expect.poll(()=>page.evaluate(()=>{
    const v=(window as any).relicEffectsPreview.inspect().view;
    return v.fire?.loaded && v.elemental?.loaded && v.batches.filter((b:any)=>b.loaded).length>=3;
  })).toBe(true);
  const names=['martyr','kindling','testament','bubble'];
  for(let index=0;index<4;index++){
    await page.evaluate(index=>(window as any).relicEffectsPreview.pose(index,.62),index);
    const snapshot=await page.evaluate(()=>(window as any).relicEffectsPreview.inspect().combat);
    if(index===0) expect(snapshot.triggerRelics.explosions).toBeGreaterThan(0);
    if(index===1) expect(snapshot.triggerRelics.burning).toBe(1);
    if(index===2) expect(snapshot.triggerRelics.thorns).toBe(3);
    if(index===3) expect(snapshot.triggerRelics.bubbles).toBe(1);
    if(info.project.name==='chromium'){
      const dir=`artifacts/relic-effects-frames/${names[index]}`; mkdirSync(dir,{recursive:true});
      for(let frame=0;frame<40;frame++){
        await page.evaluate(({index,frame})=>(window as any).relicEffectsPreview.pose(index,frame*.08),{index,frame});
        await page.locator('.preview-stage').screenshot({path:`${dir}/${String(frame).padStart(3,'0')}.png`,animations:'disabled'});
      }
      await page.evaluate(index=>(window as any).relicEffectsPreview.pose(index,index===1?1.18:.62),index);
      await page.screenshot({path:`artifacts/relic-effects-${names[index]}.png`});
    }
  }
  await page.locator('[data-demo="1"]').click();
  await expect(page.locator('#description')).toContainText('没有常驻');
  await page.locator('#play').click(); await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('播放');
  expect(errors).toEqual([]);
});
