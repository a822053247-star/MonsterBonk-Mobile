const {chromium,webkit}=require('@playwright/test');const fs=require('node:fs/promises');
(async()=>{const results=[];for(const name of ['chromium','webkit']){
 const browser=await(name==='chromium'?chromium:webkit).launch(name==='chromium'?{args:['--enable-unsafe-swiftshader']}:{});
 try{const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=page.waitForResponse(r=>r.url().endsWith('/yanrong-repaired.glb'));await page.goto('http://127.0.0.1:4173/');const asset=await response;await asset.finished();
 await page.waitForTimeout(300);const diagnosticsAbsent=await page.evaluate(()=>!('__monsterbonk' in window));
 if(name==='chromium')await page.screenshot({path:'artifacts/fox-production-menu.png'});
 await page.locator('#start-trial').tap();await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');await page.locator('#dash').tap();
 await page.waitForFunction(()=>Number(document.getElementById('kill-value').textContent)>0,{},{timeout:20000});
 await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('welcome')).opacity)<.01);
 if(name==='chromium')await page.screenshot({path:'artifacts/fox-production-playing.png'});
 await page.locator('#pause').tap();const timer=await page.locator('#timer').textContent();await page.waitForTimeout(200);if(timer!==await page.locator('#timer').textContent())throw Error('Pause failed');
 await page.locator('#restart').tap();if(await page.locator('#kill-value').textContent()!=='0')throw Error('Reset failed');
 const result={browser:name,assetStatus:asset.status(),diagnosticsAbsent,autoKillObserved:true,trialRestart:true,errorScreen:await page.locator('#error-screen').isVisible(),errors};
 if(result.assetStatus!==200||!diagnosticsAbsent||result.errorScreen||errors.length)throw Error(JSON.stringify(result));results.push(result);
 }finally{await browser.close()}}
 await fs.writeFile('artifacts/fox-production-smoke.json',JSON.stringify({environment:'Windows desktop Playwright, 844x390 simulated phone; no physical phone FPS test',results},null,2));console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1});
