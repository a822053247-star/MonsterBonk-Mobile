import {test,expect} from '@playwright/test';
import {synthesizeSound} from '../src/sound-design';
test('death cue has a clean bounded falling tail',()=>{
 const data=synthesizeSound('death',22050);expect(data.length).toBe(Math.ceil(.72*22050));
 expect(data.every(x=>Number.isFinite(x)&&Math.abs(x)<=1)).toBe(true);
 expect(data.some(x=>Math.abs(x)>.05)).toBe(true);expect(data[0]).toBe(0);expect(Math.abs(data.at(-1)!)).toBeLessThan(.001);
});
test('actual death settles once, finishes its cue after battle stops, and obeys mute',async({page})=>{
 await page.route('**/death-audio-harness',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><div id="app"></div><script type="module">import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';createUI(document.getElementById('app'));window.game=new Game();</script>`}));
 await page.goto('/death-audio-harness',{waitUntil:'domcontentloaded'});await page.locator('#start-fusion').click();
 await page.waitForFunction(()=>(window as any).game.audio.inspect().state==='running');
 await page.evaluate(()=>{const g=(window as any).game;g.combat.hp=0;g.endRun();g.endRun();});
 await expect.poll(()=>page.evaluate(()=>(window as any).game.audio.inspect().playedSounds.death??0)).toBe(1);
 expect(await page.evaluate(()=>(window as any).game.audio.inspect().active)).toBe(false);
 await expect.poll(()=>page.evaluate(()=>(window as any).game.audio.inspect().voices)).toBe(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).game.audio.inspect().state)).toBe('suspended');
 await page.locator('#gameover-restart').click();
 await page.evaluate(()=>{const g=(window as any).game;g.audio.configure(false,false);g.combat.hp=0;g.endRun();});
 await page.waitForTimeout(100);
 expect(await page.evaluate(()=>(window as any).game.audio.inspect().playedSounds.death)).toBe(1);
});
