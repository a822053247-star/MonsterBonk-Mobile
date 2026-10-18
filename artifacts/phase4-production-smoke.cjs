const {chromium,webkit}=require('@playwright/test');
const fs=require('node:fs/promises');
(async()=>{
  const results=[];
  for(const name of ['chromium','webkit']){
    const browser=await (name==='chromium'?chromium:webkit).launch(name==='chromium'?{args:['--enable-unsafe-swiftshader']}:{});
    const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/');await page.locator('#start').waitFor({state:'visible'});
    const diagnosticsAbsent=await page.evaluate(()=>!('__monsterbonk' in window));
    if(!diagnosticsAbsent)throw Error('Development diagnostics leaked into production');
    if(name==='chromium')await page.screenshot({path:'artifacts/phase4-production-menu.png'});
    await page.locator('#start').tap();
    await page.waitForFunction(()=>Number(document.getElementById('kill-value').textContent)>0,{},{timeout:20000});
    await page.keyboard.down('d');await page.waitForTimeout(550);await page.keyboard.up('d');
    await page.keyboard.press('Space');await page.locator('#jump').tap();
    if(name==='chromium')await page.screenshot({path:'artifacts/phase4-production-gameplay.png'});
    await page.locator('#settings').tap();await page.locator('#quality').selectOption('battery');
    await page.getByRole('switch',{name:'背景音乐',exact:true}).uncheck();
    await page.getByRole('switch',{name:'游戏音效',exact:true}).uncheck();
    await page.locator('#save-settings').tap();
    if(!await page.locator('#pause-screen').isVisible())throw Error('Settings did not return to pause');
    const before=await page.locator('#timer').textContent();await page.waitForTimeout(250);
    if(before!==await page.locator('#timer').textContent())throw Error('Paused timer advanced');
    await page.locator('#restart').tap();
    const result={browser:name,diagnosticsAbsent,health:await page.locator('#health-value').textContent(),xp:await page.locator('#xp-progress').textContent(),kills:await page.locator('#kill-value').textContent(),preferences:await page.evaluate(()=>JSON.parse(localStorage.getItem('monsterbonk-settings'))),errorScreen:await page.locator('#error-screen').isVisible(),errors};
    if(result.health!=='100 / 100'||result.xp!=='0 / 8'||result.kills!=='0'||errors.length||result.errorScreen)throw Error(JSON.stringify(result));
    results.push(result);await browser.close();
  }
  await fs.writeFile('artifacts/phase4-production-smoke.json',JSON.stringify({environment:'Windows desktop Playwright; no physical phone FPS measurement',results},null,2));
  console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1});
