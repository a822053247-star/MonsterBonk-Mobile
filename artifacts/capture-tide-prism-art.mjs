import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const directory='artifacts/content-factory/new-card-art';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
 await page.route('**/src/main.ts*',async route=>{
  const response=await route.fetch();const source=await response.text();
  await route.fulfill({response,body:source.replace('const game = new Game();','const game = window.__captureGame = new Game();')});
 });
 await page.goto('http://127.0.0.1:5173/?world=fixed');await page.locator('#start-fusion').click();
 await page.evaluate(()=>{
  const g=window.__captureGame;g.sleep();g.wake=()=>{};const c=g.combat;
  for(let seed=1;seed<500;seed++){
   c.reset();c.grantUpgrade('bubble-weapon');c.grantUpgrade('area');
   let state=seed;c.progression.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
   c.progression.gainExperience(c.progression.threshold);
   if(c.progression.offers.includes('tide-prism'))break;
  }
  g.openUpgrade();g.updateHUD();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);
 });
 await page.waitForFunction(()=>{
  const image=document.querySelector('[data-skill="tide-prism"] .skill-illustration');
  return image?.complete&&image.naturalWidth>0&&image.src.endsWith('/relics/tide-prism.png');
 });
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#upgrade-screen img')].map(i=>i.decode().catch(()=>{})))});
 await page.screenshot({path:`${directory}/upgrade-844.png`});
 await page.setViewportSize({width:568,height:320});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:`${directory}/upgrade-568.png`});
 console.log('Screenshots saved:',`${directory}/upgrade-844.png`,`${directory}/upgrade-568.png`);
}finally{await browser.close()}

