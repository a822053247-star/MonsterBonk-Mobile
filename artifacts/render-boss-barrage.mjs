import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
page.on('pageerror',error=>console.log('PAGE:',error.message));
await page.goto('http://127.0.0.1:5185/boss-skills-preview.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__bossSkills?.inspect().view.boss?.atlases.some(a=>a.loaded),{timeout:20000});
await page.selectOption('#rage','enraged');
await page.selectOption('#skill','flower');
await page.evaluate(()=>window.__bossSkills.advance(4.4));
await page.waitForTimeout(250);
await page.screenshot({path:'artifacts/boss-barrage-flower.png',fullPage:true});
console.log('FLOWER',await page.locator('#status').textContent());
await page.selectOption('#skill','spiral');
await page.evaluate(()=>window.__bossSkills.advance(4.4));
await page.waitForTimeout(250);
await page.screenshot({path:'artifacts/boss-barrage-spiral.png',fullPage:true});
console.log('SPIRAL',await page.locator('#status').textContent());
await browser.close();

