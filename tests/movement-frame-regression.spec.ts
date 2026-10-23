import {test,expect} from '@playwright/test';
test('held keyboard directions and joystick survive successive gameplay frames',async({page})=>{
 await page.route('**/movement-regression*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><div id="app"></div><script type="module">import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';createUI(document.getElementById('app'));window.game=new Game();</script>`}));
 await page.goto('/movement-regression?world=fixed');await page.locator('#start-fusion').click();
 await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.wake=()=>{};g.combat.automaticSpawning=false;});
 await page.waitForFunction(()=>{const g=(window as any).game;return g.world.sampleActive&&g.partyView.startupSettled&&g.combatView.startupSettled},null,{timeout:60000});
 await page.evaluate(()=>{const g=(window as any).game;g.startupPending=false;g.mode='playing';g.input.setEnabled(true);document.getElementById('world-loading')!.hidden=true;});
 for(const [key,x,y] of [['ArrowUp',0,-1],['ArrowDown',0,1],['ArrowLeft',-1,0],['ArrowRight',1,0],['w',0,-1],['s',0,1],['a',-1,0],['d',1,0]] as const){
 await page.keyboard.down(key);
 expect(await page.evaluate(()=>({...((window as any).game.input.sample())}))).toEqual({x,y});
 const beforePosition=await page.evaluate(()=>{const p=(window as any).game.position;return {x:p.x,z:p.z};});
 await page.evaluate(()=>{const g=(window as any).game;g.renderTime=performance.now()+10000;g.lastTime=performance.now();g.frame(g.lastTime+17);g.sleep();});
 expect(await page.evaluate(()=>({...((window as any).game.input.sample())}))).toEqual({x,y});
 const afterPosition=await page.evaluate(()=>{const p=(window as any).game.position;return {x:p.x,z:p.z};});
 expect(Math.hypot(afterPosition.x-beforePosition.x,afterPosition.z-beforePosition.z)).toBeGreaterThan(.001);
 await page.keyboard.up(key);
 }
 // A real captured pointer must remain held across gameplay frames too.
 const box=await page.locator('#joystick').boundingBox();expect(box).not.toBeNull();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();
 await page.mouse.move(box!.x+box!.width*.85,box!.y+box!.height/2);
 expect(await page.evaluate(()=>(window as any).game.input.sample().x)).toBeGreaterThan(.8);
 await page.evaluate(()=>{const g=(window as any).game;g.renderTime=performance.now()+10000;g.lastTime=performance.now();g.frame(g.lastTime+17);g.sleep();});
 expect(await page.evaluate(()=>(window as any).game.input.sample().x)).toBeGreaterThan(.8);
 await page.mouse.up();
 expect(await page.evaluate(()=>({...((window as any).game.input.sample())}))).toEqual({x:0,y:0});
 // Disabling for a modal still clears held input, and re-enabling accepts fresh input.
 await page.keyboard.down('ArrowRight');
 await page.evaluate(()=>{const input=(window as any).game.input;input.setEnabled(false);input.setEnabled(true);});
 expect(await page.evaluate(()=>({...((window as any).game.input.sample())}))).toEqual({x:0,y:0});
 await page.keyboard.up('ArrowRight');await page.keyboard.down('ArrowRight');
 expect(await page.evaluate(()=>(window as any).game.input.sample().x)).toBe(1);await page.keyboard.up('ArrowRight');
});
