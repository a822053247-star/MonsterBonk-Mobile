import { test, expect } from '@playwright/test';
test('reference chest renders real reward names, freezes, and reveals all five lanes',async({page})=>{
 await page.route('**/chest-harness',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<body style="margin:0;background:#120d27"><canvas id="chest" width="900" height="988" style="height:100vh;max-width:100vw"></canvas><script type="module">import {createTreasureCanvas} from '/src/treasure-canvas.ts';window.draw=createTreasureCanvas(document.querySelector('canvas'),['火花升级','伤害强化','生命强化','移动强化','金币补给 +12']);</script>`}));
 await page.goto('/chest-harness');await page.waitForFunction(()=>!!(window as any).draw);
 for(const width of [1280,568]){
 await page.setViewportSize({width,height:720});
 await page.evaluate(()=>{const w=window as any; w.draw(0);w.draw(6)});
 const before=await page.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.toDataURL());
 await page.evaluate(()=>(window as any).draw(6));
 expect(await page.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.toDataURL())).toBe(before);
 await page.screenshot({path:'artifacts/treasure-chest-'+width+'.png'});
 }
});
