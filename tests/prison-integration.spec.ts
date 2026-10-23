import {test,expect} from '@playwright/test';
for(const phone of [false,true])test(`prison reuses captured art, work chain, upgrades and save (${phone?'phone':'desktop'})`,async({page})=>{
 await page.setViewportSize(phone?{width:390,height:844}:{width:1280,height:800});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/prison-harness',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<script type="module">
 import '/src/capture.css';import {PrisonView} from '/src/prison-view.ts';import {CaptureCollection} from '/src/capture-collection.ts';
 const collection=new CaptureCollection(localStorage);for(const kind of ['normal','mirror-wisp','tank'])collection.add(kind,'fixture:'+kind);
 window.prison=new PrisonView(collection,()=>{},()=>window.prison.close());window.prison.open();window.ready=true;
 </script>`}));
 await page.goto('/prison-harness');await page.waitForFunction(()=> (window as any).ready);
 expect(await page.evaluate(()=> (window as any).prison.inspect().monsters)).toEqual([]);
 const bounds=await page.locator('.prison-world').boundingBox();expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(phone?844:800);
 await page.evaluate(()=> (window as any).prison.scene.showRoster());
 await expect(page.locator('.roster-monster')).toHaveCount(3);
 await expect(page.locator('[data-species="0"]')).toHaveCount(0);
 await page.locator('[data-species="6"]').click();
 expect(await page.evaluate(()=> (window as any).prison.inspect().monsters[0].name)).toBe('草丛怪');
 await page.evaluate(()=>{
  const p=(window as any).prison.scene;p.assign('mine');p.placeSpecies(7);p.assign('haul');p.placeSpecies(11);p.assign('grow');
  // Locked species cannot be installed through either the UI or scene controller.
  p.placeSpecies(0);
 });
 const before=await page.evaluate(()=> (window as any).prison.inspect());expect(before.monsters).toHaveLength(3);
 expect(before.monsters.map((m:any)=>m.job)).toEqual(['mine','haul','grow']);
 await page.evaluate(()=>{
  const p=(window as any).prison.scene;
  for(let i=0;i<2400;i++){
   p.advance(.05);const s=p.inspect();if(s.event)for(let n=0;n<3;n++)p.finishEvent(n);if(s.social)p.resolveSocial();if(s.escape)p.endEscape(true);if(s.firefly)for(let n=0;n<3;n++)p.catchFirefly();
  }
  p.collect();
 });
 const produced=await page.evaluate(()=> (window as any).prison.inspect());
 expect(produced.totalCycles).toBeGreaterThan(3);expect(produced.shipments).toBeGreaterThan(0);expect(produced.goods.mine).toBeGreaterThan(0);expect(produced.goods.grow).toBeGreaterThan(0);
 await page.evaluate(()=>{const p=(window as any).prison.scene;p.deliverCommission();p.buildUpgrade('rail');p.buildUpgrade('rail');});
 const upgraded=await page.evaluate(()=> (window as any).prison.inspect());expect(upgraded.completedCommissions).toBeGreaterThan(0);expect(upgraded.buildings.rail).toBe(1);
 await page.screenshot({path:`artifacts/prison-integrated-${phone?'phone':'desktop'}.png`});
 await page.evaluate(()=>{const p=(window as any).prison;p.close();p.open();});
 const restored=await page.evaluate(()=> (window as any).prison.inspect());expect(restored.monsters).toHaveLength(3);expect(restored.buildings.rail).toBe(1);expect(restored.completedCommissions).toBe(upgraded.completedCommissions);
 expect(errors).toEqual([]);
});
