import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
page.on('pageerror',error=>console.log('PAGE:',error.message));
await page.goto('http://127.0.0.1:5185/boss-skills-preview.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__bossSkills);
await page.selectOption('#rage','enraged');
for(const [boss,patterns] of [['1',['molten-crossfire','molten-bloom']],['2',['crystal-cross','crystal-prism']],['3',['frost-snowflake','frost-drift']]]){
 await page.selectOption('#boss',boss);
 await page.evaluate(()=>window.__bossSkills.advance(0));
 await page.waitForTimeout(1000);
 for(const pattern of patterns){
  await page.selectOption('#skill',pattern);
  await page.evaluate(()=>window.__bossSkills.advance(4.4));
  await page.screenshot({path:`artifacts/boss-${pattern}.png`,fullPage:true});
  console.log(pattern,await page.locator('#status').textContent());
 }
}
await browser.close();
