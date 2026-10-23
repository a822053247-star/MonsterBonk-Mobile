import {test,expect} from '@playwright/test';
test('losing focus during startup reveals pause screen instead of trapping loading overlay',async({page})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 await page.route('**/fire-effects-sheet.normalized.png',async route=>{await held;await route.continue();});
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.locator('#start-fusion').click();
 await expect(page.locator('#world-loading')).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await expect(page.locator('#pause-screen')).toBeVisible();
 await expect(page.locator('#world-loading')).toBeHidden();
 await page.screenshot({path:'artifacts/startup-timing/focus-paused-fixed.png'});
 // Resume is clickable while the required atlas is still pending, then loading continues.
 await page.locator('#resume').click();
 await expect(page.locator('#pause-screen')).toBeHidden();
 await expect(page.locator('#world-loading')).toBeVisible();
 release();
 await expect(page.locator('#world-loading')).toBeHidden({timeout:15000});
 await expect(page.locator('#hud')).toBeVisible();
 const before=await page.evaluate(()=>(window as any).__monsterbonk.inspect());
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(200);await page.keyboard.up('ArrowRight');
 const after=await page.evaluate(()=>(window as any).__monsterbonk.inspect());
 expect(after.distance).toBeGreaterThan(before.distance);
 await page.screenshot({path:'artifacts/startup-timing/focus-resumed-fixed.png'});

});

