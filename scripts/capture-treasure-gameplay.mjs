import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts/treasure-gameplay',{recursive:true});
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.route('**/treasure-gameplay-preview*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><meta charset="utf-8"><div id="app"></div><script type="module">import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';createUI(document.getElementById('app'));window.game=new Game();</script></html>`}));
 await page.goto('http://127.0.0.1:5175/treasure-gameplay-preview?world=fixed');
 await page.locator('#start-fusion').click();
 await page.evaluate(()=>{const g=window.game;g.sleep();g.wake=()=>{};g.combat.automaticSpawning=false;});
 await page.waitForFunction(()=>{const g=window.game;return g.world.sampleActive&&g.partyView.startupSettled&&g.combatView.startupSettled},null,{timeout:60000});
 await page.evaluate(()=>{
 const g=window.game,c=g.combat;c.clearWave();c.encounters.beginWave(2);g.position.set(0,0,0);g.previousPosition.copy(g.position);g.party.syncLeader(g.position,0);
 c.random=()=>.99;const e=c.spawn('draft-treasure-runner',2,1,0);e.spawnTime=0;c.damageEnemy(e,100000,0,0);
 const event=c.treasureRewards.find(e=>e.active);event.age=0;
 window.drawChestGame=()=>{document.getElementById('world-loading').hidden=true;document.getElementById('welcome').hidden=true;g.placeCamera(true);g.partyView.render(1,0);g.monster.root.visible=!g.partyView.hasPixelLeader;g.updateHUD();g.combatView.render(1,0,g.position);g.renderer.render(g.scene,g.camera);};
 window.drawChestGame();g.treasureDialog.sync();
 });
 await page.waitForTimeout(800);
 for (const [width,height] of [[1280,720],[844,390]]) {
 await page.setViewportSize({width,height});await page.evaluate(()=>window.drawChestGame());await page.waitForTimeout(250);await page.evaluate(()=>window.drawChestGame());
 await page.screenshot({path:`artifacts/treasure-gameplay/dialog-${width}.png`});
 }
 const frozen = await page.evaluate(()=>{const g=window.game;const before=g.combat.elapsed;for(let i=0;i<120;i++)g.step(1/60);return g.combat.elapsed===before});
 if(!frozen)throw new Error('Combat advanced while chest dialog was open');
 await page.locator('.treasure-dialog-button').click();
 await page.waitForTimeout(1100);
 await page.screenshot({path:'artifacts/treasure-gameplay/dialog-burst-844.png'});
 await page.waitForFunction(()=>document.querySelector('.treasure-dialog-button').textContent==='继续战斗',null,{timeout:30000});
 await page.screenshot({path:'artifacts/treasure-gameplay/dialog-result-844.png'});
 const audioCount=await page.evaluate(()=>window.game.audio.inspect().treasurePlayed);if(audioCount<3)throw new Error('Treasure audio did not play');
 await page.locator('.treasure-dialog-button').click();
 if(await page.locator('.treasure-dialog').isVisible())throw new Error('Dialog did not close');
 if(await page.evaluate(()=>window.game.combat.treasureRewards.some(e=>e.active)))throw new Error('Reward event not consumed');
 console.log('Saved actual game chest dialog screenshots; freeze and continuation passed');
} finally {await browser.close();}

