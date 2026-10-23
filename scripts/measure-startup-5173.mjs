import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
const samples=[];
async function measure(context,label){
 const page=await context.newPage();
 try {
  await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
  await page.locator('#start-fusion').waitFor({state:'visible'});
  const menuMs=await page.evaluate(()=>Math.round(performance.now()));
  await page.evaluate(()=>{
   window.__startupSample={click:0,ready:0};
   document.getElementById('start-fusion').addEventListener('click',()=>{
    window.__startupSample.click=performance.now();
    const check=()=>{
     if(!document.getElementById('world-loading').hidden||document.getElementById('hud').hidden){requestAnimationFrame(check);return;}
     window.__startupSample.ready=performance.now();
    };requestAnimationFrame(check);
   },{capture:true,once:true});
  });
  await page.locator('#start-fusion').click();
  await page.waitForFunction(()=>window.__startupSample.ready>0,null,{timeout:60000});
  const result=await page.evaluate(()=>({prepareMs:Math.round(window.__startupSample.ready-window.__startupSample.click),openToReadyMs:Math.round(window.__startupSample.ready),assetRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/')).length}));
  const row={label,menuMs,...result};samples.push(row);console.log(JSON.stringify(row));
 }finally{await page.close();}
}
try{
 for(let i=1;i<=3;i++){
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await measure(context,'cold-'+i);await context.close();
 }
 const context=await browser.newContext({viewport:{width:1280,height:720}});
 await measure(context,'cache-seed');
 for(let i=1;i<=3;i++)await measure(context,'warm-'+i);
 await context.close();
 await mkdir('artifacts/startup-timing',{recursive:true});
 await writeFile('artifacts/startup-timing/results-5173.json',JSON.stringify({url:'http://localhost:5173/',browser:'Chromium headless, SwiftShader',viewport:'1280x720',samples},null,2));
}finally{await browser.close();}
