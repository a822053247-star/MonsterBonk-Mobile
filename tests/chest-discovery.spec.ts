import {test,expect} from '@playwright/test';

test('local chest presets and the placement button use the same offscreen discovery as normal play',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:844,height:390});
  await page.route('**/local-chest-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();</script></body></html>`}));
  await page.goto('/local-chest-harness');await page.locator('#start-infinite').waitFor();
  const outside=()=>page.evaluate(()=>{
    const g=(window as any).game,e=g.exploration.event,v=g.cameraFootprint();
    return e?.kind==='sealed-chest'&&(Math.abs(e.x-v.x)>v.halfWidth+2.5||Math.abs(e.z-v.z)>v.halfDepth+2.5);
  });
  for(const id of ['sealed-chest','sealed-chest-low-health','event-lifecycle']){
    await page.evaluate(id=>(window as any).game.start('classic',true,false,'infinite',id),id);
    await expect(page.locator('#world-loading')).toBeHidden({timeout:20000});
    expect(await outside()).toBe(true);
    await expect(page.locator('.chest-guide')).toBeVisible();
    await expect(page.locator('#exploration-interact')).toBeHidden();
  }
  await page.evaluate(()=>(window as any).game.start('classic',true,false,'infinite','region-meadow-combat'));
  await expect(page.locator('#world-loading')).toBeHidden({timeout:20000});
  await page.locator('#feature-test-region-chest').click();
  expect(await outside()).toBe(true);await expect(page.locator('.chest-guide')).toBeVisible();
});

test('sealed chest guides discovery offscreen and explains its circle rule while opening',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:568,height:320});
  await page.route('**/chest-discovery-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();</script></body></html>`}));
  await page.goto('/chest-discovery-harness');await page.locator('#start-infinite').click();
  await expect(page.locator('#world-loading')).toBeHidden({timeout:20000});
  const placement=await page.evaluate(()=>{
    const g=(window as any).game;g.sleep();g.combat.clearWave();g.combat.automaticSpawning=false;
    g.combat.invulnerability=10000;g.run.prepare=()=>{};g.run.update=()=>{};
    for(const attack of g.combat.runBuild.attacks)attack.cooldown=10000;
    g.run.waveIndex=1;g.run.waveElapsed=8;g.welcome.hidden=true;
    const view=g.cameraFootprint();
    g.exploration.step(1/60,g.run,g.combat,g.position,[],true,view);g.syncExplorationView();
    const e=g.exploration.event;
    const outside=Math.abs(e.x-view.x)>view.halfWidth+2.5||Math.abs(e.z-view.z)>view.halfDepth+2.5;
    g.wake();return {outside,state:e.state};
  });
  expect(placement).toEqual({outside:true,state:'available'});
  const guide=page.locator('.chest-guide');await expect(guide).toBeVisible();
  await expect(guide).toContainText('封印宝箱');await expect(guide).toContainText('米');
  const bounds=await guide.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(568);
  await expect(page.locator('#exploration-controls')).toBeHidden();
  await page.locator('#pause').click();await expect(guide).toBeHidden();await page.locator('#resume').click();
  await page.evaluate(()=>{const g=(window as any).game,e=g.exploration.event;g.position.set(e.x,0,e.z);g.previousPosition.copy(g.position);});
  await expect(page.locator('#world-loading')).toBeHidden({timeout:15000});
  await expect(page.locator('#exploration-interact')).toBeVisible();await expect(guide).toBeHidden();
  await page.locator('#exploration-interact').click();
  await page.evaluate(()=>(window as any).game.exploration.event.arrivals=6);
  await expect(page.locator('#exploration-detail')).toContainText('打开宝箱仅剩');
  await expect(page.locator('#exploration-rule')).toHaveText('请留在蓝色圈内，出圈将中断开启');
  expect(await page.evaluate(()=>(window as any).game.explorationView.challengeRange.visible)).toBe(true);
  await page.evaluate(()=>{
    const g=(window as any).game,e=g.exploration.event;
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8,x=e.x+Math.cos(a)*6,z=e.z+Math.sin(a)*6;
      if(g.world.obstacles.every((o:any)=>Math.hypot(o.x-x,o.z-z)>o.radius+.5)){g.position.set(x,0,z);g.previousPosition.copy(g.position);break;}
    }
  });
  await expect(page.locator('#exploration-rule')).toHaveText('即将出圈！请回到宝箱附近');
  await page.evaluate(()=>{
    const g=(window as any).game,e=g.exploration.event;
    g.exploration.step(1/60,g.run,g.combat,{x:e.x+7.1,z:e.z},[],false);g.syncExplorationView();g.updateHUD();
  });
  await expect(page.locator('#exploration-controls')).toBeHidden();await expect(guide).toBeHidden();
  expect(await page.evaluate(()=>(window as any).game.exploration.event.state)).toBe('abandoned');
  expect(await page.evaluate(()=>(window as any).game.explorationView.challengeRange.visible)).toBe(false);
});
