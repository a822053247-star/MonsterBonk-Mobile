import{chromium}from'@playwright/test';
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
try{for(const rate of [1,4,6]){
const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});
await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});await page.locator('#start-fusion').waitFor();
await page.evaluate(()=>{window.__s=0;document.getElementById('start-fusion').addEventListener('click',()=>window.__s=performance.now(),{once:true,capture:true});});
await page.locator('#start-fusion').click();await page.waitForFunction(()=>!document.getElementById('world-loading').hidden===false&&!document.getElementById('hud').hidden,null,{timeout:60000});
const overlayMs=await page.evaluate(()=>performance.now()-window.__s);
await page.screenshot({path:`artifacts/startup-timing/paint-cpu-${rate}.png`});
const paintedMs=await page.evaluate(()=>performance.now()-window.__s);
console.log(JSON.stringify({rate,overlayMs:Math.round(overlayMs),screenshotConfirmedMs:Math.round(paintedMs)}));await context.close();
}}finally{await browser.close();}
