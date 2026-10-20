import { test, expect } from '@playwright/test';
import { normalizeGameSpeed } from '../src/quality';

test('speed defaults safely and cannot exceed ten', () => {
  for(const value of [undefined,null,'10',NaN,Infinity])expect(normalizeGameSpeed(value)).toBe(1);
  expect(normalizeGameSpeed(100)).toBe(10);expect(normalizeGameSpeed(-1)).toBe(1);
  expect(normalizeGameSpeed(7)).toBe(7);
});

test.beforeEach(async ({page})=>{
  await page.setViewportSize({width:844,height:390});
  await page.route('**/speed-harness*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';createUI(document.getElementById('app'));window.game=new Game();
  </script></body></html>`}));
  await page.goto('/speed-harness?world=fixed');await page.waitForFunction(()=>!!(window as any).game);
});

test('HUD cycles to 10x and settings expose all ten speeds and persist',async({page})=>{
  await page.locator('#start-fusion').click();
  for(const value of [2,3,5,10,1]){
    await page.locator('#game-speed').click();await expect(page.locator('#game-speed')).toHaveText(`${value}×`);
  }
  await page.locator('#settings').click();
  expect(await page.locator('#game-speed-setting option').count()).toBe(10);
  await page.locator('#game-speed-setting').selectOption('7');
  await page.locator('#close-settings').click();await page.locator('#resume').click();
  await expect(page.locator('#game-speed')).toHaveText('7×');
  await page.reload();await page.waitForFunction(()=>!!(window as any).game);
  await page.locator('#start-fusion').click();await expect(page.locator('#game-speed')).toHaveText('7×');
  await page.setViewportSize({width:568,height:320});
  const boxes=await page.locator('.hud-actions button').evaluateAll(elements=>elements.filter(e=>!(e as HTMLElement).hidden).map(e=>{const b=e.getBoundingClientRect();return{x:b.x,right:b.right,bottom:b.bottom};}));
  for(const b of boxes){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(568);expect(b.bottom).toBeLessThanOrEqual(320);}
  for(let i=1;i<boxes.length;i++)expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i-1].right);
});

test('10x advances the real fixed-step frame loop tenfold without enlarging collision steps',async({page})=>{
  await page.locator('#start-fusion').click();await page.evaluate(()=>(window as any).game.sleep());
  await page.keyboard.down('KeyD');
  const result=await page.evaluate(()=>{
    const g=(window as any).game;g.world.obstacles.length=0;
    const run=(speed:number,frames:number)=>{
      g.combat.reset();g.elapsed=0;g.run.waveElapsed=g.run.combatElapsed=0;g.run.spawnClock=999;g.run.pendingSwarm=0;
      g.position.set(0,0,0);g.previousPosition.copy(g.position);g.velocity.set(0,0);g.visualTime=0;
      g.preferences.gameSpeed=speed;g.accumulator=0;g.lastTime=g.renderTime=1000;
      for(let i=1;i<=frames;i++){g.frame(1000+i*1000/60);cancelAnimationFrame(g.frameId);g.frameId=0;}
      return{elapsed:g.elapsed,waveElapsed:g.run.waveElapsed,x:g.position.x,z:g.position.z};
    };
    const normal=run(1,60),fast=run(10,6);
    let ticks=0,maxStep=0;const original=g.step.bind(g);
    g.step=(dt:number)=>{ticks++;maxStep=Math.max(maxStep,dt);original(dt);};
    g.frame(g.lastTime+1000);g.sleep();
    return{normal,fast,ticks,maxStep};
  });
  await page.keyboard.up('KeyD');
  expect(Math.abs(result.normal.elapsed-result.fast.elapsed)).toBeLessThan(.02);
  expect(Math.hypot(result.normal.x-result.fast.x,result.normal.z-result.fast.z)).toBeLessThan(.1);
  expect(result.fast.elapsed).toBeGreaterThan(.95);expect(result.fast.waveElapsed).toBeGreaterThan(.95);
  expect(result.ticks).toBeLessThanOrEqual(50);expect(result.maxStep).toBe(1/60);
});

test('10x speeds battlefield rest but upgrades still freeze and shop time stays real',async({page})=>{
  await page.locator('#start-fusion').click();
  const result=await page.evaluate(()=>{
    const g=(window as any).game;g.sleep();g.preferences.gameSpeed=10;
    const frames=(count:number)=>{
      g.lastTime=g.renderTime=1000;g.accumulator=0;
      for(let i=1;i<=count;i++){g.frame(1000+i*1000/60);cancelAnimationFrame(g.frameId);g.frameId=0;}
    };
    for(const e of g.combat.enemies)e.active=false;for(const o of g.combat.orbs)o.active=false;
    g.run.waveIndex=1;g.run.waveElapsed=70;g.run.resolveBoundary(g.combat);g.syncRunPhase();frames(24);
    const nextWave=g.run.wave;
    g.combat.progression.gainExperience(8);frames(1);
    const paused=g.elapsed;frames(12);const upgrade={mode:g.mode,elapsed:g.elapsed,paused};
    while(g.mode==='upgrading')g.chooseUpgrade(g.combat.progression.offers[0]);g.sleep();
    g.run.waveIndex=4;g.run.waveElapsed=80;g.run.resolveBoundary(g.combat);g.syncRunPhase();g.run.updateRest(3.5,g.combat);g.syncRunPhase();g.sleep();
    const before=g.run.restElapsed;frames(6);
    return{nextWave,upgrade,shop:g.run.restElapsed-before,mode:g.mode};
  });
  expect(result.nextWave).toBe(3);expect(result.upgrade.mode).toBe('upgrading');expect(result.upgrade.elapsed).toBe(result.upgrade.paused);
  expect(result.mode).toBe('shop');expect(result.shop).toBeCloseTo(.1,2);
});
