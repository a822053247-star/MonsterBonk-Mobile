// Visual fixtures use the real renderers; these are not reward-roll or gameplay tests.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='artifacts/unified-cards';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const groups=[['damage','range','multishot'],['steady-cannon','fleet-contract','far-lens'],['heavy-ammo','last-stand','elite-hunter'],['thunder-bud-weapon','shatter-ring','glacier-trail'],['mirror-prism','tide-prism','back-mirror'],['split-on-hit','chain','draft-boiling-core'],['azure-burst','returning-ring','ice-radiance'],['tsunami-sanctuary','all-tides','frost-prism'],['steam-comet-weapon','bramble-tide-weapon','blazing-thorn-weapon']];
const log=[];
try{
 const page=await browser.newPage({reducedMotion:'reduce'});
 page.on('pageerror',e=>console.log('PAGE:',e.message));
 await page.route('**/unified-card-capture',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
 import '/src/style.css';import {createUI,renderUpgradeCards,renderRunShop} from '/src/ui.ts';
 import {Combat} from '/src/combat.ts';import {PartySystem} from '/src/party.ts';import {RunShop} from '/src/shop.ts';import {RunFlow} from '/src/run-flow.ts';
 createUI(document.getElementById('app'));const c=new Combat();c.party=new PartySystem();c.fusionEnabled=true;c.reset();c.progression.endless=true;
 // Deliberately expose the catalogue for visual placement, regardless of prerequisites.
 const p=c.progression;c.grantUpgrade('bubble-weapon');c.grantUpgrade('leaf-weapon');Object.defineProperty(p,'skills',{get:()=>p.pool});
 document.getElementById('welcome').hidden=true;
 window.showCards=ids=>{p.currentOffers=ids;p.pendingChoices=1;renderUpgradeCards(p,1);document.getElementById('shop-screen').hidden=true;document.getElementById('upgrade-screen').hidden=false;document.getElementById('upgrade-cards').scrollTop=0;};
 window.showShop=()=>{p.pendingChoices=0;c.hp=65;const run=new RunFlow(()=>.5,'endless');run.waveIndex=4;run.coins=200;run.shop=new RunShop(c,1,()=>.5,0,0);renderRunShop(run,c);document.getElementById('upgrade-screen').hidden=true;document.getElementById('shop-screen').hidden=false;};
 </script></html>`}));
 await page.goto('http://127.0.0.1:5185/unified-card-capture',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.showCards);await page.evaluate(()=>document.fonts.ready);
 for(const [width,height] of [[1280,800],[844,390],[568,320]]){
  await page.setViewportSize({width,height});
  const selected=width===1280?groups:[groups[1],groups[3],groups[5]];
  for(let index=0;index<selected.length;index++){
   await page.evaluate(ids=>window.showCards(ids),selected[index]);
   await page.waitForFunction(()=>[...document.querySelectorAll('#upgrade-cards img')].every(i=>i.complete));
   await page.screenshot({path:output+'/cards-'+width+'-'+index+'.png'});
   log.push({width,ids:selected[index],cards:await page.locator('.skill-card').evaluateAll(cards=>cards.map(card=>{
    const c=card.getBoundingClientRect(),a=card.querySelector('.skill-emblem').getBoundingClientRect();
    return {id:card.dataset.skill,stage:{x:(a.x-c.x)/c.width,y:(a.y-c.y)/c.height,width:a.width/c.width,height:a.height/c.height},images:[...card.querySelectorAll('.skill-illustration')].map(i=>({src:i.getAttribute('src'),loaded:i.naturalWidth>0})),text:card.querySelector('.skill-benefit').textContent};
   }))});
  }
  await page.evaluate(()=>window.showShop());
  await page.locator('.shop-item[data-kind="contract"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('#shop-items img')].every(i=>i.complete));
  await page.screenshot({path:output+'/shop-'+width+'.png'});
  console.log('Rendered',width,'x',height);
 }
 await writeFile(output+'/layout.json',JSON.stringify(log,null,2));
}finally{await browser.close();}
