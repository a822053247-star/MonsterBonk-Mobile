// Visual capture of the production card/shop renderers; no test runner or combat simulation.
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
 page.on('pageerror',e=>console.log('PAGE:',e.message));
 await page.route('**/endless-icon-capture',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><meta charset="utf-8"><div id="app"></div><script type="module">
 import '/src/style.css';import {createUI,renderUpgradeCards,renderRunShop} from '/src/ui.ts';
 import {Combat} from '/src/combat.ts';import {PartySystem} from '/src/party.ts';import {RunFlow} from '/src/run-flow.ts';import {RunShop} from '/src/shop.ts';
 createUI(document.getElementById('app'));const c=new Combat();c.party=new PartySystem();c.fusionEnabled=true;c.reset();c.progression.endless=true;c.grantUpgrade('multishot');c.grantUpgrade('multishot');
 document.getElementById('welcome').hidden=true;
 window.showCards=ids=>{const p=c.progression;p.currentOffers=ids;p.pendingChoices=1;renderUpgradeCards(p,1);document.getElementById('shop-screen').hidden=true;document.getElementById('upgrade-screen').hidden=false;};
 window.showShop=()=>{c.progression.pendingChoices=0;c.hp=65;const run=new RunFlow(()=>.5,'endless');run.waveIndex=4;run.coins=200;run.shop=new RunShop(c,1,()=>.5,0,0);renderRunShop(run,c);document.getElementById('upgrade-screen').hidden=true;document.getElementById('shop-screen').hidden=false;};
 </script></html>`}));
 await page.goto('http://127.0.0.1:5185/endless-icon-capture',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.showCards);
 let group=0;
 for(const ids of [['steady-cannon','fleet-contract','far-lens'],['heavy-ammo','last-stand','elite-hunter']]){
  await page.evaluate(ids=>window.showCards(ids),ids);
  await page.waitForFunction(()=>[...document.querySelectorAll('#upgrade-cards img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('#upgrade-cards').screenshot({path:`artifacts/endless-icons-cards-${++group}.png`});
 }
 await page.evaluate(()=>window.showShop());
 await page.locator('.shop-item[data-kind="contract"]').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('#shop-items img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:'artifacts/endless-icons-shop.png'});
 console.log('Captured two upgrade-card groups and the Endless shop.');
}finally{await browser.close();}
