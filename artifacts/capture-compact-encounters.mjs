import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='artifacts/compact-encounters';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const records=[];
try {
 for(const [rank,wave,seconds] of [['elite',4,2.25],['boss',6,.45]]){
  const page=await browser.newPage({viewport:{width:1024,height:472},deviceScaleFactor:2});
  page.on('pageerror',error=>console.log('Page:',error.message));
  page.on('requestfailed',request=>console.log('Resource:',request.url(),request.failure()?.errorText));
  await page.route('**/src/main.ts*',async route=>{
   const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = window.__captureGame = new Game();')});
  });
  await page.goto('http://127.0.0.1:5173/?world=fixed',{waitUntil:'domcontentloaded'});await page.locator('#start-fusion').click();console.log('Scene started:',rank);
  await page.evaluate(({rank,wave,seconds})=>{
   const g=window.__captureGame;g.sleep();g.wake=()=>{};
   const c=g.combat;c.reset();c.automaticSpawning=false;c.invulnerability=1000;
   g.position.set(0,0,0);g.previousPosition.copy(g.position);g.run.waveIndex=wave-1;g.run.waveElapsed=18;
   g.run.combatElapsed=wave===4?228:383;g.run.coins=wave===4?115:225;
   g.run.prepare(c,g.position);
   const enemy=rank==='boss'?c.encounters.boss:c.encounters.elite;
   enemy.x=enemy.previousX=rank==='boss'?6:4.8;enemy.z=enemy.previousZ=-1.5;enemy.spawnTime=0;
   for(const [kind,x,z] of [['normal',-6,-2],['fast',7,4],['tank',-5,5]])c.spawn(kind,x,z,0);
   for(let i=0;i<Math.round(seconds*60);i++)g.step(1/60);
   g.visualTime=c.elapsed;g.welcome.hidden=true;
   g.updateHUD();g.placeCamera(true);g.partyView.render(1,g.visualTime);
   g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);
  },{rank,wave,seconds});
  await page.waitForFunction(()=>window.__captureGame.combatView.inspect().encounters.boss?.atlases.every(a=>a.loaded||a.failed)??true);
  await page.evaluate(async()=>{
   await document.fonts.ready;const g=window.__captureGame;
   g.combatView.render(1,g.visualTime,g.position);g.partyView.render(1,g.visualTime);g.renderer.render(g.scene,g.camera);
  });
  const file=`${directory}/wave-${wave}-${rank}-1024.png`;
  await page.screenshot({path:file});
  records.push(await page.evaluate(({rank,file})=>{
   const g=window.__captureGame,r=document.querySelector('#encounter-status').getBoundingClientRect();
   return {rank,file,wave:g.run.wave,hud:{x:r.x,y:r.y,width:r.width,height:r.height},name:document.querySelector('#encounter-name').textContent,visual:g.combatView.inspect().encounters};
  },{rank,file}));
  await page.close();
 }
 await writeFile(`${directory}/capture.json`,JSON.stringify(records,null,2));console.log(JSON.stringify(records.map(({rank,file,wave,hud})=>({rank,file,wave,hud}))));
}finally {await browser.close()}
