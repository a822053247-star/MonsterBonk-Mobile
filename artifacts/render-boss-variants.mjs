import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
page.on('pageerror',error=>console.log('PAGE:',error.message));
await page.goto('http://127.0.0.1:5185/boss-skills-preview.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__bossSkills);
await page.selectOption('#rage','enraged');
for(const [boss,file,seconds] of [['1','molten',4.1],['2','crystal',4.4],['3','frost',4.4]]){
 await page.selectOption('#boss',boss);
 await page.evaluate(()=>window.__bossSkills.advance(0));
 await page.waitForTimeout(1200);
 await page.evaluate(seconds=>window.__bossSkills.advance(seconds),seconds);
 await page.screenshot({path:`artifacts/boss-barrage-${file}.png`,fullPage:true});
 console.log(file,await page.locator('#phase').textContent(),await page.locator('#status').textContent());
}
await browser.close();
