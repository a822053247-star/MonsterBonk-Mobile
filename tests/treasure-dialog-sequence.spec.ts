import {test,expect} from '@playwright/test';

async function harness(page:import('@playwright/test').Page){
 await page.route('**/treasure-sequence',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#243c29"><script type="module">
 import '/src/style.css';import {Combat} from '/src/combat.ts';import {PartySystem} from '/src/party.ts';import {TreasureDialog} from '/src/treasure-dialog.ts';
 const c=new Combat([],32,()=>.99);c.party=new PartySystem();c.fusionEnabled=true;c.reset();c.automaticSpawning=false;c.encounters.beginWave(2);
 window.c=c;window.dialog=new TreasureDialog(c);window.ready=true;
 </script></body></html>`}));
 await page.goto('/treasure-sequence');await page.waitForFunction(()=>!!(window as any).ready);
}

test('runner death completes before chest appears, without advancing combat; reset cancels pending arrival',async({page})=>{
 await harness(page);
 const start=await page.evaluate(()=>{const {c,dialog:d}=window as any;const e=c.spawn('draft-treasure-runner',0,8,0);e.spawnTime=0;c.damageEnemy(e,100000,0,0);d.sync();return {dead:!e.active,pending:d.presentingDeath,hidden:d.root.hidden,time:c.elapsed,hp:c.hp};});
 expect(start.dead).toBe(true);expect(start.pending).toBe(true);expect(start.hidden).toBe(true);
 const halfway=await page.evaluate(()=>{const {c,dialog:d}=window as any;d.advanceDeath(.6);d.sync();return {hidden:d.root.hidden,pending:d.presentingDeath,time:c.elapsed,hp:c.hp};});
 expect(halfway).toEqual({hidden:true,pending:true,time:start.time,hp:start.hp});
 await page.evaluate(()=>{const d=(window as any).dialog;d.advanceDeath(.61);d.sync();});
 await expect(page.locator('.treasure-dialog')).toBeVisible();
 await expect(page.getByRole('button',{name:'开启宝箱',exact:true})).toBeEnabled();
 await page.evaluate(()=>{const {c,dialog:d}=window as any;d.reset();c.reset();d.sync();});
 await expect(page.locator('.treasure-dialog')).toBeHidden();
});

test('all five reward counts fit desktop and short landscape with visible rolling and explicit continuation',async({page,browserName})=>{
 test.setTimeout(60_000);
 await harness(page);
 for(const viewport of [{width:1440,height:900},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(let n=1;n<=5;n++){
   await page.evaluate(n=>{const {c,dialog:d}=window as any;d.reset();c.clearWave();c.grantTreasure(n,{x:0,z:0});d.sync();},n);
   const button=page.getByRole('button',{name:'开启宝箱',exact:true});await expect(button).toBeEnabled();await button.click();
   await page.waitForFunction(()=>(window as any).dialog.draw.inspect().phase==='rolling');
   const canvas=page.locator('.treasure-dialog canvas');
   const before=await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());
   await page.waitForTimeout(180);
   expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL())).not.toBe(before);
   const bounds=await page.locator('.treasure-dialog-panel').boundingBox();
    expect(bounds!.width).toBeGreaterThan(700);
   expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(viewport.height);
   if(browserName==='chromium')await page.screenshot({path:'artifacts/treasure-expanded-'+viewport.width+'-'+n+'-rolling.png'});
   // Advance the real presentation deterministically after recording its motion.
   await page.evaluate(()=>{const d=(window as any).dialog;d.age=8;d.draw(8);});
   await expect(page.getByRole('heading',{name:'宝藏已获得',exact:true})).toBeVisible();
   if(browserName==='chromium'&&n===5)await page.screenshot({path:'artifacts/treasure-expanded-'+viewport.width+'-5-result.png'});
   await page.getByRole('button',{name:'继续战斗',exact:true}).click();
   await expect(page.locator('.treasure-dialog')).toBeHidden();
  }
 }
});
